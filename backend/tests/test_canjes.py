import threading
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update

from app import db as dbmod
from app import tiempo
from app.modelos import Beneficio, Canje, MovimientoPuntos, Usuario
from app.servicios import normalizar_codigo
from conftest import cliente_web, crear_beneficio, crear_usuario, error, login_app, negocio_de

API = "/api/v1"


@pytest.fixture
def escenario(client, app):
    dueno = crear_usuario("negocio")
    neg = negocio_de(dueno.id)
    t = crear_usuario("turista", puntos=300)
    h = login_app(client, t.email)
    web = cliente_web(app, dueno.email)
    return {"turista": t, "h": h, "negocio": neg, "dueno": dueno, "web": web}


def canjear(client, h, beneficio_id):
    return client.post(f"{API}/canjes", headers=h, json={"beneficio_id": beneficio_id})


def test_beneficios_visibles(client, escenario, sesion):
    neg = escenario["negocio"]
    ok = crear_beneficio(neg.id, puntos=100)
    crear_beneficio(neg.id, estado="PENDIENTE")
    crear_beneficio(neg.id, estado="RECHAZADO")
    crear_beneficio(neg.id, activo=False)
    crear_beneficio(neg.id, stock=0)
    con_stock = crear_beneficio(neg.id, puntos=50, stock=5)
    eliminado = crear_beneficio(neg.id)
    sesion.execute(update(Beneficio).where(Beneficio.id == eliminado.id).values(eliminado=True))
    sesion.commit()
    r = client.get(f"{API}/beneficios", headers=escenario["h"])
    assert r.status_code == 200
    assert [b["id"] for b in r.json()] == [con_stock.id, ok.id]
    b = r.json()[0]
    assert b["stock_restante"] == 5 and b["negocio"]["id"] == neg.id
    assert set(b) == {"id", "titulo", "descripcion", "puntos", "dias_validez", "stock_restante", "negocio"}
    assert r.json()[1]["stock_restante"] is None


def test_beneficios_de_negocio_bloqueado_no_se_ven(client, escenario, sesion):
    crear_beneficio(escenario["negocio"].id)
    sesion.execute(update(Usuario).where(Usuario.id == escenario["dueno"].id).values(bloqueado=True))
    sesion.commit()
    assert client.get(f"{API}/beneficios", headers=escenario["h"]).json() == []


def test_canje_ok(client, escenario, sesion):
    b = crear_beneficio(escenario["negocio"].id, puntos=120, dias_validez=10)
    r = canjear(client, escenario["h"], b.id)
    assert r.status_code == 201, r.text
    c = r.json()
    assert c["estado"] == "DISPONIBLE" and c["puntos"] == 120 and c["puntos_restantes"] == 180
    assert c["codigo"].startswith("JCP-") and len(c["codigo"]) == 13
    assert normalizar_codigo(c["codigo"]) == c["codigo"]
    assert c["beneficio"]["negocio_nombre"] == escenario["negocio"].nombre
    assert c["usado_en"] is None
    assert c["vence_en"] > c["creado_en"]
    mios = client.get(f"{API}/canjes/mios", headers=escenario["h"]).json()
    assert [m["codigo"] for m in mios] == [c["codigo"]]
    mov = sesion.execute(select(MovimientoPuntos).where(MovimientoPuntos.tipo == "CANJE")).scalar_one()
    assert mov.delta == -120


def test_canje_puntos_insuficientes(client, escenario):
    b = crear_beneficio(escenario["negocio"].id, puntos=301)
    r = canjear(client, escenario["h"], b.id)
    assert r.status_code == 409 and error(r) == "PUNTOS_INSUFICIENTES"
    assert r.json()["error"]["datos"] == {"puntos": 300, "necesarios": 301}


def test_canje_beneficio_no_disponible_y_no_encontrado(client, escenario):
    neg = escenario["negocio"].id
    for b in (crear_beneficio(neg, estado="PENDIENTE"), crear_beneficio(neg, activo=False)):
        r = canjear(client, escenario["h"], b.id)
        assert r.status_code == 409 and error(r) == "BENEFICIO_NO_DISPONIBLE"
    r = canjear(client, escenario["h"], 99999)
    assert r.status_code == 404


