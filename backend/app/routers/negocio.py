"""/api/v1/negocio: panel web de negocios adheridos."""
from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from .. import serializar, tiempo
from ..antitrampa import registrar_alerta
from ..db import escritura, obtener_db
from ..errores import ErrorAPI, demasiados_intentos, no_encontrado
from ..esquemas import BeneficioEntrada, BeneficioPatch, NegocioPerfilPatch
from ..modelos import Beneficio, Canje, Negocio
from ..rate_limit import limitadores
from ..seguridad import Autenticado, requiere_rol
from ..servicios import marcar_vencidos, normalizar_codigo

router = APIRouter(prefix="/negocio", tags=["negocio"])
log = logging.getLogger("jcp.negocio")
solo_negocio = requiere_rol("negocio")

EstadoCanje = Literal["DISPONIBLE", "USADO", "VENCIDO", "ANULADO"]


def _negocio_de(auth: Autenticado, db: Session) -> Negocio:
    n = db.execute(select(Negocio).where(Negocio.usuario_id == auth.usuario.id)).scalar_one_or_none()
    if n is None:
        raise ErrorAPI(403, "PROHIBIDO", "Tu usuario no tiene un negocio asociado.")
    return n


def _cupon_no_encontrado() -> ErrorAPI:
    return ErrorAPI(404, "CUPON_NO_ENCONTRADO", "No encontramos ese cupón.")


def _buscar_cupon(db: Session, negocio: Negocio, codigo_crudo: str) -> Canje:
    """Busca un cupón de este negocio aplicando el límite de consultas fallidas."""
    lim = limitadores().cupones
    clave = f"negocio:{negocio.id}"
    espera = lim.bloqueado(clave)
    if espera:
        raise demasiados_intentos(espera, "Demasiadas consultas de códigos inválidos. Esperá unos minutos.")
    codigo = normalizar_codigo(codigo_crudo)
    canje = None
    if codigo:
        canje = db.execute(
            select(Canje).join(Beneficio, Beneficio.id == Canje.beneficio_id)
            .where(Canje.codigo == codigo, Beneficio.negocio_id == negocio.id)
        ).unique().scalar_one_or_none()
    if canje is None:
        fallos = lim.registrar(clave)
        if fallos == lim.max_eventos:
            registrar_alerta(db, "FUERZA_BRUTA_CUPONES", negocio.usuario_id,
                             {"negocio_id": negocio.id, "fallos": fallos, "ventana_s": int(lim.ventana_s)})
        raise _cupon_no_encontrado()
    if canje.estado == "DISPONIBLE" and canje.vence_en <= tiempo.ahora():
        marcar_vencidos(db, canje_id=canje.id)
        db.refresh(canje)
    return canje


@router.get("/resumen")
def resumen(auth: Autenticado = Depends(solo_negocio), db: Session = Depends(obtener_db)):
    n = _negocio_de(auth, db)
    momento = tiempo.ahora()
    activos = db.execute(
        select(func.count(Beneficio.id)).where(
            Beneficio.negocio_id == n.id, Beneficio.estado == "APROBADO",
            Beneficio.activo.is_(True), Beneficio.eliminado.is_(False))
    ).scalar_one()
    base = select(func.count(Canje.id)).join(Beneficio, Beneficio.id == Canje.beneficio_id).where(
        Beneficio.negocio_id == n.id)
    usados_total = db.execute(base.where(Canje.estado == "USADO")).scalar_one()
    usados_mes = db.execute(
        base.where(Canje.estado == "USADO", Canje.usado_en >= tiempo.inicio_mes_argentina_utc(momento))
    ).scalar_one()
    pendientes = db.execute(base.where(Canje.estado == "DISPONIBLE", Canje.vence_en > momento)).scalar_one()
    return {
        "beneficios_activos": activos,
        "cupones_usados_total": usados_total,
        "cupones_usados_mes": usados_mes,
        "cupones_pendientes": pendientes,
    }


@router.get("/cupones/{codigo}")
def ver_cupon(codigo: str, auth: Autenticado = Depends(solo_negocio), db: Session = Depends(obtener_db)):
    n = _negocio_de(auth, db)
    c = _buscar_cupon(db, n, codigo)
    return {
        "codigo": c.codigo,
        "estado": c.estado,
        "beneficio_titulo": c.beneficio.titulo,
        "turista_nombre": c.usuario.nombre,
        "vence_en": tiempo.iso(c.vence_en),
        "usado_en": tiempo.iso(c.usado_en),
    }


