"""Aplicación FastAPI de Jujuy Ciudad Pass."""
from __future__ import annotations

import logging
import sys
from pathlib import Path

from fastapi import APIRouter, FastAPI
from fastapi.staticfiles import StaticFiles

from . import db
from .config import Config, establecer_config, obtener_config
from .errores import registrar_manejadores
from .rate_limit import configurar_limitadores
from .routers import admin, auth, negocio, residente, turista

VERSION = "1.0.0"
log = logging.getLogger("jcp")


def _configurar_logging(nivel: str) -> None:
    raiz = logging.getLogger()
    if not any(getattr(h, "_jcp", False) for h in raiz.handlers):
        h = logging.StreamHandler(sys.stdout)
        h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
        h._jcp = True  # type: ignore[attr-defined]
        raiz.addHandler(h)
    raiz.setLevel(nivel)


class EncabezadosSeguridad:
    """Middleware ASGI mínimo: encabezados de seguridad y no-cache en /api."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        es_api = scope.get("path", "").startswith("/api/")

        async def _send(mensaje):
            if mensaje["type"] == "http.response.start":
                headers = list(mensaje.get("headers", []))
                headers.append((b"x-content-type-options", b"nosniff"))
                headers.append((b"referrer-policy", b"same-origin"))
                headers.append((b"x-frame-options", b"DENY"))
                if es_api:
                    headers.append((b"cache-control", b"no-store"))
                mensaje["headers"] = headers
            await send(mensaje)

        await self.app(scope, receive, _send)


def crear_app(config: Config | None = None) -> FastAPI:
    cfg = config or obtener_config()
    establecer_config(cfg)
    _configurar_logging(cfg.log_level)
    db.configurar(cfg.db_path)
    configurar_limitadores(cfg)

    es_dev = not cfg.es_prod
    app = FastAPI(
        title="Jujuy Ciudad Pass API",
        version=VERSION,
        docs_url="/api/v1/docs" if es_dev else None,
        redoc_url=None,
        openapi_url="/api/v1/openapi.json" if es_dev else None,
    )
    registrar_manejadores(app)

    api = APIRouter(prefix="/api/v1")

    @api.get("/salud", tags=["salud"])
    def salud():
        return {"ok": True, "version": VERSION}

    api.include_router(auth.router)
    api.include_router(turista.router)
    api.include_router(negocio.router)
    api.include_router(residente.router)
    api.include_router(admin.router)
    app.include_router(api)

    if cfg.servir_web:
        web = Path(cfg.web_dir)
        if web.is_dir():
            app.mount("/", StaticFiles(directory=str(web), html=True), name="web")
            log.info("Sirviendo el panel web desde %s", web)
        else:
            log.warning("JCP_SERVIR_WEB=1 pero no existe %s", web)

    app.add_middleware(EncabezadosSeguridad)
    log.info("Jujuy Ciudad Pass %s iniciado (entorno=%s, db=%s)", VERSION, cfg.entorno, cfg.db_path)
    return app


_app: FastAPI | None = None


def __getattr__(nombre: str):
    # `uvicorn app.main:app` crea la app recién al pedirla (importar el módulo no toca la base).
    global _app
    if nombre == "app":
        if _app is None:
            _app = crear_app()
        return _app
    raise AttributeError(nombre)
