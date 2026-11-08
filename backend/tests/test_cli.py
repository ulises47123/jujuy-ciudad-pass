import subprocess
import sys
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import func, select

BACKEND = Path(__file__).resolve().parent.parent


def correr(args, env_extra, entrada=None):
    import os
    env = {**os.environ, **env_extra}
    return subprocess.run([sys.executable, "-m", "app.cli", *args], cwd=BACKEND, env=env, input=entrada,
                          capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)


def test_seed_demo_se_niega_en_prod(tmp_path):
    db = tmp_path / "prod.db"
    r = correr(["seed-demo"], {"JCP_ENTORNO": "prod", "JCP_DB_PATH": str(db)})
    assert r.returncode != 0
    assert "prod" in r.stderr
    assert not db.exists()


def test_seed_demo_y_crear_admin(tmp_path):
    db = tmp_path / "dev.db"
    env = {"JCP_ENTORNO": "dev", "JCP_DB_PATH": str(db), "JCP_BCRYPT_ROUNDS": "4"}
    r = correr(["seed-demo"], env)
    assert r.returncode == 0, r.stderr
    lineas = {l.split()[0]: l.split() for l in r.stdout.splitlines() if l.startswith("  ") and "@" in l}
    assert set(lineas) >= {"turista", "negocio", "residente", "admin"}
    # segunda vez se niega
    assert correr(["seed-demo"], env).returncode != 0

    r = correr(["crear-admin", "--email", "Jefa@Muni.gob.ar", "--nombre", "Jefa"], env, entrada="clave-de-jefa\n")
    assert r.returncode == 0, r.stderr
    r = correr(["crear-admin", "--email", "otra@muni.gob.ar", "--nombre", "Otra"], env, entrada="corta\n")
    assert r.returncode != 0

    # La app arranca con esa base y los datos demo funcionan
    from app.config import Config
    from app.main import crear_app
    from app import db as dbmod
    from app.modelos import Lugar, Pregunta, Temporada

    app = crear_app(Config(entorno="dev", db_path=str(db), bcrypt_rounds=4, log_level="WARNING"))
    c = TestClient(app)
    turista = lineas["turista"]
    r = c.post("/api/v1/auth/login", json={"email": turista[1], "password": turista[2], "cliente": "app"})
    assert r.status_code == 200
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    lugares = c.get("/api/v1/lugares", headers=h).json()
    assert len(lugares) >= 8
    assert len(c.get("/api/v1/beneficios", headers=h).json()) >= 4
    with dbmod.SessionLocal() as s:
        assert s.execute(select(func.count(Pregunta.id))).scalar_one() >= 16
        assert s.execute(select(func.count(Temporada.id)).where(Temporada.activa.is_(True))).scalar_one() == 1
        for l in s.execute(select(Lugar)).scalars():
            assert -24.25 < l.latitud < -24.15 and -65.35 < l.longitud < -65.25
    admin = lineas["admin"]
    r = c.post("/api/v1/auth/login", json={"email": "jefa@muni.gob.ar", "password": "clave-de-jefa",
                                           "cliente": "web"})
    assert r.status_code == 200 and r.json()["usuario"]["rol"] == "admin"
    r = c.post("/api/v1/auth/login", json={"email": admin[1], "password": admin[2], "cliente": "web"})
    assert r.status_code == 200
    dbmod.engine.dispose()
