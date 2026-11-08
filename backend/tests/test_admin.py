from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import tiempo
from app.modelos import Alerta, Lugar, Sesion, Visita
from conftest import (
    PASSWORD,
    cliente_web,
    crear_beneficio,
    crear_lugar,
    crear_usuario,
    cuerpo_iniciar,
    error,
    login_app,
    negocio_de,
    responder_correcto,
)

API = "/api/v1"


@pytest.fixture
def admin(app):
    u = crear_usuario("admin")
    return {"u": u, "web": cliente_web(app, u.email)}


def paginado(r):
    assert r.status_code == 200, r.text
    d = r.json()
    assert set(d) == {"items", "total", "pagina", "por_pagina"}
    return d


def test_lugares_crud_y_borrado_suave(admin, client):
    web = admin["web"]
    body = {"nombre": "Cabildo", "descripcion": "d", "direccion": "x", "categoria": "Historia",
            "latitud": -24.1856, "longitud": -65.2995, "radio_m": 100, "puntos": 50, "activo": True}
    r = web.post(f"{API}/admin/lugares", json=body)
    assert r.status_code == 409 and error(r) == "LUGAR_SIN_PREGUNTAS"
    body["activo"] = False
    r = web.post(f"{API}/admin/lugares", json=body)
    assert r.status_code == 201 and r.json()["cantidad_preguntas"] == 0 and r.json()["activo"] is False
    lid = r.json()["id"]
    assert web.patch(f"{API}/admin/lugares/{lid}", json={"activo": True}).status_code == 409
    r = web.post(f"{API}/admin/lugares/{lid}/preguntas",
                 json={"texto": "¿Qué?", "opciones": ["Correcta", "Otra"], "correcta_index": 0})
    assert r.status_code == 201 and r.json()["correcta_index"] == 0
    pid = r.json()["id"]
    r = web.patch(f"{API}/admin/lugares/{lid}", json={"activo": True, "puntos": 70})
    assert r.status_code == 200 and r.json()["activo"] is True and r.json()["puntos"] == 70
    assert r.json()["cantidad_preguntas"] == 1
    # radio fuera de rango
    assert web.patch(f"{API}/admin/lugares/{lid}", json={"radio_m": 5}).status_code == 422
    assert web.post(f"{API}/admin/lugares", json={**body, "puntos": 0}).status_code == 422
    d = paginado(web.get(f"{API}/admin/lugares"))
    assert d["total"] == 1 and d["items"][0]["cantidad_preguntas"] == 1
    preg = paginado(web.get(f"{API}/admin/lugares/{lid}/preguntas"))
    assert preg["items"][0]["opciones"] == ["Correcta", "Otra"]

    # Un turista visita y luego se borra el lugar: se conserva el historial
    t = crear_usuario("turista")
    h = login_app(client, t.email)
    intento = client.post(f"{API}/visitas/iniciar", headers=h,
                          json=cuerpo_iniciar(lid, lat=-24.1856, lon=-65.2995)).json()
    assert responder_correcto(client, h, intento, -24.1856, -65.2995).json()["puntos_ganados"] == 70
    r = web.delete(f"{API}/admin/lugares/{lid}")
    assert r.status_code == 200 and r.json()["activo"] is False
    assert client.get(f"{API}/lugares", headers=h).json() == []
    assert client.get(f"{API}/visitas/mias", headers=h).json()[0]["lugar_id"] == lid
    assert paginado(web.get(f"{API}/admin/lugares"))["total"] == 1  # sigue existiendo
    assert web.get(f"{API}/auth/yo").status_code == 200

    # Preguntas: editar y borrado suave
    r = web.patch(f"{API}/admin/preguntas/{pid}", json={"correcta_index": 5})
    assert r.status_code == 422
    r = web.patch(f"{API}/admin/preguntas/{pid}", json={"opciones": ["A", "B", "C"], "correcta_index": 2})
    assert r.status_code == 200 and r.json()["correcta_index"] == 2
    r = web.delete(f"{API}/admin/preguntas/{pid}")
    assert r.status_code == 200 and r.json()["activa"] is False
    assert web.delete(f"{API}/admin/preguntas/9999").status_code == 404
    assert web.post(f"{API}/admin/lugares/{lid}/preguntas",
                    json={"texto": "x", "opciones": ["A", "a"], "correcta_index": 0}).status_code == 422
    assert web.post(f"{API}/admin/lugares/{lid}/preguntas",
                    json={"texto": "x", "opciones": ["A"], "correcta_index": 0}).status_code == 422


