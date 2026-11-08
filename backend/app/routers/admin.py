"""/api/v1/admin: gestión completa del sistema."""
from __future__ import annotations

import logging
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import serializar, tiempo
from ..db import escritura, obtener_db
from ..errores import ErrorAPI, datos_invalidos, no_encontrado
from ..esquemas import (
    AnularCanjeEntrada,
    BeneficioAdminEntrada,
    BeneficioAdminPatch,
    LugarEntrada,
    LugarPatch,
    PreguntaEntrada,
    PreguntaPatch,
    RechazoEntrada,
    TemporadaEntrada,
    TemporadaPatch,
    UsuarioAdminEntrada,
    UsuarioAdminPatch,
)
from ..modelos import (
    Alerta,
    Beneficio,
    Canje,
    Lugar,
    MovimientoPuntos,
    Negocio,
    Pregunta,
    Recomendacion,
    Temporada,
    Usuario,
    Visita,
)
from ..seguridad import Autenticado, hashear_password, password_aleatoria, requiere_rol, revocar_sesiones
from ..servicios import marcar_vencidos, paginar

router = APIRouter(prefix="/admin", tags=["admin"])
log = logging.getLogger("jcp.admin")
solo_admin = requiere_rol("admin")


class Pagina:
    def __init__(self, pagina: int = Query(1, ge=1, le=100000), por_pagina: int = Query(50, ge=1, le=200)):
        self.pagina = pagina
        self.por_pagina = por_pagina


# ------------------------------------------------------------------ estadísticas
@router.get("/estadisticas")
def estadisticas(auth: Autenticado = Depends(solo_admin), db: Session = Depends(obtener_db)):
    por_rol = dict(db.execute(select(Usuario.rol, func.count(Usuario.id)).group_by(Usuario.rol)).all())
    visitas_por_lugar = (
        select(Lugar.id, Lugar.nombre, func.count(Visita.id).label("visitas"))
        .outerjoin(Visita, Visita.lugar_id == Lugar.id)
        .where(Lugar.activo.is_(True))
        .group_by(Lugar.id, Lugar.nombre)
    )
    mas = db.execute(visitas_por_lugar.order_by(func.count(Visita.id).desc(), Lugar.id).limit(5)).all()
    menos = db.execute(visitas_por_lugar.order_by(func.count(Visita.id).asc(), Lugar.id).limit(5)).all()
    hace_7d = tiempo.ahora() - timedelta(days=7)

    def contar(stmt) -> int:
        return db.execute(stmt).scalar_one()

    return {
        "usuarios": {
            "total": sum(por_rol.values()),
            "turistas": por_rol.get("turista", 0),
            "negocios": por_rol.get("negocio", 0),
            "residentes": por_rol.get("residente", 0),
            "admins": por_rol.get("admin", 0),
        },
        "visitas_total": contar(select(func.count(Visita.id))),
        "visitas_7d": contar(select(func.count(Visita.id)).where(Visita.creado_en >= hace_7d)),
        "canjes_total": contar(select(func.count(Canje.id))),
        "canjes_usados": contar(select(func.count(Canje.id)).where(Canje.estado == "USADO")),
        "lugares_mas_visitados": [{"id": i, "nombre": n, "visitas": v} for i, n, v in mas],
        "lugares_menos_visitados": [{"id": i, "nombre": n, "visitas": v} for i, n, v in menos],
        "alertas_abiertas": contar(select(func.count(Alerta.id)).where(Alerta.resuelta.is_(False))),
        "recomendaciones_pendientes": contar(
            select(func.count(Recomendacion.id)).where(Recomendacion.estado == "PENDIENTE")),
        "beneficios_pendientes": contar(
            select(func.count(Beneficio.id)).where(Beneficio.estado == "PENDIENTE", Beneficio.eliminado.is_(False))),
    }


# ------------------------------------------------------------------ lugares
def _cantidad_preguntas(db: Session, lugar_id: int) -> int:
    return db.execute(
        select(func.count(Pregunta.id)).where(Pregunta.lugar_id == lugar_id, Pregunta.activa.is_(True))
    ).scalar_one()


