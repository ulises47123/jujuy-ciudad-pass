"""Matriz de permisos: cada rol contra las rutas de los demás (403) y sin sesión (401)."""
import pytest

from conftest import cliente_web, crear_usuario, login_app

API = "/api/v1"

RUTAS = {
    "turista": [
        ("POST", "/visitas/iniciar", {"lugar_id": 1, "reloj_ms": 1, "muestras": []}),
        ("POST", "/visitas/responder", {"intento_id": 1, "opcion_index": 0,
                                        "muestra": {"lat": 0, "lon": 0, "precision_m": 1, "tiempo_ms": 1,
                                                    "mock": False}}),
        ("GET", "/visitas/mias", None),
        ("POST", "/canjes", {"beneficio_id": 1}),
        ("GET", "/canjes/mios", None),
    ],
    "negocio": [
        ("GET", "/negocio/resumen", None),
        ("GET", "/negocio/cupones/JCP-AAAA-BBBB", None),
        ("POST", "/negocio/cupones/JCP-AAAA-BBBB/usar", None),
        ("GET", "/negocio/cupones", None),
        ("GET", "/negocio/beneficios", None),
        ("POST", "/negocio/beneficios", {"titulo": "x", "puntos": 1, "dias_validez": 1}),
        ("PATCH", "/negocio/beneficios/1", {"activo": False}),
        ("GET", "/negocio/perfil", None),
        ("PATCH", "/negocio/perfil", {"nombre": "x"}),
    ],
    "residente": [
        ("POST", "/residente/recomendaciones", {"titulo": "x", "categoria": "Otro", "descripcion": "d"}),
        ("GET", "/residente/recomendaciones", None),
        ("GET", "/residente/ranking", None),
    ],
    "admin": [
        ("GET", "/admin/estadisticas", None),
        ("GET", "/admin/lugares", None),
        ("POST", "/admin/lugares", {"nombre": "x", "latitud": 0, "longitud": 0, "radio_m": 50, "puntos": 5}),
        ("PATCH", "/admin/lugares/1", {"puntos": 5}),
        ("DELETE", "/admin/lugares/1", None),
        ("GET", "/admin/lugares/1/preguntas", None),
        ("POST", "/admin/lugares/1/preguntas", {"texto": "x", "opciones": ["a", "b"], "correcta_index": 0}),
        ("PATCH", "/admin/preguntas/1", {"activa": False}),
        ("DELETE", "/admin/preguntas/1", None),
        ("GET", "/admin/beneficios", None),
        ("POST", "/admin/beneficios", {"negocio_id": 1, "titulo": "x", "puntos": 1, "dias_validez": 1}),
        ("PATCH", "/admin/beneficios/1", {"activo": False}),
        ("DELETE", "/admin/beneficios/1", None),
        ("GET", "/admin/usuarios", None),
        ("POST", "/admin/usuarios", {"nombre": "x", "email": "x@x.com", "password": "12345678", "rol": "admin"}),
        ("PATCH", "/admin/usuarios/99999", {"bloqueado": True}),
        ("POST", "/admin/usuarios/99999/reset-password", None),
        ("GET", "/admin/recomendaciones", None),
        ("POST", "/admin/recomendaciones/1/aprobar", None),
        ("POST", "/admin/recomendaciones/1/rechazar", {"motivo": "x"}),
        ("GET", "/admin/temporadas", None),
        ("POST", "/admin/temporadas", {"nombre": "x", "fecha_inicio": "2026-01-01", "fecha_fin": "2026-01-02",
                                       "multiplicador": 1}),
        ("PATCH", "/admin/temporadas/1", {"activa": True}),
        ("GET", "/admin/canjes", None),
        ("POST", "/admin/canjes/1/anular", {"devolver_puntos": False}),
        ("GET", "/admin/alertas", None),
        ("POST", "/admin/alertas/1/resolver", None),
    ],
}


def _pedir(c, metodo, ruta, body, headers=None):
    return c.request(metodo, f"{API}{ruta}", json=body, headers=headers or {})


@pytest.mark.parametrize("dueno", list(RUTAS))
def test_otros_roles_reciben_403(app, client, dueno):
    clientes = {}
    for rol in ("turista", "negocio", "residente", "admin"):
        if rol == dueno:
            continue
        u = crear_usuario(rol)
        if rol == "turista":
            clientes[rol] = (client, login_app(client, u.email))
        else:
            clientes[rol] = (cliente_web(app, u.email), {})
    for rol, (c, h) in clientes.items():
        for metodo, ruta, body in RUTAS[dueno]:
            r = _pedir(c, metodo, ruta, body, h)
            assert r.status_code == 403, (rol, metodo, ruta, r.status_code, r.text)
            assert r.json()["error"]["codigo"] == "PROHIBIDO"


@pytest.mark.parametrize("dueno", list(RUTAS))
def test_sin_sesion_401(client, dueno):
    for metodo, ruta, body in RUTAS[dueno]:
        r = _pedir(client, metodo, ruta, body)
        assert r.status_code == 401, (metodo, ruta)


@pytest.mark.parametrize("dueno", list(RUTAS))
def test_dueno_no_recibe_403(app, client, dueno):
    u = crear_usuario(dueno)
    if dueno == "turista":
        c, h = client, login_app(client, u.email)
    else:
        c, h = cliente_web(app, u.email), {}
    for metodo, ruta, body in RUTAS[dueno]:
        r = _pedir(c, metodo, ruta, body, h)
        if r.status_code == 403:
            # Únicas 403 legítimas para el dueño: reglas de negocio con su propio código
            assert r.json()["error"]["codigo"] != "PROHIBIDO", (metodo, ruta, r.text)
        assert r.status_code < 500, (metodo, ruta, r.text)