def test_beneficios_admin(admin):
    web = admin["web"]
    neg_u = crear_usuario("negocio")
    neg = negocio_de(neg_u.id)
    r = web.post(f"{API}/admin/beneficios", json={"negocio_id": neg.id, "titulo": "Promo", "descripcion": "d",
                                                  "puntos": 100, "dias_validez": 30})
    assert r.status_code == 201 and r.json()["estado"] == "APROBADO" and r.json()["negocio_id"] == neg.id
    assert web.post(f"{API}/admin/beneficios", json={"negocio_id": 999, "titulo": "P", "puntos": 1,
                                                     "dias_validez": 1}).status_code == 404
    pend = crear_beneficio(neg.id, estado="PENDIENTE")
    d = paginado(web.get(f"{API}/admin/beneficios?estado=PENDIENTE"))
    assert [b["id"] for b in d["items"]] == [pend.id]
    r = web.patch(f"{API}/admin/beneficios/{pend.id}", json={"estado": "RECHAZADO", "motivo_rechazo": "Muy caro"})
    assert r.json()["estado"] == "RECHAZADO" and r.json()["motivo_rechazo"] == "Muy caro"
    r = web.patch(f"{API}/admin/beneficios/{pend.id}", json={"estado": "APROBADO"})
    assert r.json()["estado"] == "APROBADO" and r.json()["motivo_rechazo"] is None
    r = web.delete(f"{API}/admin/beneficios/{pend.id}")
    assert r.json()["eliminado"] is True
    neg_web = cliente_web(web.app, neg_u.email)
    assert pend.id not in [b["id"] for b in neg_web.get(f"{API}/negocio/beneficios").json()]
    assert web.patch(f"{API}/admin/beneficios/9999", json={}).status_code == 404


def test_usuarios_admin(admin, client, app):
    web = admin["web"]
    r = web.post(f"{API}/admin/usuarios", json={"nombre": "Neg", "email": "neg@x.com", "password": "clave-larga",
                                                "rol": "negocio"})
    assert r.status_code == 422  # falta negocio
    r = web.post(f"{API}/admin/usuarios", json={
        "nombre": "Neg", "email": "neg@x.com", "password": "clave-larga", "rol": "negocio",
        "negocio": {"nombre": "Café Central", "direccion": "Belgrano 1", "telefono": "1", "descripcion": "d"}})
    assert r.status_code == 201
    u = r.json()["usuario"]
    assert u["rol"] == "negocio" and u["negocio"]["nombre"] == "Café Central"
    r = web.post(f"{API}/admin/usuarios", json={"nombre": "X", "email": "NEG@x.com", "password": "clave-larga",
                                                "rol": "residente"})
    assert r.status_code == 409 and error(r) == "EMAIL_EN_USO"
    web.post(f"{API}/admin/usuarios", json={"nombre": "Rosa Vecina", "email": "rosa@x.com",
                                            "password": "clave-larga", "rol": "residente"})
    d = paginado(web.get(f"{API}/admin/usuarios?rol=residente"))
    assert [x["email"] for x in d["items"]] == ["rosa@x.com"]
    d = paginado(web.get(f"{API}/admin/usuarios?q=ROSA"))
    assert d["total"] == 1
    d = paginado(web.get(f"{API}/admin/usuarios?q=%25"))
    assert d["total"] == 0
    d = paginado(web.get(f"{API}/admin/usuarios?pagina=2&por_pagina=1"))
    assert d["pagina"] == 2 and len(d["items"]) == 1 and d["total"] == 3
    assert web.get(f"{API}/admin/usuarios?por_pagina=1000").status_code == 422
    # Editar nombre
    r = web.patch(f"{API}/admin/usuarios/{u['id']}", json={"nombre": "Nuevo"})
    assert r.json()["usuario"]["nombre"] == "Nuevo"
    # No puede bloquearse a sí mismo
    r = web.patch(f"{API}/admin/usuarios/{admin['u'].id}", json={"bloqueado": True})
    assert r.status_code == 409 and error(r) == "AUTOBLOQUEO_NO_PERMITIDO"


def test_bloqueo_revoca_sesiones(admin, client, sesion):
    web = admin["web"]
    t = crear_usuario("turista")
    h = login_app(client, t.email)
    assert client.get(f"{API}/auth/yo", headers=h).status_code == 200
    r = web.patch(f"{API}/admin/usuarios/{t.id}", json={"bloqueado": True})
    assert r.status_code == 200 and r.json()["usuario"]["bloqueado"] is True
    assert client.get(f"{API}/auth/yo", headers=h).status_code == 401
    assert sesion.execute(select(Sesion).where(Sesion.usuario_id == t.id)).first() is None
    r = client.post(f"{API}/auth/login", json={"email": t.email, "password": PASSWORD, "cliente": "app"})
    assert r.status_code == 403 and error(r) == "CUENTA_BLOQUEADA"
    web.patch(f"{API}/admin/usuarios/{t.id}", json={"bloqueado": False})
    assert client.post(f"{API}/auth/login", json={"email": t.email, "password": PASSWORD,
                                                  "cliente": "app"}).status_code == 200


def test_reset_password(admin, client):
    t = crear_usuario("turista")
    h = login_app(client, t.email)
    r = admin["web"].post(f"{API}/admin/usuarios/{t.id}/reset-password")
    temporal = r.json()["password_temporal"]
    assert len(temporal) >= 10
    assert client.get(f"{API}/auth/yo", headers=h).status_code == 401
    assert client.post(f"{API}/auth/login", json={"email": t.email, "password": temporal,
                                                  "cliente": "app"}).status_code == 200
    assert admin["web"].post(f"{API}/admin/usuarios/9999/reset-password").status_code == 404