def test_canje_stock(client, escenario, sesion):
    b = crear_beneficio(escenario["negocio"].id, puntos=10, stock=2)
    assert canjear(client, escenario["h"], b.id).status_code == 201
    assert canjear(client, escenario["h"], b.id).status_code == 201
    r = canjear(client, escenario["h"], b.id)
    assert r.status_code == 409 and error(r) == "SIN_STOCK"
    sesion.expire_all()
    assert sesion.get(Beneficio, b.id).stock == 0
    assert sesion.get(Usuario, escenario["turista"].id).puntos == 280  # el fallido no descontó


def test_canje_doble_concurrente_saldo_nunca_negativo(app, escenario, sesion):
    """10 hilos intentan canjear 100 puntos con un saldo de 300: solo 3 pueden."""
    b = crear_beneficio(escenario["negocio"].id, puntos=100)
    h = escenario["h"]
    resultados = []
    barrera = threading.Barrier(10)

    def trabajador():
        with TestClient(app) as c:
            barrera.wait()
            r = c.post(f"{API}/canjes", headers=h, json={"beneficio_id": b.id})
            resultados.append((r.status_code, r.json()))

    hilos = [threading.Thread(target=trabajador) for _ in range(10)]
    for th in hilos:
        th.start()
    for th in hilos:
        th.join()
    codigos = sorted(s for s, _ in resultados)
    assert codigos == [201] * 3 + [409] * 7, resultados
    assert all(j["error"]["codigo"] == "PUNTOS_INSUFICIENTES" for s, j in resultados if s == 409)
    sesion.expire_all()
    assert sesion.get(Usuario, escenario["turista"].id).puntos == 0
    assert len(sesion.execute(select(Canje)).scalars().all()) == 3


def test_canje_concurrente_con_stock_por_servicio(app, escenario, sesion):
    """Hilos con sesiones propias llamando al servicio: el stock nunca queda negativo."""
    from app.errores import ErrorAPI
    from app.servicios import realizar_canje

    b = crear_beneficio(escenario["negocio"].id, puntos=1, stock=4)
    usuarios = [crear_usuario("turista", puntos=10) for _ in range(8)]
    ok, fallos = [], []
    barrera = threading.Barrier(8)

    def trabajador(uid):
        s = dbmod.SessionLocal()
        try:
            barrera.wait()
            realizar_canje(s, uid, b.id)
            ok.append(uid)
        except ErrorAPI as e:
            fallos.append(e.codigo)
        finally:
            s.close()

    hilos = [threading.Thread(target=trabajador, args=(u.id,)) for u in usuarios]
    [th.start() for th in hilos]
    [th.join() for th in hilos]
    assert len(ok) == 4 and fallos == ["SIN_STOCK"] * 4
    sesion.expire_all()
    assert sesion.get(Beneficio, b.id).stock == 0


def test_canjes_solo_turista(app, escenario):
    b = crear_beneficio(escenario["negocio"].id)
    r = escenario["web"].post(f"{API}/canjes", json={"beneficio_id": b.id})
    assert r.status_code == 403
    assert escenario["web"].get(f"{API}/canjes/mios").status_code == 403
    # pero puede ver /beneficios
    assert escenario["web"].get(f"{API}/beneficios").status_code == 200


# ------------------------------------------------------------------ negocio usa cupones
def test_negocio_consulta_y_usa_cupon(client, escenario):
    b = crear_beneficio(escenario["negocio"].id, puntos=50)
    c = canjear(client, escenario["h"], b.id).json()
    web = escenario["web"]
    tipeado = c["codigo"].lower().replace("-", " ").replace("0", "o").replace("1", "l")
    r = web.get(f"{API}/negocio/cupones/{tipeado}")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["codigo"] == c["codigo"] and d["estado"] == "DISPONIBLE"
    assert d["turista_nombre"] == escenario["turista"].nombre and d["beneficio_titulo"] == b.titulo
    r = web.post(f"{API}/negocio/cupones/{c['codigo']}/usar")
    assert r.status_code == 200
    assert r.json()["ok"] is True and r.json()["usado_en"]
    r = web.post(f"{API}/negocio/cupones/{c['codigo']}/usar")
    assert r.status_code == 409 and error(r) == "CUPON_USADO"
    mios = client.get(f"{API}/canjes/mios", headers=escenario["h"]).json()
    assert mios[0]["estado"] == "USADO" and mios[0]["usado_en"]