def _lugar_sin_preguntas() -> ErrorAPI:
    return ErrorAPI(409, "LUGAR_SIN_PREGUNTAS", "No se puede activar un lugar sin al menos una pregunta activa.")


@router.get("/lugares")
def listar_lugares(pag: Pagina = Depends(), auth: Autenticado = Depends(solo_admin),
                   db: Session = Depends(obtener_db)):
    conteo = (select(func.count(Pregunta.id)).where(Pregunta.lugar_id == Lugar.id, Pregunta.activa.is_(True))
              .correlate(Lugar).scalar_subquery())
    stmt = select(Lugar, conteo.label("cantidad")).order_by(Lugar.id)
    total = db.execute(select(func.count(Lugar.id))).scalar_one()
    filas = db.execute(stmt.limit(pag.por_pagina).offset((pag.pagina - 1) * pag.por_pagina)).all()
    return {"items": [serializar.lugar_admin(l, c) for l, c in filas], "total": total, "pagina": pag.pagina,
            "por_pagina": pag.por_pagina}


@router.post("/lugares", status_code=201)
def crear_lugar(datos: LugarEntrada, auth: Autenticado = Depends(solo_admin), db: Session = Depends(obtener_db)):
    if datos.activo:
        raise _lugar_sin_preguntas()
    with escritura(db):
        l = Lugar(**datos.model_dump(), creado_en=tiempo.ahora())
        db.add(l)
    return serializar.lugar_admin(l, 0)


def _obtener_lugar(db: Session, lugar_id: int) -> Lugar:
    l = db.get(Lugar, lugar_id)
    if l is None:
        raise no_encontrado("El lugar no existe.")
    return l


@router.patch("/lugares/{lugar_id}")
def editar_lugar(lugar_id: int, datos: LugarPatch, auth: Autenticado = Depends(solo_admin),
                 db: Session = Depends(obtener_db)):
    with escritura(db):
        l = _obtener_lugar(db, lugar_id)
        for campo in datos.model_fields_set:
            valor = getattr(datos, campo)
            if valor is None:
                continue
            if campo == "activo" and valor and not l.activo and _cantidad_preguntas(db, l.id) == 0:
                raise _lugar_sin_preguntas()
            setattr(l, campo, valor)
        cantidad = _cantidad_preguntas(db, l.id)
    return serializar.lugar_admin(l, cantidad)


@router.delete("/lugares/{lugar_id}")
def borrar_lugar(lugar_id: int, auth: Autenticado = Depends(solo_admin), db: Session = Depends(obtener_db)):
    with escritura(db):
        l = _obtener_lugar(db, lugar_id)
        l.activo = False
        cantidad = _cantidad_preguntas(db, l.id)
    return serializar.lugar_admin(l, cantidad)


# ------------------------------------------------------------------ preguntas
@router.get("/lugares/{lugar_id}/preguntas")
def listar_preguntas(lugar_id: int, pag: Pagina = Depends(), auth: Autenticado = Depends(solo_admin),
                     db: Session = Depends(obtener_db)):
    _obtener_lugar(db, lugar_id)
    stmt = select(Pregunta).where(Pregunta.lugar_id == lugar_id).order_by(Pregunta.id)
    return paginar(db, stmt, pag.pagina, pag.por_pagina, serializar.pregunta_admin)


@router.post("/lugares/{lugar_id}/preguntas", status_code=201)
def crear_pregunta(lugar_id: int, datos: PreguntaEntrada, auth: Autenticado = Depends(solo_admin),
                   db: Session = Depends(obtener_db)):
    with escritura(db):
        _obtener_lugar(db, lugar_id)
        p = Pregunta(lugar_id=lugar_id, texto=datos.texto, opciones=list(datos.opciones),
                     correcta_index=datos.correcta_index, activa=True, creado_en=tiempo.ahora())
        db.add(p)
    return serializar.pregunta_admin(p)


