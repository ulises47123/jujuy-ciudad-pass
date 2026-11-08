from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select, update

from app import db as dbmod
from app import tiempo
from app.modelos import Alerta, Sesion
from conftest import PASSWORD, cliente_web, crear_usuario, error, login_app

API = "/api/v1"


def registrar(client, email="ana@x.com", dispositivo="disp-0000-aaaa", **extra):
    body = {"nombre": "Ana", "email": email, "password": "superclave1", "dispositivo_id": dispositivo, **extra}
    return client.post(f"{API}/auth/registro", json=body)


def test_salud(client):
    r = client.get(f"{API}/salud")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "version": "1.0.0"}
    assert r.headers["x-content-type-options"] == "nosniff"


def test_ruta_inexistente_formato_error(client):
    r = client.get(f"{API}/no-existe")
    assert r.status_code == 404 and error(r) == "NO_ENCONTRADO"
    r = client.delete(f"{API}/salud")
    assert r.status_code == 405 and error(r) == "METODO_NO_PERMITIDO"


def test_registro_ok_devuelve_token_y_turista(client):
    r = registrar(client, email="  ANA@X.com ", procedencia="Córdoba")
    assert r.status_code == 201, r.text
    datos = r.json()
    assert datos["usuario"]["rol"] == "turista"
    assert datos["usuario"]["email"] == "ana@x.com"
    assert datos["usuario"]["rango"] == "Novato"
    assert datos["usuario"]["negocio"] is None
    h = {"Authorization": f"Bearer {datos['token']}"}
    assert client.get(f"{API}/auth/yo", headers=h).json()["usuario"]["email"] == "ana@x.com"


def test_registro_ignora_rol_enviado(client):
    r = registrar(client, rol="admin")
    assert r.status_code == 201 and r.json()["usuario"]["rol"] == "turista"


def test_registro_email_en_uso(client):
    assert registrar(client).status_code == 201
    r = registrar(client, email="ANA@x.com", dispositivo="otro-disp-111")
    assert r.status_code == 409 and error(r) == "EMAIL_EN_USO"


def test_registro_datos_invalidos(client):
    r = client.post(f"{API}/auth/registro", json={"nombre": "A", "email": "no-es-email", "password": "corta",
                                                  "dispositivo_id": "x"})
    assert r.status_code == 422 and error(r) == "DATOS_INVALIDOS"
    assert {c["campo"] for c in r.json()["error"]["datos"]["campos"]} >= {"email", "password", "dispositivo_id"}


def test_registro_dispositivo_con_demasiadas_cuentas(client, sesion):
    for i in range(3):
        assert registrar(client, email=f"u{i}@x.com", dispositivo="mismo-disp-01").status_code == 201
    r = registrar(client, email="u4@x.com", dispositivo="mismo-disp-01")
    assert r.status_code == 403 and error(r) == "DISPOSITIVO_CON_DEMASIADAS_CUENTAS"
    alertas = sesion.execute(select(Alerta).where(Alerta.tipo == "DISPOSITIVO_CON_DEMASIADAS_CUENTAS")).scalars().all()
    assert len(alertas) == 1
    # Otro dispositivo sí puede
    assert registrar(client, email="u4@x.com", dispositivo="otro-disp-02").status_code == 201


def test_login_app_turista_y_web_otros_roles(client, app):
    t = crear_usuario("turista")
    r = client.post(f"{API}/auth/login", json={"email": t.email, "password": PASSWORD, "cliente": "app"})
    assert r.status_code == 200 and "token" in r.json() and r.json()["usuario"]["rol"] == "turista"
    for rol in ("negocio", "residente", "admin"):
        u = crear_usuario(rol)
        c = TestClient(app)
        r = c.post(f"{API}/auth/login", json={"email": u.email, "password": PASSWORD, "cliente": "web"})
        assert r.status_code == 200, r.text
        assert "token" not in r.json() and r.json()["usuario"]["rol"] == rol
        cookie = r.headers["set-cookie"]
        assert "jcp_sesion=" in cookie and "HttpOnly" in cookie and "samesite=strict" in cookie.lower()
        assert c.get(f"{API}/auth/yo").json()["usuario"]["email"] == u.email


def test_login_usuario_negocio_trae_datos_negocio(client, app):
    u = crear_usuario("negocio")
    c = cliente_web(app, u.email)
    neg = c.get(f"{API}/auth/yo").json()["usuario"]["negocio"]
    assert neg["nombre"].startswith("Negocio") and set(neg) == {"id", "nombre", "direccion", "telefono", "descripcion"}


def test_login_turista_por_web_403(client):
    t = crear_usuario("turista")
    r = client.post(f"{API}/auth/login", json={"email": t.email, "password": PASSWORD, "cliente": "web"})
    assert r.status_code == 403 and error(r) == "ROL_NO_PERMITIDO_EN_CLIENTE"
    assert "set-cookie" not in r.headers


