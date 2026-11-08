"""/api/v1/auth: registro, login, logout, yo, cambiar-password."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import serializar, tiempo
from ..antitrampa import registrar_alerta
from ..config import obtener_config
from ..db import escritura, obtener_db
from ..errores import ErrorAPI, demasiados_intentos
from ..esquemas import CambiarPasswordEntrada, LoginEntrada, RegistroEntrada
from ..modelos import Dispositivo, IntentoLogin, Sesion, Usuario
from ..rate_limit import limitadores
from ..seguridad import (
    Autenticado,
    borrar_cookie,
    crear_sesion,
    hashear_password,
    ip_cliente,
    obtener_autenticado,
    poner_cookie,
    revocar_sesiones,
    verificar_password,
    verificar_password_falsa,
)

router = APIRouter(prefix="/auth", tags=["auth"])
log = logging.getLogger("jcp.auth")

ROLES_POR_CLIENTE = {"app": {"turista"}, "web": {"negocio", "residente", "admin"}}


def _email_en_uso() -> ErrorAPI:
    return ErrorAPI(409, "EMAIL_EN_USO", "Ya existe una cuenta con ese email.")


def _registrar_dispositivo(db: Session, dispositivo_id: str, usuario_id: int) -> None:
    existe = db.execute(
        select(Dispositivo.id).where(Dispositivo.dispositivo_id == dispositivo_id, Dispositivo.usuario_id == usuario_id)
    ).first()
    if not existe:
        db.add(Dispositivo(dispositivo_id=dispositivo_id, usuario_id=usuario_id, creado_en=tiempo.ahora()))


@router.post("/registro", status_code=201)
def registro(datos: RegistroEntrada, request: Request, db: Session = Depends(obtener_db)):
    cfg = obtener_config()
    lim = limitadores().registro
    ip = ip_cliente(request)
    espera = lim.bloqueado(ip)
    if espera:
        raise demasiados_intentos(espera)

    # Chequeo previo barato (antes de gastar CPU en bcrypt)
    if db.execute(select(Usuario.id).where(Usuario.email == datos.email)).first():
        raise _email_en_uso()

    def _cuentas_en_dispositivo() -> int:
        return db.execute(
            select(func.count(func.distinct(Dispositivo.usuario_id)))
            .join(Usuario, Usuario.id == Dispositivo.usuario_id)
            .where(Dispositivo.dispositivo_id == datos.dispositivo_id, Usuario.rol == "turista")
        ).scalar_one()

    if _cuentas_en_dispositivo() >= cfg.dispositivo_max_cuentas:
        registrar_alerta(db, "DISPOSITIVO_CON_DEMASIADAS_CUENTAS", None,
                         {"dispositivo_id": datos.dispositivo_id, "email": datos.email, "ip": ip})
        raise ErrorAPI(403, "DISPOSITIVO_CON_DEMASIADAS_CUENTAS",
                       "Este dispositivo ya tiene demasiadas cuentas registradas.")

    password_hash = hashear_password(datos.password)
    lim.registrar(ip)
    db.rollback()
    try:
        with escritura(db):
            # Re-chequeo dentro de la transacción de escritura
            if db.execute(select(Usuario.id).where(Usuario.email == datos.email)).first():
                raise _email_en_uso()
            if _cuentas_en_dispositivo() >= cfg.dispositivo_max_cuentas:
                raise ErrorAPI(403, "DISPOSITIVO_CON_DEMASIADAS_CUENTAS",
                               "Este dispositivo ya tiene demasiadas cuentas registradas.")
            momento = tiempo.ahora()
            u = Usuario(nombre=datos.nombre, email=datos.email, password_hash=password_hash, rol="turista",
                        procedencia=datos.procedencia or None, creado_en=momento)
            db.add(u)
            db.flush()
            _registrar_dispositivo(db, datos.dispositivo_id, u.id)
            token = crear_sesion(db, u.id, "app")
    except IntegrityError:
        raise _email_en_uso()
    log.info("Registro turista id=%s", u.id)
    return {"token": token, "usuario": serializar.usuario(u)}


@router.post("/login")
def login(datos: LoginEntrada, request: Request, response: Response, db: Session = Depends(obtener_db)):
    lim = limitadores().login
    email = datos.email.strip().lower()
    ip = ip_cliente(request)
    clave = f"{email}|{ip}"
    espera = lim.bloqueado(clave)
    if espera:
        raise demasiados_intentos(espera, "Demasiados intentos fallidos. Esperá unos minutos y probá de nuevo.")

    u = db.execute(select(Usuario).where(Usuario.email == email)).scalar_one_or_none()
    if u is None:
        verificar_password_falsa(datos.password)
        ok = False
    else:
        ok = verificar_password(datos.password, u.password_hash)

    if not ok:
        lim.registrar(clave)
        with escritura(db):
            db.add(IntentoLogin(email=email[:254], ip=ip[:64], exito=False, creado_en=tiempo.ahora()))
        raise ErrorAPI(401, "CREDENCIALES_INVALIDAS", "Email o contraseña incorrectos.")

    lim.reiniciar(clave)
    if u.bloqueado:
        raise ErrorAPI(403, "CUENTA_BLOQUEADA", "Tu cuenta está bloqueada. Contactá a la administración.")
    if u.rol not in ROLES_POR_CLIENTE[datos.cliente]:
        if datos.cliente == "web":
            mensaje = "Los turistas ingresan desde la app de Jujuy Ciudad Pass."
        else:
            mensaje = "Esta cuenta se usa desde el panel web."
        raise ErrorAPI(403, "ROL_NO_PERMITIDO_EN_CLIENTE", mensaje)

    with escritura(db):
        token = crear_sesion(db, u.id, datos.cliente)
        if datos.cliente == "app" and datos.dispositivo_id:
            _registrar_dispositivo(db, datos.dispositivo_id, u.id)

    if datos.cliente == "web":
        poner_cookie(response, token)
        return {"usuario": serializar.usuario(u)}
    return {"token": token, "usuario": serializar.usuario(u)}


@router.post("/logout")
def logout(response: Response, auth: Autenticado = Depends(obtener_autenticado), db: Session = Depends(obtener_db)):
    with escritura(db):
        db.execute(delete(Sesion).where(Sesion.id == auth.sesion_id))
    if auth.via_cookie:
        borrar_cookie(response)
    return {"ok": True}


@router.get("/yo")
def yo(auth: Autenticado = Depends(obtener_autenticado)):
    return {"usuario": serializar.usuario(auth.usuario)}


@router.post("/cambiar-password")
def cambiar_password(datos: CambiarPasswordEntrada, auth: Autenticado = Depends(obtener_autenticado),
                     db: Session = Depends(obtener_db)):
    if not verificar_password(datos.actual, auth.usuario.password_hash):
        raise ErrorAPI(400, "PASSWORD_ACTUAL_INCORRECTA", "La contraseña actual no es correcta.")
    nuevo_hash = hashear_password(datos.nueva)
    with escritura(db):
        u = db.get(Usuario, auth.usuario.id)
        u.password_hash = nuevo_hash
        revocar_sesiones(db, u.id, excepto_id=auth.sesion_id)
    return {"ok": True}