def _obtener_pregunta(db: Session, pregunta_id: int) -> Pregunta:
    p = db.get(Pregunta, pregunta_id)
    if p is None:
        raise no_encontrado("La pregunta no existe.")
    return p


@router.patch("/preguntas/{pregunta_id}")
def editar_pregunta(pregunta_id: int, datos: PreguntaPatch, auth: Autenticado = Depends(solo_admin),
                    db: Session = Depends(obtener_db)):
    with escritura(db):
        p = _obtener_pregunta(db, pregunta_id)
        cambios = datos.model_fields_set
        opciones = list(datos.opciones) if "opciones" in cambios and datos.opciones is not None else list(p.opciones)
        correcta = (datos.correcta_index if "correcta_index" in cambios and datos.correcta_index is not None
                    else p.correcta_index)
        if not 0 <= correcta < len(opciones):
            raise datos_invalidos("correcta_index fuera de rango para las opciones.")
        if "texto" in cambios and datos.texto is not None:
            p.texto = datos.texto
        p.opciones = opciones
        p.correcta_index = correcta
        if "activa" in cambios and datos.activa is not None:
            p.activa = datos.activa
    return serializar.pregunta_admin(p)


@router.delete("/preguntas/{pregunta_id}")
def borrar_pregunta(pregunta_id: int, auth: Autenticado = Depends(solo_admin), db: Session = Depends(obtener_db)):
    with escritura(db):
        p = _obtener_pregunta(db, pregunta_id)
        p.activa = False
    return serializar.pregunta_admin(p)


# ------------------------------------------------------------------ beneficios
EstadoBeneficio = Literal["PENDIENTE", "APROBADO", "RECHAZADO"]


@router.get("/beneficios")
def listar_beneficios(estado: EstadoBeneficio | None = None, pag: Pagina = Depends(),
                      auth: Autenticado = Depends(solo_admin), db: Session = Depends(obtener_db)):
    stmt = select(Beneficio).order_by(Beneficio.creado_en.desc(), Beneficio.id.desc())
    if estado:
        stmt = stmt.where(Beneficio.estado == estado)
    return paginar(db, stmt, pag.pagina, pag.por_pagina, lambda b: serializar.beneficio_gestion(b, admin=True))


@router.post("/beneficios", status_code=201)
def crear_beneficio(datos: BeneficioAdminEntrada, auth: Autenticado = Depends(solo_admin),
                    db: Session = Depends(obtener_db)):
    with escritura(db):
        if db.get(Negocio, datos.negocio_id) is None:
            raise no_encontrado("El negocio no existe.")
        b = Beneficio(negocio_id=datos.negocio_id, titulo=datos.titulo, descripcion=datos.descripcion,
                      puntos=datos.puntos, dias_validez=datos.dias_validez, stock=datos.stock, estado="APROBADO",
                      activo=datos.activo, eliminado=False, creado_en=tiempo.ahora())
        db.add(b)
    db.refresh(b)
    return serializar.beneficio_gestion(b, admin=True)


def _obtener_beneficio(db: Session, beneficio_id: int) -> Beneficio:
    b = db.execute(select(Beneficio).where(Beneficio.id == beneficio_id)).unique().scalar_one_or_none()
    if b is None:
        raise no_encontrado("El beneficio no existe.")
    return b


@router.patch("/beneficios/{beneficio_id}")
def editar_beneficio(beneficio_id: int, datos: BeneficioAdminPatch, auth: Autenticado = Depends(solo_admin),
                     db: Session = Depends(obtener_db)):
    with escritura(db):
        b = _obtener_beneficio(db, beneficio_id)
        for campo in datos.model_fields_set:
            valor = getattr(datos, campo)
            if valor is None and campo not in ("stock", "motivo_rechazo"):
                continue
            setattr(b, campo, valor)
        if "estado" in datos.model_fields_set and b.estado != "RECHAZADO" and "motivo_rechazo" not in datos.model_fields_set:
            b.motivo_rechazo = None
    db.refresh(b)
    return serializar.beneficio_gestion(b, admin=True)