def test_login_otros_roles_por_app_403(client):
    for rol in ("negocio", "residente", "admin"):
        u = crear_usuario(rol)
        r = client.post(f"{API}/auth/login", json={"email": u.email, "password": PASSWORD, "cliente": "app"})
        assert r.status_code == 403 and error(r) == "ROL_NO_PERMITIDO_EN_CLIENTE", rol


def test_login_credenciales_invalidas_mismo_mensaje(client):
    t = crear_usuario("turista")
    r1 = client.post(f"{API}/auth/login", json={"email": t.email, "password": "mala-clave", "cliente": "app"})
    r2 = client.post(f"{API}/auth/login", json={"email": "nadie@x.com", "password": "mala-clave", "cliente": "app"})
    assert r1.status_code == r2.status_code == 401
    assert r1.json() == r2.json()
    assert error(r1) == "CREDENCIALES_INVALIDAS"


def test_login_cuenta_bloqueada(client):
    t = crear_usuario("turista", bloqueado=True)
    r = client.post(f"{API}/auth/login", json={"email": t.email, "password": PASSWORD, "cliente": "app"})
    assert r.status_code == 403 and error(r) == "CUENTA_BLOQUEADA"


def test_rate_limit_login(client):
    t = crear_usuario("turista")
    for _ in range(5):
        r = client.post(f"{API}/auth/login", json={"email": t.email, "password": "incorrecta", "cliente": "app"})
        assert r.status_code == 401
    # Aun con la contraseña correcta: bloqueado
    r = client.post(f"{API}/auth/login", json={"email": t.email, "password": PASSWORD, "cliente": "app"})
    assert r.status_code == 429 and error(r) == "DEMASIADOS_INTENTOS"
    assert int(r.headers["retry-after"]) > 0
    assert r.json()["error"]["datos"]["reintentar_en_s"] > 0
    # Otro email desde la misma IP no está afectado
    t2 = crear_usuario("turista")
    assert client.post(f"{API}/auth/login", json={"email": t2.email, "password": PASSWORD,
                                                  "cliente": "app"}).status_code == 200


def test_login_exitoso_reinicia_contador(client):
    t = crear_usuario("turista")
    for _ in range(4):
        client.post(f"{API}/auth/login", json={"email": t.email, "password": "incorrecta", "cliente": "app"})
    assert client.post(f"{API}/auth/login", json={"email": t.email, "password": PASSWORD,
                                                  "cliente": "app"}).status_code == 200
    for _ in range(4):
        r = client.post(f"{API}/auth/login", json={"email": t.email, "password": "incorrecta", "cliente": "app"})
        assert r.status_code == 401


def test_sin_token_401(client):
    r = client.get(f"{API}/auth/yo")
    assert r.status_code == 401 and error(r) == "NO_AUTENTICADO"
    r = client.get(f"{API}/auth/yo", headers={"Authorization": "Bearer inventado"})
    assert r.status_code == 401 and error(r) == "NO_AUTENTICADO"
    r = client.get(f"{API}/auth/yo", headers={"Authorization": "Basic abc"})
    assert r.status_code == 401


def test_token_se_guarda_hasheado(client, sesion):
    t = crear_usuario("turista")
    h = login_app(client, t.email)
    token = h["Authorization"].split()[1]
    hashes = sesion.execute(select(Sesion.token_hash)).scalars().all()
    assert token not in hashes and all(len(x) == 64 for x in hashes)


def test_sesion_expirada(client, sesion):
    t = crear_usuario("turista")
    h = login_app(client, t.email)
    sesion.execute(update(Sesion).values(vence_en=tiempo.ahora() - timedelta(seconds=1)))
    sesion.commit()
    r = client.get(f"{API}/auth/yo", headers=h)
    assert r.status_code == 401 and error(r) == "SESION_EXPIRADA"
    # La sesión vencida se borra: el siguiente intento es NO_AUTENTICADO
    assert error(client.get(f"{API}/auth/yo", headers=h)) == "NO_AUTENTICADO"


def test_sesion_web_deslizante(app, sesion):
    u = crear_usuario("admin")
    c = cliente_web(app, u.email)
    s = sesion.execute(select(Sesion)).scalar_one()
    viejo = tiempo.ahora() - timedelta(hours=11)
    sesion.execute(update(Sesion).where(Sesion.id == s.id).values(ultimo_uso=viejo,
                                                                   vence_en=viejo + timedelta(hours=12)))
    sesion.commit()
    r = c.get(f"{API}/auth/yo")
    assert r.status_code == 200
    assert "jcp_sesion=" in r.headers.get("set-cookie", "")
    sesion.expire_all()
    nuevo = sesion.execute(select(Sesion)).scalar_one()
    assert nuevo.vence_en > tiempo.ahora() + timedelta(hours=11)


