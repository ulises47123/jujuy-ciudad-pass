# Jujuy Ciudad Pass — backend

API REST (FastAPI + SQLAlchemy 2 + SQLite WAL). El contrato completo está en `../docs/API.md`.

## Desarrollo (Windows / PowerShell)

```powershell
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements-dev.txt
.venv\Scripts\python -m app.cli seed-demo        # imprime los usuarios demo y sus contraseñas
$env:JCP_SERVIR_WEB = "1"                         # opcional: sirve ../web en http://localhost:8000/
.venv\Scripts\uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

En Linux: `.venv/bin/...` en lugar de `.venv\Scripts\...`.

- Salud: `GET http://localhost:8000/api/v1/salud`
- Documentación interactiva (solo dev): `http://localhost:8000/api/v1/docs`
- La base por defecto es `backend/data/jujuy-pass.db` (se crea sola). Para empezar de cero, borrala.

## Configuración

Variables de entorno `JCP_*` (en dev también se leen de `backend/.env`, formato `CLAVE=valor`).
Las principales: `JCP_ENTORNO` (`dev`|`prod`), `JCP_DB_PATH`, `JCP_COOKIE_SECURE`, `JCP_SERVIR_WEB`,
`JCP_LOG_LEVEL`, `JCP_BCRYPT_ROUNDS`. La lista completa con valores por defecto está en `docs/API.md` §6.

Producción (detrás de nginx, un solo worker: los rate limits viven en memoria):

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 --proxy-headers --forwarded-allow-ips 127.0.0.1
```

## CLI

```bash
python -m app.cli crear-admin --email admin@ejemplo.com --nombre "Nombre"   # pide la contraseña
python -m app.cli seed-demo                                                # solo dev; se niega con JCP_ENTORNO=prod
```

`seed-demo` carga 8 lugares reales del centro de San Salvador de Jujuy con trivia, 4 negocios con beneficios,
una temporada activa (×1.5) y un usuario por rol. Las contraseñas son aleatorias y solo se muestran por consola.

## Tests

```powershell
.venv\Scripts\python -m pytest
```

Usan una base SQLite temporal por test. `scripts/smoke.py` hace una prueba de humo contra un servidor real
(`python scripts/smoke.py http://127.0.0.1:8000 <email_turista> <password_turista>` después de `seed-demo`).

## Estructura

```
app/
  main.py        crear_app(): routers, manejadores de error, estáticos en dev
  config.py      variables JCP_*
  db.py          motor, pragmas SQLite, escritura() = BEGIN IMMEDIATE
  modelos.py     tablas
  esquemas.py    validación de entrada (Pydantic v2)
  serializar.py  objetos JSON del contrato
  seguridad.py   bcrypt, sesiones (Bearer app / cookie web), CSRF X-JCP
  antitrampa.py  reglas GPS
  rate_limit.py  límites en memoria
  servicios.py   canjes, cupones, temporadas, paginación
  cli.py         crear-admin, seed-demo
  routers/       auth, turista, negocio, residente, admin
tests/
```