@router.delete("/beneficios/{beneficio_id}")
def borrar_beneficio(beneficio_id: int, auth: Autenticado = Depends(solo_admin), db: Session = Depends(obtener_db)):
    with escritura(db):
        b = _obtener_beneficio(db, beneficio_id)
        b.eliminado = True
        b.activo = False
    db.refresh(b)
    return serializar.beneficio_gestion(b, admin=True)


# ------------------------------------------------------------------ usuarios
@router.get("/usuarios")
def listar_usuarios(rol: Literal["turista", "negocio", "residente", "admin"] | None = None,
                    q: str | None = Query(default=None, max_length=100), pag: Pagina = Depends(),
                    auth: Autenticado = Depends(solo_admin), db: Session = Depends(obtener_db)):
    stmt = select(Usuario).order_by(Usuario.creado_en.desc(), Usuario.id.desc())
    if rol:
        stmt = stmt.where(Usuario.rol == rol)
    if q and q.strip():
        patron = "%" + q.strip().lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        stmt = stmt.where(or_(func.lower(Usuario.nombre).like(patron, escape="\\"),
                              func.lower(Usuario.email).like(patron, escape="\\")))
    return paginar(db, stmt, pag.pagina, pag.por_pagina, serializar.usuario)


@router.post("/usuarios", status_code=201)
def crear_usuario(datos: UsuarioAdminEntrada, auth: Autenticado = Depends(solo_admin),
                  db: Session = Depends(obtener_db)):
    if db.execute(select(Usuario.id).where(Usuario.email == datos.email)).first():
        raise ErrorAPI(409, "EMAIL_EN_USO", "Ya existe una cuenta con ese email.")
    password_hash = hashear_password(datos.password)
    try:
        with escritura(db):
            momento = tiempo.ahora()
            u = Usuario(nombre=datos.nombre, email=datos.email, password_hash=password_hash, rol=datos.rol,
                        creado_en=momento)
            db.add(u)
            db.flush()
            if datos.rol == "negocio" and datos.negocio is not None:
                db.add(Negocio(usuario_id=u.id, nombre=datos.negocio.nombre, direccion=datos.negocio.direccion,
                               telefono=datos.negocio.telefono, descripcion=datos.negocio.descripcion,
                               creado_en=momento))
    except IntegrityError:
        raise ErrorAPI(409, "EMAIL_EN_USO", "Ya existe una cuenta con ese email.")
    db.refresh(u)
    log.info("Admin %s creó usuario id=%s rol=%s", auth.usuario.id, u.id, u.rol)
    return {"usuario": serializar.usuario(u)}


def _obtener_usuario(db: Session, usuario_id: int) -> Usuario:
    u = db.get(Usuario, usuario_id)
    if u is None:
        raise no_encontrado("El usuario no existe.")
    return u


@router.patch("/usuarios/{usuario_id}")
def editar_usuario(usuario_id: int, datos: UsuarioAdminPatch, auth: Autenticado = Depends(solo_admin),
                   db: Session = Depends(obtener_db)):
    if datos.bloqueado and usuario_id == auth.usuario.id:
        raise ErrorAPI(409, "AUTOBLOQUEO_NO_PERMITIDO", "No podés bloquear tu propia cuenta.")
    with escritura(db):
        u = _obtener_usuario(db, usuario_id)
        if datos.nombre is not None:
            u.nombre = datos.nombre
        if datos.bloqueado is not None:
            u.bloqueado = datos.bloqueado
            if datos.bloqueado:
                revocar_sesiones(db, u.id)
    db.refresh(u)
    log.info("Admin %s editó usuario id=%s bloqueado=%s", auth.usuario.id, u.id, u.bloqueado)
    return {"usuario": serializar.usuario(u)}


@router.post("/usuarios/{usuario_id}/reset-password")
def reset_password(usuario_id: int, auth: Autenticado = Depends(solo_admin), db: Session = Depends(obtener_db)):
    _obtener_usuario(db, usuario_id)
    temporal = password_aleatoria(12)
    password_hash = hashear_password(temporal)
    with escritura(db):
        u = _obtener_usuario(db, usuario_id)
        u.password_hash = password_hash
        revocar_sesiones(db, u.id)
    log.info("Admin %s reseteó la contraseña de usuario id=%s", auth.usuario.id, usuario_id)
    return {"password_temporal": temporal}


