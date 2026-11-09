"""/api/v1/residente: recomendaciones y ranking de la comunidad."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import serializar, tiempo
from ..db import escritura, obtener_db
from ..errores import ErrorAPI
from ..esquemas import RecomendacionEntrada
from ..modelos import Recomendacion, Usuario
from ..seguridad import Autenticado, requiere_rol

router = APIRouter(prefix="/residente", tags=["residente"])
solo_residente = requiere_rol("residente")
MAX_PENDIENTES = 5


@router.post("/recomendaciones", status_code=201)
def crear_recomendacion(datos: RecomendacionEntrada, auth: Autenticado = Depends(solo_residente),
                        db: Session = Depends(obtener_db)):
    with escritura(db):
        pendientes = db.execute(
            select(func.count(Recomendacion.id)).where(
                Recomendacion.usuario_id == auth.usuario.id, Recomendacion.estado == "PENDIENTE")
        ).scalar_one()
        if pendientes >= MAX_PENDIENTES:
            raise ErrorAPI(409, "LIMITE_PENDIENTES",
                           f"Ya tenés {MAX_PENDIENTES} recomendaciones esperando revisión.")
        r = Recomendacion(usuario_id=auth.usuario.id, titulo=datos.titulo, categoria=datos.categoria,
                          descripcion=datos.descripcion, estado="PENDIENTE", creado_en=tiempo.ahora())
        db.add(r)
    return serializar.recomendacion_propia(r)


@router.get("/recomendaciones")
def mis_recomendaciones(auth: Autenticado = Depends(solo_residente), db: Session = Depends(obtener_db)):
    filas = db.execute(
        select(Recomendacion).where(Recomendacion.usuario_id == auth.usuario.id)
        .order_by(Recomendacion.creado_en.desc(), Recomendacion.id.desc())
    ).unique().scalars().all()
    return [serializar.recomendacion_propia(r) for r in filas]


def _posicion(db: Session, puntos: int) -> int:
    mayores = db.execute(
        select(func.count(Usuario.id)).where(
            Usuario.rol == "residente", Usuario.bloqueado.is_(False), Usuario.puntos_comunidad > puntos)
    ).scalar_one()
    return mayores + 1


@router.get("/ranking")
def ranking(auth: Autenticado = Depends(solo_residente), db: Session = Depends(obtener_db)):
    top = db.execute(
        select(Usuario).where(Usuario.rol == "residente", Usuario.bloqueado.is_(False))
        .order_by(Usuario.puntos_comunidad.desc(), Usuario.id).limit(10)
    ).unique().scalars().all()
    lista = []
    for i, u in enumerate(top):
        if i > 0 and u.puntos_comunidad == top[i - 1].puntos_comunidad:
            posicion = lista[-1]["posicion"]
        else:
            posicion = i + 1
        lista.append({"posicion": posicion, "nombre": u.nombre, "puntos_comunidad": u.puntos_comunidad,
                      "rango": serializar.rango_residente(u.puntos_comunidad)})
    yo = db.get(Usuario, auth.usuario.id)
    db.refresh(yo)
    return {"ranking": lista, "mi_posicion": _posicion(db, yo.puntos_comunidad)}