def test_temporadas(admin):
    web = admin["web"]
    hoy = tiempo.hoy_argentina()
    r = web.post(f"{API}/admin/temporadas", json={"nombre": "Invierno", "fecha_inicio": str(hoy),
                                                  "fecha_fin": str(hoy - timedelta(days=1)), "multiplicador": 2})
    assert r.status_code == 422
    r = web.post(f"{API}/admin/temporadas", json={"nombre": "Invierno", "fecha_inicio": str(hoy),
                                                  "fecha_fin": str(hoy), "multiplicador": 9})
    assert r.status_code == 422
    a = web.post(f"{API}/admin/temporadas", json={"nombre": "A", "fecha_inicio": str(hoy),
                                                  "fecha_fin": str(hoy + timedelta(days=5)), "multiplicador": 2,
                                                  "activa": True}).json()
    assert a["activa"] is True and a["vigente"] is True
    b = web.post(f"{API}/admin/temporadas", json={"nombre": "B", "fecha_inicio": str(hoy),
                                                  "fecha_fin": str(hoy), "multiplicador": 1.2}).json()
    assert b["activa"] is False
    r = web.patch(f"{API}/admin/temporadas/{b['id']}", json={"activa": True})
    assert r.json()["activa"] is True
    items = {t["id"]: t for t in paginado(web.get(f"{API}/admin/temporadas"))["items"]}
    assert items[a["id"]]["activa"] is False and items[b["id"]]["activa"] is True
    r = web.patch(f"{API}/admin/temporadas/{b['id']}", json={"fecha_fin": str(hoy - timedelta(days=3))})
    assert r.status_code == 422
    assert web.patch(f"{API}/admin/temporadas/999", json={"activa": True}).status_code == 404


def test_canjes_y_alertas_admin(admin, client, sesion):
    web = admin["web"]
    neg = negocio_de(crear_usuario("negocio").id)
    b = crear_beneficio(neg.id, puntos=10)
    t = crear_usuario("turista", puntos=100)
    h = login_app(client, t.email)
    client.post(f"{API}/canjes", headers=h, json={"beneficio_id": b.id})
    d = paginado(web.get(f"{API}/admin/canjes"))
    assert d["total"] == 1 and d["items"][0]["turista_nombre"] == t.nombre
    assert d["items"][0]["negocio_nombre"] == neg.nombre
    assert paginado(web.get(f"{API}/admin/canjes?estado=USADO"))["total"] == 0

    sesion.add(Alerta(tipo="VIAJE_IMPOSIBLE", usuario_id=t.id, datos={"velocidad_kmh": 900}))
    sesion.commit()
    d = paginado(web.get(f"{API}/admin/alertas?resueltas=false"))
    assert d["total"] == 1 and d["items"][0]["usuario_nombre"] == t.nombre
    aid = d["items"][0]["id"]
    r = web.post(f"{API}/admin/alertas/{aid}/resolver")
    assert r.json()["resuelta"] is True and r.json()["resuelta_en"]
    assert paginado(web.get(f"{API}/admin/alertas?resueltas=false"))["total"] == 0
    assert paginado(web.get(f"{API}/admin/alertas?resueltas=true"))["total"] == 1
    assert paginado(web.get(f"{API}/admin/alertas"))["total"] == 1
    assert web.post(f"{API}/admin/alertas/999/resolver").status_code == 404


def test_estadisticas(admin, client):
    web = admin["web"]
    l1 = crear_lugar(nombre="Uno")
    crear_lugar(nombre="Dos")
    t = crear_usuario("turista")
    h = login_app(client, t.email)
    intento = client.post(f"{API}/visitas/iniciar", headers=h, json=cuerpo_iniciar(l1.id)).json()
    responder_correcto(client, h, intento)
    crear_usuario("residente")
    r = web.get(f"{API}/admin/estadisticas")
    assert r.status_code == 200
    d = r.json()
    assert d["usuarios"] == {"total": 3, "turistas": 1, "negocios": 0, "residentes": 1, "admins": 1}
    assert d["visitas_total"] == 1 and d["visitas_7d"] == 1
    assert d["lugares_mas_visitados"][0] == {"id": l1.id, "nombre": "Uno", "visitas": 1}
    assert d["lugares_menos_visitados"][0]["nombre"] == "Dos"
    for k in ("canjes_total", "canjes_usados", "alertas_abiertas", "recomendaciones_pendientes",
              "beneficios_pendientes"):
        assert d[k] == 0


def test_admin_puede_previsualizar_vistas_turista(admin):
    crear_lugar()
    web = admin["web"]
    assert web.get(f"{API}/lugares").status_code == 200
    assert web.get(f"{API}/beneficios").status_code == 200
    assert web.get(f"{API}/recomendaciones").status_code == 200