def test_token_web_no_sirve_como_bearer_ni_app_como_cookie(client, app):
    u = crear_usuario("admin")
    c = cliente_web(app, u.email)
    token_web = c.cookies.get("jcp_sesion")
    r = client.get(f"{API}/auth/yo", headers={"Authorization": f"Bearer {token_web}"})
    assert r.status_code == 401
    t = crear_usuario("turista")
    token_app = login_app(client, t.email)["Authorization"].split()[1]
    c2 = TestClient(app)
    c2.cookies.set("jcp_sesion", token_app)
    assert c2.get(f"{API}/auth/yo").status_code == 401


def test_logout_app_y_web(client, app):
    t = crear_usuario("turista")
    h = login_app(client, t.email)
    assert client.post(f"{API}/auth/logout", headers=h).json() == {"ok": True}
    assert client.get(f"{API}/auth/yo", headers=h).status_code == 401
    u = crear_usuario("residente")
    c = cliente_web(app, u.email)
    r = c.post(f"{API}/auth/logout")
    assert r.status_code == 200 and "jcp_sesion=" in r.headers["set-cookie"]
    assert c.get(f"{API}/auth/yo").status_code == 401


def test_csrf_requiere_x_jcp_en_no_get_con_cookie(app):
    u = crear_usuario("residente")
    c = cliente_web(app, u.email)
    cookie = c.cookies.get("jcp_sesion")
    sin = TestClient(app)
    sin.cookies.set("jcp_sesion", cookie)
    # GET sin header: permitido
    assert sin.get(f"{API}/auth/yo").status_code == 200
    # POST sin header: 403
    body = {"titulo": "Algo", "categoria": "Otro", "descripcion": "texto"}
    r = sin.post(f"{API}/residente/recomendaciones", json=body)
    assert r.status_code == 403 and error(r) == "PROHIBIDO"
    r = sin.post(f"{API}/residente/recomendaciones", json=body, headers={"X-JCP": "0"})
    assert r.status_code == 403
    r = sin.post(f"{API}/auth/logout")
    assert r.status_code == 403
    # Con header: OK
    assert sin.post(f"{API}/residente/recomendaciones", json=body, headers={"X-JCP": "1"}).status_code == 201


def test_csrf_no_aplica_a_bearer(client):
    t = crear_usuario("turista")
    h = login_app(client, t.email)
    assert client.post(f"{API}/auth/logout", headers=h).status_code == 200


def test_cambiar_password_revoca_otras_sesiones(client):
    t = crear_usuario("turista")
    h1 = login_app(client, t.email)
    h2 = login_app(client, t.email)
    r = client.post(f"{API}/auth/cambiar-password", headers=h1, json={"actual": "mala-clave", "nueva": "nueva-clave-9"})
    assert r.status_code == 400 and error(r) == "PASSWORD_ACTUAL_INCORRECTA"
    r = client.post(f"{API}/auth/cambiar-password", headers=h1, json={"actual": PASSWORD, "nueva": "corta"})
    assert r.status_code == 422
    r = client.post(f"{API}/auth/cambiar-password", headers=h1, json={"actual": PASSWORD, "nueva": "nueva-clave-9"})
    assert r.json() == {"ok": True}
    assert client.get(f"{API}/auth/yo", headers=h1).status_code == 200
    assert client.get(f"{API}/auth/yo", headers=h2).status_code == 401
    assert client.post(f"{API}/auth/login", json={"email": t.email, "password": "nueva-clave-9",
                                                  "cliente": "app"}).status_code == 200


def test_registro_rate_limit_por_ip(client):
    for i in range(10):
        assert registrar(client, email=f"r{i}@x.com", dispositivo=f"dispositivo-{i:04d}").status_code == 201
    r = registrar(client, email="r99@x.com", dispositivo="dispositivo-9999")
    assert r.status_code == 429 and error(r) == "DEMASIADOS_INTENTOS"


def test_error_interno_no_filtra_trazas(app, monkeypatch):
    from app.routers import turista

    def explotar(*a, **k):
        raise RuntimeError("detalle secreto de la base")

    monkeypatch.setattr(turista, "serializar", type("X", (), {"lugar_turista": explotar}))
    from conftest import crear_lugar
    crear_lugar()
    t = crear_usuario("turista")
    c = TestClient(app, raise_server_exceptions=False)
    h = login_app(c, t.email)
    r = c.get(f"{API}/lugares", headers=h)
    assert r.status_code == 500
    assert error(r) == "ERROR_INTERNO"
    assert "secreto" not in r.text and "Traceback" not in r.text


def test_db_wal_y_foreign_keys(app):
    with dbmod.engine.connect() as conn:
        assert conn.exec_driver_sql("PRAGMA journal_mode").scalar() == "wal"
        assert conn.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1
        assert conn.exec_driver_sql("PRAGMA busy_timeout").scalar() >= 1000
