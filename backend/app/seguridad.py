"""Contraseñas, tokens de sesión, autenticación (Bearer / cookie) y CSRF."""
from __future__ import annotations

import base64
import hashlib
import secrets
from dataclasses import dataclass
from datetime import timedelta
from typing import Callable

import bcrypt
from fastapi import Depends, Request, Response
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from . import tiempo
from .config import obtener_config
from .db import escritura, obtener_db
from .errores import ErrorAPI, no_autenticado, prohibido
from .modelos import Sesion, Usuario

COOKIE_SESION = "jcp_sesion"
METODOS_SEGUROS = {"GET", "HEAD", "OPTIONS"}
RENOVAR_CADA_S = 60


# ---------------------------------------------------------------- contraseñas
def _prehash(password: str) -> bytes:
    # SHA-256 + base64 antes de bcrypt: evita el límite de 72 bytes y los NUL.
    return base64.b64encode(hashlib.sha256(password.encode("utf-8")).digest())


def hashear_password(password: str) -> str:
    sal = bcrypt.gensalt(rounds=obtener_config().bcrypt_rounds)
    return bcrypt.hashpw(_prehash(password), sal).decode("ascii")


def verificar_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_prehash(password), password_hash.encode("ascii"))
    except (ValueError, TypeError):
        return False


_hash_falso: str | None = None


def verificar_password_falsa(password: str) -> None:
    """Gasta el mismo tiempo que una verificación real (email inexistente)."""
    global _hash_falso
    if _hash_falso is None:
        _hash_falso = hashear_password(secrets.token_urlsafe(16))
    verificar_password(password, _hash_falso)


def password_aleatoria(largo: int = 12) -> str:
    alfabeto = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alfabeto) for _ in range(largo))


# ---------------------------------------------------------------- tokens / sesiones
def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def duracion_sesion(cliente: str) -> timedelta:
    cfg = obtener_config()
    if cliente == "app":
        return timedelta(days=cfg.sesion_app_dias)
    return timedelta(hours=cfg.sesion_web_horas)


def crear_sesion(db: Session, usuario_id: int, cliente: str) -> str:
    """Crea la sesión dentro de la transacción en curso y devuelve el token en claro."""
    token = secrets.token_urlsafe(32)
    momento = tiempo.ahora()
    db.add(
        Sesion(
            token_hash=hash_token(token),
            usuario_id=usuario_id,
            cliente=cliente,
            vence_en=momento + duracion_sesion(cliente),
            ultimo_uso=momento,
            creado_en=momento,
        )
    )
    return token


def revocar_sesiones(db: Session, usuario_id: int, excepto_id: int | None = None) -> None:
    stmt = delete(Sesion).where(Sesion.usuario_id == usuario_id)
    if excepto_id is not None:
        stmt = stmt.where(Sesion.id != excepto_id)
    db.execute(stmt)


def poner_cookie(response: Response, token: str) -> None:
    cfg = obtener_config()
    response.set_cookie(
        COOKIE_SESION,
        token,
        max_age=cfg.sesion_web_horas * 3600,
        path="/",
        httponly=True,
        samesite="strict",
        secure=cfg.cookie_secure,
    )


def borrar_cookie(response: Response) -> None:
    cfg = obtener_config()
    response.delete_cookie(COOKIE_SESION, path="/", httponly=True, samesite="strict", secure=cfg.cookie_secure)


# ---------------------------------------------------------------- dependencias
@dataclass
class Autenticado:
    usuario: Usuario
    sesion_id: int
    cliente: str  # app | web
    via_cookie: bool


def _extraer_token(request: Request) -> tuple[str | None, bool]:
    auth = request.headers.get("authorization")
    if auth:
        partes = auth.split(None, 1)
        if len(partes) == 2 and partes[0].lower() == "bearer" and partes[1].strip():
            return partes[1].strip(), False
        raise no_autenticado()
    cookie = request.cookies.get(COOKIE_SESION)
    if cookie:
        return cookie, True
    return None, False


def obtener_autenticado(request: Request, response: Response, db: Session = Depends(obtener_db)) -> Autenticado:
    token, via_cookie = _extraer_token(request)
    if not token or len(token) > 200:
        raise no_autenticado()

    # CSRF: toda petición no GET autenticada por cookie debe traer X-JCP: 1
    if via_cookie and request.method not in METODOS_SEGUROS and request.headers.get("x-jcp") != "1":
        raise prohibido("Falta el encabezado de seguridad de la petición.")

    sesion = db.execute(select(Sesion).where(Sesion.token_hash == hash_token(token))).scalar_one_or_none()
    cliente_esperado = "web" if via_cookie else "app"
    if sesion is None or sesion.cliente != cliente_esperado:
        if via_cookie:
            borrar_cookie(response)
        raise no_autenticado()

    momento = tiempo.ahora()
    if sesion.vence_en <= momento:
        sesion_id = sesion.id
        db.rollback()
        with escritura(db):
            db.execute(delete(Sesion).where(Sesion.id == sesion_id))
        if via_cookie:
            borrar_cookie(response)
        raise ErrorAPI(401, "SESION_EXPIRADA", "Tu sesión expiró. Volvé a iniciar sesión.")

    usuario = db.get(Usuario, sesion.usuario_id)
    if usuario is None:
        raise no_autenticado()
    if usuario.bloqueado:
        raise ErrorAPI(403, "CUENTA_BLOQUEADA", "Tu cuenta está bloqueada. Contactá a la administración.")

    # Renovación: web es deslizante (12 h desde el último uso); en app solo se registra el uso.
    if (momento - sesion.ultimo_uso).total_seconds() >= RENOVAR_CADA_S:
        valores: dict = {"ultimo_uso": momento}
        if sesion.cliente == "web":
            valores["vence_en"] = momento + duracion_sesion("web")
        sesion_id = sesion.id
        db.commit()
        with escritura(db):
            db.execute(update(Sesion).where(Sesion.id == sesion_id).values(**valores))
        if via_cookie:
            poner_cookie(response, token)

    return Autenticado(usuario=usuario, sesion_id=sesion.id, cliente=sesion.cliente, via_cookie=via_cookie)


def requiere_rol(*roles: str) -> Callable[..., Autenticado]:
    def _dep(auth: Autenticado = Depends(obtener_autenticado)) -> Autenticado:
        if auth.usuario.rol not in roles:
            raise prohibido()
        return auth

    return _dep


def ip_cliente(request: Request) -> str:
    # Con uvicorn --proxy-headers --forwarded-allow-ips 127.0.0.1, request.client es la IP real.
    return request.client.host if request.client else "desconocida"