# ------------------------------------------------------------------ recomendaciones
EstadoRecomendacion = Literal["PENDIENTE", "APROBADA", "RECHAZADA"]


@router.get("/recomendaciones")
def listar_recomendaciones(estado: EstadoRecomendacion | None = None, pag: Pagina = Depends(),
                           auth: Autenticado = Depends(solo_admin), db: Session = Depends(obtener_db)):
    stmt = select(Recomendacion).order_by(Recomendacion.creado_en.desc(), Recomendacion.id.desc())
    if estado:
        stmt = stmt.where(Recomendacion.estado == estado)
    return paginar(db, stmt, pag.pagina, pag.por_pagina, serializar.recomendacion_admin)


def _recomendacion_pendiente(db: Session, rec_id: int) -> Recomendacion:
    r = db.execute(select(Recomendacion).where(Recomendacion.id == rec_id)).unique().scalar_one_or_none()
    if r is None:
        raise no_encontrado("La recomendación no existe.")
    if r.estado != "PENDIENTE":
        raise ErrorAPI(409, "ESTADO_INVALIDO", "La recomendación ya fue revisada.")
    return r


@router.post("/recomendaciones/{rec_id}/aprobar")
def aprobar_recomendacion(rec_id: int, auth: Autenticado = Depends(solo_admin), db: Session = Depends(obtener_db)):
    with escritura(db):
        r = _recomendacion_pendiente(db, rec_id)
        momento = tiempo.ahora()
        r.estado = "APROBADA"
        r.motivo_rechazo = None
        r.aprobada_en = momento
        db.execute(update(Usuario).where(Usuario.id == r.usuario_id)
                   .values(puntos_comunidad=Usuario.puntos_comunidad + 50)
                   .execution_options(synchronize_session=False))
        db.add(MovimientoPuntos(usuario_id=r.usuario_id, delta=50, campo="puntos_comunidad",
                                tipo="RECOMENDACION_APROBADA", referencia=f"recomendacion:{r.id}",
                                creado_en=momento))
    db.refresh(r)
    return serializar.recomendacion_admin(r)


@router.post("/recomendaciones/{rec_id}/rechazar")
def rechazar_recomendacion(rec_id: int, datos: RechazoEntrada, auth: Autenticado = Depends(solo_admin),
                           db: Session = Depends(obtener_db)):
    with escritura(db):
        r = _recomendacion_pendiente(db, rec_id)
        r.estado = "RECHAZADA"
        r.motivo_rechazo = datos.motivo
    return serializar.recomendacion_admin(r)


# ------------------------------------------------------------------ temporadas
@router.get("/temporadas")
def listar_temporadas(pag: Pagina = Depends(), auth: Autenticado = Depends(solo_admin),
                      db: Session = Depends(obtener_db)):
    stmt = select(Temporada).order_by(Temporada.fecha_inicio.desc(), Temporada.id.desc())
    return paginar(db, stmt, pag.pagina, pag.por_pagina, serializar.temporada)


def _desactivar_otras(db: Session, excepto_id: int) -> None:
    db.execute(update(Temporada).where(Temporada.id != excepto_id, Temporada.activa.is_(True))
               .values(activa=False).execution_options(synchronize_session=False))


@router.post("/temporadas", status_code=201)
def crear_temporada(datos: TemporadaEntrada, auth: Autenticado = Depends(solo_admin),
                    db: Session = Depends(obtener_db)):
    with escritura(db):
        t = Temporada(**datos.model_dump(), creado_en=tiempo.ahora())
        db.add(t)
        db.flush()
        if t.activa:
            _desactivar_otras(db, t.id)
    return serializar.temporada(t)


