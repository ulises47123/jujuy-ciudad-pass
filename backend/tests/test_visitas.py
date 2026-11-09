from datetime import timedelta

import pytest
from sqlalchemy import select, update

from app import tiempo
from app.modelos import Alerta, IntentoVisita, MovimientoPuntos, Temporada, Usuario, Visita
from conftest import (
    LAT0,
    LON0,
    crear_lugar,
    crear_usuario,
    cuerpo_iniciar,
    desplazar,
    error,
    login_app,
    muestra_unica,
    muestras,
    responder_correcto,
    responder_incorrecto,
)

API = "/api/v1"


@pytest.fixture
def turista(client):
    t = crear_usuario("turista")
    return t, login_app(client, t.email)


def iniciar(client, h, lugar_id, **kw):
    return client.post(f"{API}/visitas/iniciar", headers=h, json=cuerpo_iniciar(lugar_id, **kw))


def alertas(sesion, tipo):
    sesion.expire_all()
    return sesion.execute(select(Alerta).where(Alerta.tipo == tipo)).scalars().all()


# ------------------------------------------------------------------ lugares
def test_lugares_solo_activos_con_preguntas(client, turista):
    _, h = turista
    ok = crear_lugar(nombre="A visible")
    crear_lugar(nombre="B inactivo", activo=False)
    crear_lugar(nombre="C sin preguntas", preguntas=0)
    r = client.get(f"{API}/lugares", headers=h)
    assert r.status_code == 200
    assert [l["id"] for l in r.json()] == [ok.id]
    lugar = r.json()[0]
    assert set(lugar) == {"id", "nombre", "descripcion", "direccion", "categoria", "latitud", "longitud", "radio_m",
                          "puntos", "visitado"}
    assert lugar["visitado"] is False
    assert "correcta" not in r.text


def test_flujo_completo_visita(client, turista, sesion):
    t, h = turista
    lugar = crear_lugar(puntos=50, preguntas=2)
    r = iniciar(client, h, lugar.id)
    assert r.status_code == 200, r.text
    intento = r.json()
    assert set(intento) == {"intento_id", "pregunta", "opciones", "expira_en_s"}
    assert sorted(intento["opciones"]) == ["Correcta", "Mala A", "Mala B"]
    assert 115 <= intento["expira_en_s"] <= 120
    assert "correcta" not in r.text.replace("Correcta", "")
    r = responder_correcto(client, h, intento)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["correcta"] is True and d["puntos_ganados"] == 50 and d["puntos"] == 50
    assert d["puntos_historicos"] == 50 and d["rango"] == "Novato"
    # visitado y mis visitas
    assert client.get(f"{API}/lugares", headers=h).json()[0]["visitado"] is True
    mias = client.get(f"{API}/visitas/mias", headers=h).json()
    assert mias[0]["lugar_id"] == lugar.id and mias[0]["puntos"] == 50 and mias[0]["fecha"].endswith("Z")
    # movimiento registrado
    mov = sesion.execute(select(MovimientoPuntos).where(MovimientoPuntos.usuario_id == t.id)).scalars().all()
    assert [(m.delta, m.tipo) for m in mov] == [(50, "VISITA")]
    # el intento no se puede reutilizar
    r = responder_correcto(client, h, intento)
    assert r.status_code == 409 and error(r) == "INTENTO_USADO"


def test_orden_barajado_se_respeta(client, turista):
    _, h = turista
    lugar = crear_lugar()
    vistos = set()
    for _ in range(12):
        t2 = crear_usuario("turista")
        h2 = login_app(client, t2.email)
        intento = iniciar(client, h2, lugar.id).json()
        vistos.add(tuple(intento["opciones"]))
        assert responder_correcto(client, h2, intento).json()["correcta"] is True
    assert len(vistos) > 1  # se barajan