@router.post("/cupones/{codigo}/usar")
def usar_cupon(codigo: str, auth: Autenticado = Depends(solo_negocio), db: Session = Depends(obtener_db)):
    n = _negocio_de(auth, db)
    c = _buscar_cupon(db, n, codigo)
    momento = tiempo.ahora()
    with escritura(db):
        r = db.execute(
            update(Canje).where(Canje.id == c.id, Canje.estado == "DISPONIBLE", Canje.vence_en > momento)
            .values(estado="USADO", usado_en=momento).execution_options(synchronize_session=False)
        )
        exito = r.rowcount == 1
    db.refresh(c)
    if not exito:
        if c.estado == "USADO":
            raise ErrorAPI(409, "CUPON_USADO", "Este cupón ya fue usado.",
                           {"usado_en": tiempo.iso(c.usado_en)})
        if c.estado == "ANULADO":
            raise ErrorAPI(409, "CUPON_ANULADO", "Este cupón fue anulado.")
        if c.estado == "DISPONIBLE":  # venció entre la lectura y el update
            marcar_vencidos(db, canje_id=c.id)
        raise ErrorAPI(409, "CUPON_VENCIDO", "Este cupón está vencido.")
    log.info("Cupón usado negocio=%s canje=%s", n.id, c.id)
    return {
        "ok": True,
        "codigo": c.codigo,
        "beneficio_titulo": c.beneficio.titulo,
        "turista_nombre": c.usuario.nombre,
        "usado_en": tiempo.iso(c.usado_en),
    }


@router.get("/cupones")
def listar_cupones(estado: EstadoCanje | None = Query(default=None), auth: Autenticado = Depends(solo_negocio),
                   db: Session = Depends(obtener_db)):
    n = _negocio_de(auth, db)
    marcar_vencidos(db, negocio_id=n.id)
    stmt = (select(Canje).join(Beneficio, Beneficio.id == Canje.beneficio_id)
            .where(Beneficio.negocio_id == n.id).order_by(Canje.creado_en.desc(), Canje.id.desc()).limit(1000))
    if estado:
        stmt = stmt.where(Canje.estado == estado)
    return [serializar.canje_negocio(c) for c in db.execute(stmt).unique().scalars().all()]


# ------------------------------------------------------------------ beneficios
@router.get("/beneficios")
def listar_beneficios(auth: Autenticado = Depends(solo_negocio), db: Session = Depends(obtener_db)):
    n = _negocio_de(auth, db)
    filas = db.execute(
        select(Beneficio).where(Beneficio.negocio_id == n.id, Beneficio.eliminado.is_(False))
        .order_by(Beneficio.creado_en.desc(), Beneficio.id.desc())
    ).unique().scalars().all()
    return [serializar.beneficio_gestion(b) for b in filas]


@router.post("/beneficios", status_code=201)
def crear_beneficio(datos: BeneficioEntrada, auth: Autenticado = Depends(solo_negocio),
                    db: Session = Depends(obtener_db)):
    n = _negocio_de(auth, db)
    with escritura(db):
        b = Beneficio(negocio_id=n.id, titulo=datos.titulo, descripcion=datos.descripcion, puntos=datos.puntos,
                      dias_validez=datos.dias_validez, stock=datos.stock, estado="PENDIENTE", activo=True,
                      eliminado=False, creado_en=tiempo.ahora())
        db.add(b)
    db.refresh(b)
    return serializar.beneficio_gestion(b)


@router.patch("/beneficios/{beneficio_id}")
def editar_beneficio(beneficio_id: int, datos: BeneficioPatch, auth: Autenticado = Depends(solo_negocio),
                     db: Session = Depends(obtener_db)):
    n = _negocio_de(auth, db)
    cambios = datos.model_fields_set
    with escritura(db):
        b = db.execute(select(Beneficio).where(Beneficio.id == beneficio_id)).unique().scalar_one_or_none()
        if b is None or b.negocio_id != n.id or b.eliminado:
            raise no_encontrado("El beneficio no existe.")
        requiere_revision = False
        for campo in ("titulo", "descripcion", "puntos"):
            valor = getattr(datos, campo)
            if campo in cambios and valor is not None and valor != getattr(b, campo):
                setattr(b, campo, valor)
                requiere_revision = True
        if "dias_validez" in cambios and datos.dias_validez is not None:
            b.dias_validez = datos.dias_validez
        if "stock" in cambios:
            b.stock = datos.stock
        if "activo" in cambios and datos.activo is not None:
            b.activo = datos.activo
        if requiere_revision:
            b.estado = "PENDIENTE"
            b.motivo_rechazo = None
    db.refresh(b)
    return serializar.beneficio_gestion(b)


# ------------------------------------------------------------------ perfil
@router.get("/perfil")
def ver_perfil(auth: Autenticado = Depends(solo_negocio), db: Session = Depends(obtener_db)):
    return serializar.negocio(_negocio_de(auth, db))


@router.patch("/perfil")
def editar_perfil(datos: NegocioPerfilPatch, auth: Autenticado = Depends(solo_negocio),
                  db: Session = Depends(obtener_db)):
    n = _negocio_de(auth, db)
    with escritura(db):
        n = db.get(Negocio, n.id)
        for campo in ("nombre", "direccion", "telefono", "descripcion"):
            valor = getattr(datos, campo)
            if campo in datos.model_fields_set and valor is not None:
                setattr(n, campo, valor)
    return serializar.negocio(n)
