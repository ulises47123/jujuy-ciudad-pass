import pytest
from sqlalchemy import update

from app.modelos import Beneficio, Recomendacion, Usuario
from conftest import cliente_web, crear_beneficio, crear_usuario, error, login_app, negocio_de

API = "/api/v1"


@pytest.fixture
def negocio(app):
    u = crear_usuario("negocio")
    return {"u": u, "n": negocio_de(u.id), "web": cliente_web(app, u.email)}


def test_negocio_beneficios_crud(negocio, client, sesion):
    web = negocio["web"]
    r = web.post(f"{API}/negocio/beneficios", json={"titulo": "Café gratis", "descripcion": "Uno por persona",
                                                     "puntos": 80, "dias_validez": 15, "stock": 10})
    assert r.status_code == 201, r.text
    b = r.json()
    assert b["estado"] == "PENDIENTE" and b["activo"] is True and b["stock_restante"] == 10
    bid = b["id"]
    # Aprobado por admin (directo en base) → editar stock/activo no lo devuelve a pendiente
    sesion.execute(update(Beneficio).where(Beneficio.id == bid).values(estado="APROBADO"))
    sesion.commit()
    r = web.patch(f"{API}/negocio/beneficios/{bid}", json={"stock": None, "activo": False, "dias_validez": 20})
    assert r.status_code == 200
    assert r.json()["estado"] == "APROBADO" and r.json()["stock_restante"] is None and r.json()["activo"] is False
    # Cambiar el título → vuelve a PENDIENTE
    r = web.patch(f"{API}/negocio/beneficios/{bid}", json={"titulo": "Café doble gratis"})
    assert r.json()["estado"] == "PENDIENTE" and r.json()["titulo"] == "Café doble gratis"
    lista = web.get(f"{API}/negocio/beneficios").json()
    assert [x["id"] for x in lista] == [bid]
    # Datos inválidos
    r = web.post(f"{API}/negocio/beneficios", json={"titulo": "", "puntos": 0, "dias_validez": 0})
    assert r.status_code == 422 and error(r) == "DATOS_INVALIDOS"


def test_negocio_no_edita_beneficio_ajeno(app, negocio):
    otro = crear_usuario("negocio")
    b = crear_beneficio(negocio_de(otro.id).id)
    r = negocio["web"].patch(f"{API}/negocio/beneficios/{b.id}", json={"activo": False})
    assert r.status_code == 404
    assert b.id not in [x["id"] for x in negocio["web"].get(f"{API}/negocio/beneficios").json()]


def test_negocio_perfil(negocio):
    web = negocio["web"]
    p = web.get(f"{API}/negocio/perfil").json()
    assert p["id"] == negocio["n"].id
    r = web.patch(f"{API}/negocio/perfil", json={"nombre": "Café Central", "telefono": "388 111"})
    assert r.status_code == 200 and r.json()["nombre"] == "Café Central" and r.json()["telefono"] == "388 111"
    assert r.json()["direccion"] == p["direccion"]
    assert web.get(f"{API}/auth/yo").json()["usuario"]["negocio"]["nombre"] == "Café Central"


def test_negocio_resumen_y_lista_cupones(negocio, client):
    b = crear_beneficio(negocio["n"].id, puntos=10)
    crear_beneficio(negocio["n"].id, estado="PENDIENTE")
    t = crear_usuario("turista", puntos=100)
    h = login_app(client, t.email)
    c1 = client.post(f"{API}/canjes", headers=h, json={"beneficio_id": b.id}).json()
    client.post(f"{API}/canjes", headers=h, json={"beneficio_id": b.id})
    negocio["web"].post(f"{API}/negocio/cupones/{c1['codigo']}/usar")
    r = negocio["web"].get(f"{API}/negocio/resumen").json()
    assert r == {"beneficios_activos": 1, "cupones_usados_total": 1, "cupones_usados_mes": 1,
                 "cupones_pendientes": 1}
    todos = negocio["web"].get(f"{API}/negocio/cupones").json()
    assert len(todos) == 2 and all(c["turista_nombre"] == t.nombre for c in todos)
    usados = negocio["web"].get(f"{API}/negocio/cupones?estado=USADO").json()
    assert [c["codigo"] for c in usados] == [c1["codigo"]]
    assert negocio["web"].get(f"{API}/negocio/cupones?estado=RARO").status_code == 422