def test_rango_sube_a_explorador_y_maestro(client, turista):
    _, h = turista
    l1 = crear_lugar(puntos=160)
    intento = iniciar(client, h, l1.id).json()
    assert responder_correcto(client, h, intento).json()["rango"] == "Explorador"
    lat, lon = desplazar(LAT0, LON0, norte_m=110)
    l2 = crear_lugar(lat=lat, lon=lon, puntos=200)
    intento = iniciar(client, h, l2.id, lat=lat, lon=lon).json()
    d = responder_correcto(client, h, intento, lat, lon).json()
    assert d["puntos_historicos"] == 360 and d["rango"] == "Maestro Andino"


# ------------------------------------------------------------------ reglas anti-trampa
def test_ubicacion_mock(client, turista, sesion):
    t, h = turista
    lugar = crear_lugar()
    reloj, lista = muestras()
    lista[1]["mock"] = True
    r = client.post(f"{API}/visitas/iniciar", headers=h, json={"lugar_id": lugar.id, "reloj_ms": reloj,
                                                               "muestras": lista})
    assert r.status_code == 403 and error(r) == "UBICACION_FALSA"
    a = alertas(sesion, "UBICACION_FALSA")
    assert len(a) == 1 and a[0].usuario_id == t.id


def test_precision_insuficiente(client, turista):
    _, h = turista
    lugar = crear_lugar()
    r = iniciar(client, h, lugar.id, precision=80)
    assert r.status_code == 422 and error(r) == "PRECISION_INSUFICIENTE"
    assert r.json()["error"]["datos"]["precision_m"] == 80
    # mediana: una sola muestra mala no alcanza para rechazar
    reloj, lista = muestras(n=3, precision=10)
    lista[0]["precision_m"] = 500
    r = client.post(f"{API}/visitas/iniciar", headers=h, json={"lugar_id": lugar.id, "reloj_ms": reloj,
                                                               "muestras": lista})
    assert r.status_code == 200


def test_fuera_de_rango(client, turista):
    _, h = turista
    lugar = crear_lugar(radio_m=100)
    lat, lon = desplazar(LAT0, LON0, norte_m=300)
    r = iniciar(client, h, lugar.id, lat=lat, lon=lon)
    assert r.status_code == 403 and error(r) == "FUERA_DE_RANGO"
    datos = r.json()["error"]["datos"]
    assert datos["radio_m"] == 100 and 290 <= datos["distancia_m"] <= 310


def test_fuera_de_rango_si_una_sola_muestra_esta_lejos(client, turista):
    _, h = turista
    lugar = crear_lugar(radio_m=100)
    reloj, lista = muestras()
    lista[2]["lat"], lista[2]["lon"] = desplazar(LAT0, LON0, este_m=150)
    r = client.post(f"{API}/visitas/iniciar", headers=h, json={"lugar_id": lugar.id, "reloj_ms": reloj,
                                                               "muestras": lista})
    assert r.status_code == 403 and error(r) == "FUERA_DE_RANGO"


@pytest.mark.parametrize("caso", ["pocas", "muchas", "desordenadas", "poco_tiempo", "repetido"])
def test_muestras_invalidas(client, turista, caso):
    _, h = turista
    lugar = crear_lugar()
    if caso == "pocas":
        reloj, lista = muestras(n=2, separacion_ms=6000)
    elif caso == "muchas":
        reloj, lista = muestras(n=11, separacion_ms=1000)
    elif caso == "desordenadas":
        reloj, lista = muestras(n=3)
        lista[0], lista[1] = lista[1], lista[0]
    elif caso == "poco_tiempo":
        reloj, lista = muestras(n=3, separacion_ms=2000)  # 4 s en total
    else:
        reloj, lista = muestras(n=3)
        lista[1]["tiempo_ms"] = lista[0]["tiempo_ms"]
    r = client.post(f"{API}/visitas/iniciar", headers=h, json={"lugar_id": lugar.id, "reloj_ms": reloj,
                                                               "muestras": lista})
    assert r.status_code == 422 and error(r) == "MUESTRAS_INVALIDAS", r.text


def test_muestras_formato_invalido_es_datos_invalidos(client, turista):
    _, h = turista
    lugar = crear_lugar()
    reloj, lista = muestras()
    lista[0]["lat"] = 200
    r = client.post(f"{API}/visitas/iniciar", headers=h, json={"lugar_id": lugar.id, "reloj_ms": reloj,
                                                               "muestras": lista})
    assert r.status_code == 422 and error(r) == "DATOS_INVALIDOS"


