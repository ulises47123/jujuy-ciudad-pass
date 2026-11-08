"""Fixtures comunes: app con base SQLite temporal, usuarios y helpers de GPS."""
from __future__ import annotations

import itertools
import math
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from app import db as dbmod
from app import tiempo
from app.config import Config
from app.main import crear_app
from app.modelos import Beneficio, Lugar, Negocio, Pregunta, Usuario
from app.seguridad import hashear_password

PASSWORD = "clave-segura-1"
_contador = itertools.count(1)

# Plaza Belgrano aprox.
LAT0, LON0 = -24.18580, -65.29955


@pytest.fixture
def cfg(tmp_path) -> Config:
    return Config(entorno="dev", db_path=str(tmp_path / "test.db"), bcrypt_rounds=4, log_level="WARNING",
                  web_dir=str(tmp_path / "web-inexistente"))


@pytest.fixture
def app(cfg):
    aplicacion = crear_app(cfg)
    yield aplicacion
    dbmod.engine.dispose()


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c


@pytest.fixture
def sesion(app):
    s = dbmod.SessionLocal()
    yield s
    s.close()


# ---------------------------------------------------------------- creación directa en la base
def crear_usuario(rol: str = "turista", email: str | None = None, nombre: str | None = None,
                  password: str = PASSWORD, puntos: int = 0, **extra) -> Usuario:
    n = next(_contador)
    email = email or f"{rol}{n}@test.com"
    with dbmod.SessionLocal() as s:
        u = Usuario(nombre=nombre or f"{rol.title()} {n}", email=email, password_hash=hashear_password(password),
                    rol=rol, puntos=puntos, puntos_historicos=puntos, **extra)
        s.add(u)
        s.flush()
        if rol == "negocio":
            s.add(Negocio(usuario_id=u.id, nombre=f"Negocio {n}", direccion="Calle 1", telefono="123",
                          descripcion="desc"))
        s.commit()
        s.refresh(u)
        return u


def negocio_de(usuario_id: int) -> Negocio:
    with dbmod.SessionLocal() as s:
        return s.query(Negocio).filter_by(usuario_id=usuario_id).one()


def crear_lugar(lat: float = LAT0, lon: float = LON0, radio_m: int = 100, puntos: int = 50, activo: bool = True,
                preguntas: int = 1, nombre: str | None = None) -> Lugar:
    with dbmod.SessionLocal() as s:
        l = Lugar(nombre=nombre or f"Lugar {next(_contador)}", descripcion="d", direccion="dir", categoria="Historia",
                  latitud=lat, longitud=lon, radio_m=radio_m, puntos=puntos, activo=activo)
        s.add(l)
        s.flush()
        for i in range(preguntas):
            s.add(Pregunta(lugar_id=l.id, texto=f"Pregunta {i}", opciones=["Correcta", "Mala A", "Mala B"],
                           correcta_index=0, activa=True))
        s.commit()
        s.refresh(l)
        return l


def crear_beneficio(negocio_id: int, puntos: int = 100, stock: int | None = None, estado: str = "APROBADO",
                    activo: bool = True, dias_validez: int = 30) -> Beneficio:
    with dbmod.SessionLocal() as s:
        b = Beneficio(negocio_id=negocio_id, titulo=f"Beneficio {next(_contador)}", descripcion="d", puntos=puntos,
                      dias_validez=dias_validez, stock=stock, estado=estado, activo=activo)
        s.add(b)
        s.commit()
        s.refresh(b)
        return b


# ---------------------------------------------------------------- sesiones
def login_app(client: TestClient, email: str, password: str = PASSWORD) -> dict:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": password, "cliente": "app",
                                                "dispositivo_id": "dispositivo-test-01"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def cliente_web(app, email: str, password: str = PASSWORD) -> TestClient:
    """TestClient nuevo con la cookie de sesión web y el header X-JCP por defecto."""
    c = TestClient(app, headers={"X-JCP": "1"})
    r = c.post("/api/v1/auth/login", json={"email": email, "password": password, "cliente": "web"})
    assert r.status_code == 200, r.text
    return c


# ---------------------------------------------------------------- GPS
def desplazar(lat: float, lon: float, norte_m: float = 0.0, este_m: float = 0.0) -> tuple[float, float]:
    dlat = norte_m / 111_320.0
    dlon = este_m / (111_320.0 * math.cos(math.radians(lat)))
    return lat + dlat, lon + dlon


def muestras(lat: float = LAT0, lon: float = LON0, n: int = 3, precision: float = 10.0, separacion_ms: int = 3000,
             reloj_ms: int | None = None, mock: bool = False, jitter: bool = True, desfase_ms: int = 0):
    """Devuelve (reloj_ms, muestras) con la última muestra 1 s antes del reloj del cliente.

    `desfase_ms` simula un teléfono con la hora corrida (reloj del cliente = servidor - desfase).
    """
    reloj = reloj_ms if reloj_ms is not None else tiempo.ahora_ms() - desfase_ms
    lista = []
    for i in range(n):
        dl = (i * 0.00001) if jitter else 0.0
        lista.append({"lat": lat + dl, "lon": lon, "precision_m": precision,
                      "tiempo_ms": reloj - 1000 - (n - 1 - i) * separacion_ms, "mock": mock})
    return reloj, lista


def cuerpo_iniciar(lugar_id: int, **kw) -> dict:
    reloj, lista = muestras(**kw)
    return {"lugar_id": lugar_id, "dispositivo_id": "dispositivo-test-01", "reloj_ms": reloj, "muestras": lista}


def muestra_unica(lat: float = LAT0, lon: float = LON0, precision: float = 8.0, mock: bool = False) -> dict:
    ahora = tiempo.ahora_ms()
    return {"lat": lat, "lon": lon, "precision_m": precision, "tiempo_ms": ahora - 500, "mock": mock}


def responder_correcto(client: TestClient, headers: dict, intento: dict, lat: float = LAT0, lon: float = LON0):
    """Elige la opción 'Correcta' (las preguntas de test la tienen siempre)."""
    idx = intento["opciones"].index("Correcta")
    return client.post("/api/v1/visitas/responder", headers=headers,
                       json={"intento_id": intento["intento_id"], "opcion_index": idx,
                             "muestra": muestra_unica(lat, lon), "reloj_ms": tiempo.ahora_ms()})


def responder_incorrecto(client: TestClient, headers: dict, intento: dict):
    idx = next(i for i, o in enumerate(intento["opciones"]) if o != "Correcta")
    return client.post("/api/v1/visitas/responder", headers=headers,
                       json={"intento_id": intento["intento_id"], "opcion_index": idx,
                             "muestra": muestra_unica(), "reloj_ms": tiempo.ahora_ms()})


def ganar_puntos(client: TestClient, headers: dict, lugar: Lugar) -> dict:
    r = client.post("/api/v1/visitas/iniciar", headers=headers, json=cuerpo_iniciar(lugar.id, lat=lugar.latitud,
                                                                                    lon=lugar.longitud))
    assert r.status_code == 200, r.text
    r2 = responder_correcto(client, headers, r.json(), lugar.latitud, lugar.longitud)
    assert r2.status_code == 200, r2.text
    return r2.json()


def error(r) -> str:
    return r.json()["error"]["codigo"]


__all__ = ["replace"]