# ------------------------------------------------------------------ residente
@pytest.fixture
def residente(app):
    u = crear_usuario("residente")
    return {"u": u, "web": cliente_web(app, u.email)}


def test_residente_recomendaciones(residente, app, client):
    web = residente["web"]
    r = web.post(f"{API}/residente/recomendaciones",
                 json={"titulo": "Humitas", "categoria": "Gastronomía", "descripcion": "En la feria"})
    assert r.status_code == 201 and r.json()["estado"] == "PENDIENTE" and r.json()["motivo_rechazo"] is None
    r = web.post(f"{API}/residente/recomendaciones",
                 json={"titulo": "X", "categoria": "Deportes", "descripcion": "y"})
    assert r.status_code == 422 and error(r) == "DATOS_INVALIDOS"
    for i in range(4):
        assert web.post(f"{API}/residente/recomendaciones",
                        json={"titulo": f"R{i}", "categoria": "Otro", "descripcion": "d"}).status_code == 201
    r = web.post(f"{API}/residente/recomendaciones", json={"titulo": "6", "categoria": "Otro", "descripcion": "d"})
    assert r.status_code == 409 and error(r) == "LIMITE_PENDIENTES"
    mias = web.get(f"{API}/residente/recomendaciones").json()
    assert len(mias) == 5
    # El admin aprueba una → +50 puntos y se ve en /recomendaciones
    admin = cliente_web(app, crear_usuario("admin").email)
    rid = mias[-1]["id"]
    r = admin.post(f"{API}/admin/recomendaciones/{rid}/aprobar")
    assert r.status_code == 200 and r.json()["estado"] == "APROBADA"
    assert web.get(f"{API}/auth/yo").json()["usuario"]["puntos_comunidad"] == 50
    t = crear_usuario("turista")
    pub = client.get(f"{API}/recomendaciones", headers=login_app(client, t.email)).json()
    assert len(pub) == 1 and pub[0]["autor_nombre"] == residente["u"].nombre
    assert set(pub[0]) == {"id", "titulo", "categoria", "descripcion", "autor_nombre", "fecha"}
    # Rechazar otra con motivo
    r = admin.post(f"{API}/admin/recomendaciones/{mias[0]['id']}/rechazar", json={"motivo": "Duplicada"})
    assert r.status_code == 200 and r.json()["motivo_rechazo"] == "Duplicada"
    assert admin.post(f"{API}/admin/recomendaciones/{mias[0]['id']}/rechazar", json={"motivo": "x"}).status_code == 409
    assert admin.post(f"{API}/admin/recomendaciones/{rid}/aprobar").status_code == 409
    assert admin.post(f"{API}/admin/recomendaciones/{mias[1]['id']}/rechazar", json={"motivo": ""}).status_code == 422
    # Ahora tiene 3 pendientes: puede crear otra
    assert web.post(f"{API}/residente/recomendaciones",
                    json={"titulo": "N", "categoria": "Otro", "descripcion": "d"}).status_code == 201


def test_residente_ranking(residente, sesion):
    otros = [crear_usuario("residente", nombre=f"R{i}") for i in range(12)]
    puntos = [1200, 900, 900, 500, 400, 300, 200, 100, 50, 40, 30, 20]
    for u, p in zip(otros, puntos):
        sesion.execute(update(Usuario).where(Usuario.id == u.id).values(puntos_comunidad=p))
    sesion.commit()
    bloqueado = crear_usuario("residente", bloqueado=True)
    sesion.execute(update(Usuario).where(Usuario.id == bloqueado.id).values(puntos_comunidad=99999))
    sesion.execute(update(Usuario).where(Usuario.id == residente["u"].id).values(puntos_comunidad=900))
    sesion.commit()
    r = residente["web"].get(f"{API}/residente/ranking").json()
    assert len(r["ranking"]) == 10
    assert r["ranking"][0] == {"posicion": 1, "nombre": "R0", "puntos_comunidad": 1200, "rango": "Embajador Local"}
    assert [x["posicion"] for x in r["ranking"][:5]] == [1, 2, 2, 2, 5]
    assert r["ranking"][4]["rango"] == "Vecino Activo"
    assert r["mi_posicion"] == 2
    assert all(x["nombre"] != bloqueado.nombre for x in r["ranking"])