def test_muestras_viejas(client, turista):
    _, h = turista
    lugar = crear_lugar()
    reloj, lista = muestras()
    for m in lista:
        m["tiempo_ms"] -= 70_000
    r = client.post(f"{API}/visitas/iniciar", headers=h, json={"lugar_id": lugar.id, "reloj_ms": reloj,
                                                               "muestras": lista})
    assert r.status_code == 422 and error(r) == "MUESTRAS_INVALIDAS"


def test_muestras_en_el_futuro(client, turista):
    _, h = turista
    lugar = crear_lugar()
    reloj, lista = muestras()
    for m in lista:
        m["tiempo_ms"] += 30_000
    r = client.post(f"{API}/visitas/iniciar", headers=h, json={"lugar_id": lugar.id, "reloj_ms": reloj,
                                                               "muestras": lista})
    assert r.status_code == 422 and error(r) == "MUESTRAS_INVALIDAS"


def test_desfase_de_reloj_se_corrige(client, turista):
    """Un teléfono con la hora corrida 2 horas funciona: se corrige con reloj_ms."""
    _, h = turista
    lugar = crear_lugar()
    r = iniciar(client, h, lugar.id, desfase_ms=2 * 3600 * 1000)
    assert r.status_code == 200, r.text
    intento = r.json()
    # responder sin reloj_ms: se usa el desfase guardado en el intento
    m = muestra_unica()
    m["tiempo_ms"] -= 2 * 3600 * 1000
    r = client.post(f"{API}/visitas/responder", headers=h, json={
        "intento_id": intento["intento_id"], "opcion_index": intento["opciones"].index("Correcta"), "muestra": m})
    assert r.status_code == 200 and r.json()["correcta"] is True


def test_desfase_de_reloj_muestras_que_no_coinciden_con_su_reloj(client, turista):
    """Si las muestras usan la hora real pero el reloj declarado está corrido, la antigüedad no cuadra."""
    _, h = turista
    lugar = crear_lugar()
    reloj, lista = muestras()
    r = client.post(f"{API}/visitas/iniciar", headers=h, json={"lugar_id": lugar.id,
                                                               "reloj_ms": reloj + 5 * 60 * 1000, "muestras": lista})
    assert r.status_code == 422 and error(r) == "MUESTRAS_INVALIDAS"


def test_viaje_imposible(client, turista, sesion):
    t, h = turista
    l1 = crear_lugar()
    lat2, lon2 = desplazar(LAT0, LON0, norte_m=3000)
    l2 = crear_lugar(lat=lat2, lon=lon2)
    intento = iniciar(client, h, l1.id).json()
    assert responder_correcto(client, h, intento).json()["correcta"] is True
    r = iniciar(client, h, l2.id, lat=lat2, lon=lon2)
    assert r.status_code == 403 and error(r) == "VIAJE_IMPOSIBLE"
    assert r.json()["error"]["datos"]["velocidad_kmh"] > 200
    assert len(alertas(sesion, "VIAJE_IMPOSIBLE")) == 1


def test_viaje_posible_si_paso_el_tiempo(client, turista, sesion):
    t, h = turista
    l1 = crear_lugar()
    lat2, lon2 = desplazar(LAT0, LON0, norte_m=3000)
    l2 = crear_lugar(lat=lat2, lon=lon2)
    intento = iniciar(client, h, l1.id).json()
    responder_correcto(client, h, intento)
    hace = tiempo.ahora() - timedelta(minutes=20)
    sesion.execute(update(IntentoVisita).values(fecha_ubicacion=hace))
    sesion.commit()
    assert iniciar(client, h, l2.id, lat=lat2, lon=lon2).status_code == 200


def test_ya_visitado(client, turista):
    _, h = turista
    lugar = crear_lugar()
    intento = iniciar(client, h, lugar.id).json()
    responder_correcto(client, h, intento)
    r = iniciar(client, h, lugar.id)
    assert r.status_code == 409 and error(r) == "YA_VISITADO"