@router.patch("/temporadas/{temporada_id}")
def editar_temporada(temporada_id: int, datos: TemporadaPatch, auth: Autenticado = Depends(solo_admin),
                     db: Session = Depends(obtener_db)):
    with escritura(db):
        t = db.get(Temporada, temporada_id)
        if t is None:
            raise no_encontrado("La temporada no existe.")
        for campo in datos.model_fields_set:
            valor = getattr(datos, campo)
            if valor is not None:
                setattr(t, campo, valor)
        if t.fecha_fin < t.fecha_inicio:
            raise datos_invalidos("fecha_fin no puede ser anterior a fecha_inicio.")
        if t.activa:
            _desactivar_otras(db, t.id)
    return serializar.temporada(t)


# ------------------------------------------------------------------ canjes
@router.get("/canjes")
def listar_canjes(estado: Literal["DISPONIBLE", "USADO", "VENCIDO", "ANULADO"] | None = None,
                  pag: Pagina = Depends(), auth: Autenticado = Depends(solo_admin),
                  db: Session = Depends(obtener_db)):
    marcar_vencidos(db)
    stmt = select(Canje).order_by(Canje.creado_en.desc(), Canje.id.desc())
    if estado:
        stmt = stmt.where(Canje.estado == estado)
    return paginar(db, stmt, pag.pagina, pag.por_pagina, serializar.canje_admin)


@router.post("/canjes/{canje_id}/anular")
def anular_canje(canje_id: int, datos: AnularCanjeEntrada, auth: Autenticado = Depends(solo_admin),
                 db: Session = Depends(obtener_db)):
    marcar_vencidos(db, canje_id=canje_id)
    with escritura(db):
        c = db.execute(select(Canje).where(Canje.id == canje_id)).unique().scalar_one_or_none()
        if c is None:
            raise no_encontrado("El canje no existe.")
        momento = tiempo.ahora()
        r = db.execute(update(Canje).where(Canje.id == c.id, Canje.estado.in_(("DISPONIBLE", "VENCIDO")))
                       .values(estado="ANULADO", anulado_en=momento).execution_options(synchronize_session=False))
        if r.rowcount == 0:
            raise ErrorAPI(409, "CANJE_NO_ANULABLE", "Solo se pueden anular cupones disponibles o vencidos.")
        db.execute(update(Beneficio).where(Beneficio.id == c.beneficio_id, Beneficio.stock.is_not(None))
                   .values(stock=Beneficio.stock + 1).execution_options(synchronize_session=False))
        if datos.devolver_puntos:
            db.execute(update(Usuario).where(Usuario.id == c.usuario_id)
                       .values(puntos=Usuario.puntos + c.puntos).execution_options(synchronize_session=False))
            db.add(MovimientoPuntos(usuario_id=c.usuario_id, delta=c.puntos, campo="puntos",
                                    tipo="DEVOLUCION_CANJE", referencia=f"canje:{c.id}", creado_en=momento))
    db.refresh(c)
    log.info("Admin %s anuló canje %s devolver=%s", auth.usuario.id, c.id, datos.devolver_puntos)
    return serializar.canje_admin(c)


# ------------------------------------------------------------------ alertas
@router.get("/alertas")
def listar_alertas(resueltas: bool | None = None, pag: Pagina = Depends(), auth: Autenticado = Depends(solo_admin),
                   db: Session = Depends(obtener_db)):
    stmt = select(Alerta).order_by(Alerta.creado_en.desc(), Alerta.id.desc())
    if resueltas is not None:
        stmt = stmt.where(Alerta.resuelta.is_(resueltas))
    return paginar(db, stmt, pag.pagina, pag.por_pagina, serializar.alerta)


@router.post("/alertas/{alerta_id}/resolver")
def resolver_alerta(alerta_id: int, auth: Autenticado = Depends(solo_admin), db: Session = Depends(obtener_db)):
    with escritura(db):
        a = db.execute(select(Alerta).where(Alerta.id == alerta_id)).unique().scalar_one_or_none()
        if a is None:
            raise no_encontrado("La alerta no existe.")
        if not a.resuelta:
            a.resuelta = True
            a.resuelta_en = tiempo.ahora()
            a.resuelta_por = auth.usuario.id
    return serializar.alerta(a)