def test_cupon_de_otro_negocio_es_404(client, app, escenario):
    b = crear_beneficio(escenario["negocio"].id, puntos=50)
    c = canjear(client, escenario["h"], b.id).json()
    otro = crear_usuario("negocio")
    web2 = cliente_web(app, otro.email)
    r = web2.get(f"{API}/negocio/cupones/{c['codigo']}")
    assert r.status_code == 404 and error(r) == "CUPON_NO_ENCONTRADO"
    r2 = web2.get(f"{API}/negocio/cupones/JCP-ZZZZ-ZZZZ")
    assert r2.status_code == 404 and r.json() == r2.json()
    r = web2.post(f"{API}/negocio/cupones/{c['codigo']}/usar")
    assert r.status_code == 404 and error(r) == "CUPON_NO_ENCONTRADO"


def test_uso_doble_concurrente_de_cupon(app, client, escenario):
    b = crear_beneficio(escenario["negocio"].id, puntos=50)
    codigo = canjear(client, escenario["h"], b.id).json()["codigo"]
    cookie = escenario["web"].cookies.get("jcp_sesion")
    resultados = []
    barrera = threading.Barrier(6)

    def trabajador():
        with TestClient(app, headers={"X-JCP": "1"}) as c:
            c.cookies.set("jcp_sesion", cookie)
            barrera.wait()
            r = c.post(f"{API}/negocio/cupones/{codigo}/usar")
            resultados.append(r.status_code)

    hilos = [threading.Thread(target=trabajador) for _ in range(6)]
    [th.start() for th in hilos]
    [th.join() for th in hilos]
    assert sorted(resultados) == [200] + [409] * 5


def test_cupon_vencido(client, escenario, sesion):
    b = crear_beneficio(escenario["negocio"].id, puntos=50)
    c = canjear(client, escenario["h"], b.id).json()
    sesion.execute(update(Canje).values(vence_en=tiempo.ahora() - timedelta(minutes=1)))
    sesion.commit()
    web = escenario["web"]
    r = web.get(f"{API}/negocio/cupones/{c['codigo']}")
    assert r.status_code == 200 and r.json()["estado"] == "VENCIDO"
    r = web.post(f"{API}/negocio/cupones/{c['codigo']}/usar")
    assert r.status_code == 409 and error(r) == "CUPON_VENCIDO"
    mios = client.get(f"{API}/canjes/mios", headers=escenario["h"]).json()
    assert mios[0]["estado"] == "VENCIDO"


def test_vencidos_se_marcan_al_leer_mis_canjes(client, escenario, sesion):
    b = crear_beneficio(escenario["negocio"].id, puntos=50)
    canjear(client, escenario["h"], b.id)
    sesion.execute(update(Canje).values(vence_en=tiempo.ahora() - timedelta(seconds=1)))
    sesion.commit()
    assert client.get(f"{API}/canjes/mios", headers=escenario["h"]).json()[0]["estado"] == "VENCIDO"
    sesion.expire_all()
    assert sesion.execute(select(Canje.estado)).scalar_one() == "VENCIDO"


def test_cupon_anulado_no_se_usa(client, app, escenario):
    b = crear_beneficio(escenario["negocio"].id, puntos=50)
    c = canjear(client, escenario["h"], b.id).json()
    admin = cliente_web(app, crear_usuario("admin").email)
    assert admin.post(f"{API}/admin/canjes/{c['id']}/anular", json={"devolver_puntos": False}).status_code == 200
    r = escenario["web"].post(f"{API}/negocio/cupones/{c['codigo']}/usar")
    assert r.status_code == 409 and error(r) == "CUPON_ANULADO"