def test_lugar_inactivo_o_inexistente(client, turista):
    _, h = turista
    lugar = crear_lugar(activo=False)
    r = iniciar(client, h, lugar.id)
    assert r.status_code == 404 and error(r) == "NO_ENCONTRADO"
    assert iniciar(client, h, 9999).status_code == 404
    sin_preg = crear_lugar(preguntas=0)
    assert iniciar(client, h, sin_preg.id).status_code == 404


def test_demasiados_intentos(client, turista):
    _, h = turista
    lugar = crear_lugar()
    restantes = []
    for _ in range(3):
        intento = iniciar(client, h, lugar.id).json()
        r = responder_incorrecto(client, h, intento)
        assert r.status_code == 200 and r.json()["correcta"] is False
        restantes.append(r.json()["intentos_restantes"])
    assert restantes == [2, 1, 0]
    r = iniciar(client, h, lugar.id)
    assert r.status_code == 429 and error(r) == "DEMASIADOS_INTENTOS"


def test_intentos_viejos_no_cuentan(client, turista, sesion):
    _, h = turista
    lugar = crear_lugar()
    for _ in range(3):
        responder_incorrecto(client, h, iniciar(client, h, lugar.id).json())
    sesion.execute(update(IntentoVisita).values(creado_en=tiempo.ahora() - timedelta(hours=25)))
    sesion.commit()
    assert iniciar(client, h, lugar.id).status_code == 200


def test_iniciar_dos_veces_devuelve_el_mismo_intento(client, turista):
    _, h = turista
    lugar = crear_lugar(preguntas=3)
    a = iniciar(client, h, lugar.id).json()
    b = iniciar(client, h, lugar.id).json()
    assert a["intento_id"] == b["intento_id"] and a["pregunta"] == b["pregunta"] and a["opciones"] == b["opciones"]


def test_intento_expirado(client, turista, sesion):
    _, h = turista
    lugar = crear_lugar()
    intento = iniciar(client, h, lugar.id).json()
    sesion.execute(update(IntentoVisita).values(vence_en=tiempo.ahora() - timedelta(seconds=1)))
    sesion.commit()
    r = responder_correcto(client, h, intento)
    assert r.status_code == 410 and error(r) == "INTENTO_EXPIRADO"
    r = responder_correcto(client, h, intento)
    assert r.status_code == 410
    # El vencido cuenta como fallo, y se puede pedir un intento nuevo
    r = iniciar(client, h, lugar.id)
    assert r.status_code == 200 and r.json()["intento_id"] != intento["intento_id"]


def test_mover_fuera_de_rango_antes_de_responder(client, turista, sesion):
    t, h = turista
    lugar = crear_lugar(radio_m=100)
    intento = iniciar(client, h, lugar.id).json()
    lat, lon = desplazar(LAT0, LON0, norte_m=400)
    r = responder_correcto(client, h, intento, lat, lon)
    assert r.status_code == 403 and error(r) == "FUERA_DE_RANGO"
    sesion.expire_all()
    assert sesion.get(Usuario, t.id).puntos == 0
    # Vuelve al lugar dentro del tiempo: puede responder
    assert responder_correcto(client, h, intento).json()["correcta"] is True


def test_responder_con_mock_anula_intento(client, turista, sesion):
    _, h = turista
    lugar = crear_lugar()
    intento = iniciar(client, h, lugar.id).json()
    r = client.post(f"{API}/visitas/responder", headers=h, json={
        "intento_id": intento["intento_id"], "opcion_index": 0, "muestra": muestra_unica(mock=True)})
    assert r.status_code == 403 and error(r) == "UBICACION_FALSA"
    assert len(alertas(sesion, "UBICACION_FALSA")) == 1
    r = responder_correcto(client, h, intento)
    assert r.status_code == 409 and error(r) == "INTENTO_USADO"


