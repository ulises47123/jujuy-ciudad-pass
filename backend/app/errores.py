"""Errores de la API con el formato {"error": {"codigo", "mensaje", "datos?"}}."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("jcp.errores")


class ErrorAPI(Exception):
    def __init__(
        self,
        status: int,
        codigo: str,
        mensaje: str,
        datos: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(codigo)
        self.status = status
        self.codigo = codigo
        self.mensaje = mensaje
        self.datos = datos
        self.headers = headers


def cuerpo_error(codigo: str, mensaje: str, datos: dict[str, Any] | None = None) -> dict:
    error: dict[str, Any] = {"codigo": codigo, "mensaje": mensaje}
    if datos is not None:
        error["datos"] = datos
    return {"error": error}


# Atajos de uso frecuente
def no_autenticado() -> ErrorAPI:
    return ErrorAPI(401, "NO_AUTENTICADO", "Tenés que iniciar sesión.")


def prohibido(mensaje: str = "No tenés permiso para esta acción.") -> ErrorAPI:
    return ErrorAPI(403, "PROHIBIDO", mensaje)


def no_encontrado(mensaje: str = "No encontrado.") -> ErrorAPI:
    return ErrorAPI(404, "NO_ENCONTRADO", mensaje)


def datos_invalidos(mensaje: str, datos: dict | None = None) -> ErrorAPI:
    return ErrorAPI(422, "DATOS_INVALIDOS", mensaje, datos)


def demasiados_intentos(reintentar_en_s: int, mensaje: str | None = None) -> ErrorAPI:
    reintentar_en_s = max(1, int(reintentar_en_s))
    return ErrorAPI(
        429,
        "DEMASIADOS_INTENTOS",
        mensaje or "Demasiados intentos. Probá de nuevo más tarde.",
        {"reintentar_en_s": reintentar_en_s},
        headers={"Retry-After": str(reintentar_en_s)},
    )


_MENSAJES_HTTP = {
    400: ("DATOS_INVALIDOS", "Petición inválida."),
    401: ("NO_AUTENTICADO", "Tenés que iniciar sesión."),
    403: ("PROHIBIDO", "No tenés permiso para esta acción."),
    404: ("NO_ENCONTRADO", "No encontrado."),
    405: ("METODO_NO_PERMITIDO", "Método no permitido."),
}


def _campo(loc: tuple) -> str:
    partes = [str(p) for p in loc if p not in ("body", "query", "path")]
    return ".".join(partes) or "cuerpo"


def registrar_manejadores(app: FastAPI) -> None:
    @app.exception_handler(ErrorAPI)
    async def _error_api(request: Request, exc: ErrorAPI):
        return JSONResponse(
            cuerpo_error(exc.codigo, exc.mensaje, exc.datos), status_code=exc.status, headers=exc.headers
        )

    @app.exception_handler(RequestValidationError)
    async def _validacion(request: Request, exc: RequestValidationError):
        campos = []
        for e in exc.errors()[:20]:
            campos.append({"campo": _campo(tuple(e.get("loc", ()))), "problema": str(e.get("msg", ""))[:200]})
        return JSONResponse(
            cuerpo_error("DATOS_INVALIDOS", "Hay datos inválidos en la petición.", {"campos": campos}),
            status_code=422,
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException):
        codigo, mensaje = _MENSAJES_HTTP.get(exc.status_code, ("ERROR", "Error."))
        if exc.status_code >= 500:
            codigo, mensaje = "ERROR_INTERNO", "Ocurrió un error inesperado."
        return JSONResponse(cuerpo_error(codigo, mensaje), status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def _inesperado(request: Request, exc: Exception):
        log.exception("Error no controlado en %s %s", request.method, request.url.path)
        return JSONResponse(
            cuerpo_error("ERROR_INTERNO", "Ocurrió un error inesperado. Probá de nuevo más tarde."),
            status_code=500,
        )