def test_anular_con_devolucion(client, app, escenario, sesion):
    b = crear_beneficio(escenario["negocio"].id, puntos=100, stock=3)
    c = canjear(client, escenario["h"], b.id).json()
    assert c["puntos_restantes"] == 200
    admin = cliente_web(app, crear_usuario("admin").email)
    r = admin.post(f"{API}/admin/canjes/{c['id']}/anular", json={"devolver_puntos": True})
    assert r.status_code == 200 and r.json()["estado"] == "ANULADO"
    sesion.expire_all()
    u = sesion.get(Usuario, escenario["turista"].id)
    assert u.puntos == 300 and u.puntos_historicos == 300
    assert sesion.get(Beneficio, b.id).stock == 3
    tipos = [m.tipo for m in sesion.execute(select(MovimientoPuntos).order_by(MovimientoPuntos.id)).scalars()]
    assert tipos == ["CANJE", "DEVOLUCION_CANJE"]
    r = admin.post(f"{API}/admin/canjes/{c['id']}/anular", json={"devolver_puntos": True})
    assert r.status_code == 409 and error(r) == "CANJE_NO_ANULABLE"
    sesion.expire_all()
    assert sesion.get(Usuario, escenario["turista"].id).puntos == 300  # no devuelve dos veces


def test_anular_sin_devolucion_y_usado_no_anulable(client, app, escenario, sesion):
    b = crear_beneficio(escenario["negocio"].id, puntos=100)
    c1 = canjear(client, escenario["h"], b.id).json()
    c2 = canjear(client, escenario["h"], b.id).json()
    admin = cliente_web(app, crear_usuario("admin").email)
    assert admin.post(f"{API}/admin/canjes/{c1['id']}/anular", json={"devolver_puntos": False}).status_code == 200
    sesion.expire_all()
    assert sesion.get(Usuario, escenario["turista"].id).puntos == 100
    escenario["web"].post(f"{API}/negocio/cupones/{c2['codigo']}/usar")
    r = admin.post(f"{API}/admin/canjes/{c2['id']}/anular", json={"devolver_puntos": True})
    assert r.status_code == 409 and error(r) == "CANJE_NO_ANULABLE"
    assert admin.post(f"{API}/admin/canjes/9999/anular", json={}).status_code == 404


def test_rate_limit_cupones_por_negocio(client, app, escenario, sesion):
    from app.modelos import Alerta
    b = crear_beneficio(escenario["negocio"].id, puntos=50)
    valido = canjear(client, escenario["h"], b.id).json()["codigo"]
    web = escenario["web"]
    for i in range(20):
        r = web.get(f"{API}/negocio/cupones/JCP-AAAA-{i:04d}")
        assert r.status_code == 404
    r = web.get(f"{API}/negocio/cupones/{valido}")
    assert r.status_code == 429 and error(r) == "DEMASIADOS_INTENTOS"
    r = web.post(f"{API}/negocio/cupones/{valido}/usar")
    assert r.status_code == 429
    alertas = sesion.execute(select(Alerta).where(Alerta.tipo == "FUERZA_BRUTA_CUPONES")).scalars().all()
    assert len(alertas) == 1
    # otro negocio no está afectado
    otro = cliente_web(app, crear_usuario("negocio").email)
    assert otro.get(f"{API}/negocio/cupones/JCP-AAAA-BBBB").status_code == 404


def test_normalizar_codigo():
    assert normalizar_codigo("jcp-7k3m-q9tx") == "JCP-7K3M-Q9TX"
    assert normalizar_codigo(" JCP 7K3M Q9TX ") == "JCP-7K3M-Q9TX"
    assert normalizar_codigo("7k3mq9tx") == "JCP-7K3M-Q9TX"
    assert normalizar_codigo("JCP-OOII-LLAB") == "JCP-0011-11AB"
    assert normalizar_codigo("JCP-UUUU-AAAA") is None
    assert normalizar_codigo("JCP-ABC") is None
    assert normalizar_codigo("") is None