def test_responder_precision_y_muestra_vieja(client, turista):
    _, h = turista
    lugar = crear_lugar()
    intento = iniciar(client, h, lugar.id).json()
    r = client.post(f"{API}/visitas/responder", headers=h, json={
        "intento_id": intento["intento_id"], "opcion_index": 0, "muestra": muestra_unica(precision=200),
        "reloj_ms": tiempo.ahora_ms()})
    assert r.status_code == 422 and error(r) == "PRECISION_INSUFICIENTE"
    m = muestra_unica()
    m["tiempo_ms"] -= 120_000
    r = client.post(f"{API}/visitas/responder", headers=h, json={
        "intento_id": intento["intento_id"], "opcion_index": 0, "muestra": m, "reloj_ms": tiempo.ahora_ms()})
    assert r.status_code == 422 and error(r) == "MUESTRAS_INVALIDAS"


def test_responder_intento_ajeno_o_inexistente(client, turista):
    _, h = turista
    lugar = crear_lugar()
    intento = iniciar(client, h, lugar.id).json()
    otro = crear_usuario("turista")
    h2 = login_app(client, otro.email)
    r = responder_correcto(client, h2, intento)
    assert r.status_code == 404 and error(r) == "NO_ENCONTRADO"
    r = responder_correcto(client, h, {"intento_id": 99999, "opciones": ["Correcta"]})
    assert r.status_code == 404


def test_responder_opcion_fuera_de_rango(client, turista):
    _, h = turista
    lugar = crear_lugar()
    intento = iniciar(client, h, lugar.id).json()
    r = client.post(f"{API}/visitas/responder", headers=h, json={
        "intento_id": intento["intento_id"], "opcion_index": 7, "muestra": muestra_unica(),
        "reloj_ms": tiempo.ahora_ms()})
    assert r.status_code == 422 and error(r) == "DATOS_INVALIDOS"


def test_muestras_identicas_se_permiten_con_alerta(client, turista, sesion):
    t, h = turista
    lugar = crear_lugar()
    r = iniciar(client, h, lugar.id, jitter=False)
    assert r.status_code == 200
    a = alertas(sesion, "MUESTRAS_IDENTICAS")
    assert len(a) == 1 and a[0].usuario_id == t.id


def test_multiplicador_de_temporada(client, turista, sesion):
    _, h = turista
    hoy = tiempo.hoy_argentina()
    sesion.add(Temporada(nombre="Alta", fecha_inicio=hoy - timedelta(days=1), fecha_fin=hoy + timedelta(days=1),
                         multiplicador=1.5, activa=True))
    sesion.add(Temporada(nombre="Futura", fecha_inicio=hoy + timedelta(days=10), fecha_fin=hoy + timedelta(days=20),
                         multiplicador=3, activa=False))
    sesion.commit()
    lugar = crear_lugar(puntos=45)
    d = responder_correcto(client, h, iniciar(client, h, lugar.id).json()).json()
    assert d["puntos_ganados"] == 68  # 67.5 redondeado hacia arriba
    assert d["multiplicador"] == 1.5
    sesion.expire_all()
    v = sesion.execute(select(Visita)).scalar_one()
    assert v.puntos == 68


def test_temporada_activa_fuera_de_fecha_no_aplica(client, turista, sesion):
    _, h = turista
    hoy = tiempo.hoy_argentina()
    sesion.add(Temporada(nombre="Pasada", fecha_inicio=hoy - timedelta(days=30), fecha_fin=hoy - timedelta(days=1),
                         multiplicador=2, activa=True))
    sesion.commit()
    lugar = crear_lugar(puntos=40)
    d = responder_correcto(client, h, iniciar(client, h, lugar.id).json()).json()
    assert d["puntos_ganados"] == 40


def test_solo_turista_puede_iniciar(client, app):
    from conftest import cliente_web
    lugar = crear_lugar()
    for rol in ("negocio", "residente", "admin"):
        u = crear_usuario(rol)
        c = cliente_web(app, u.email)
        r = c.post(f"{API}/visitas/iniciar", json=cuerpo_iniciar(lugar.id))
        assert r.status_code == 403 and error(r) == "PROHIBIDO"
        assert c.get(f"{API}/visitas/mias").status_code == 403
        # pero puede ver lugares (previsualizar), con visitado=false
        lst = c.get(f"{API}/lugares").json()
        assert lst[0]["visitado"] is False
