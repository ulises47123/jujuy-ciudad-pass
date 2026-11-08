"""Rutas de la app Android (turista) y vistas públicas para cualquier rol autenticado."""
from __future__ import annotations

import logging
import random
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import exists, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import antitrampa, serializar, tiempo
from ..config import obtener_config
from ..db import escritura, obtener_db
from ..errores import ErrorAPI, datos_invalidos, demasiados_intentos, no_encontrado
from ..esquemas import CanjeEntrada, IniciarVisitaEntrada, ResponderVisitaEntrada
from ..modelos import (
    Beneficio,
    Canje,
    IntentoVisita,
    Lugar,
    MovimientoPuntos,
    Negocio,
    Pregunta,
    Recomendacion,
    Usuario,
    Visita,
)
from ..seguridad import Autenticado, obtener_autenticado, requiere_rol
from ..servicios import aplicar_multiplicador, marcar_vencidos, multiplicador_vigente, realizar_canje

router = APIRouter(tags=["turista"])
log = logging.getLogger("jcp.turista")
solo_turista = requiere_rol("turista")
_azar = random.SystemRandom()


def _pregunta_activa_existe():
    return exists().where(Pregunta.lugar_id == Lugar.id, Pregunta.activa.is_(True))


# ------------------------------------------------------------------ lugares
@router.get("/lugares")
def lugares(auth: Autenticado = Depends(obtener_autenticado), db: Session = Depends(obtener_db)):
    filas = db.execute(
        select(Lugar).where(Lugar.activo.is_(True), _pregunta_activa_existe()).order_by(Lugar.nombre)
    ).scalars().all()
    visitados: set[int] = set()
    if auth.usuario.rol == "turista":
        visitados = set(db.execute(select(Visita.lugar_id).where(Visita.usuario_id == auth.usuario.id)).scalars())
    return [serializar.lugar_turista(l, l.id in visitados) for l in filas]


# ------------------------------------------------------------------ visitas
def _fallos_24h(db: Session, usuario_id: int, lugar_id: int) -> int:
    desde = tiempo.ahora() - timedelta(hours=24)
    return db.execute(
        select(func.count(IntentoVisita.id)).where(
            IntentoVisita.usuario_id == usuario_id,
            IntentoVisita.lugar_id == lugar_id,
            IntentoVisita.creado_en >= desde,
            or_(
                IntentoVisita.estado.in_(("INCORRECTO", "EXPIRADO")),
                (IntentoVisita.estado == "PENDIENTE") & (IntentoVisita.vence_en <= tiempo.ahora()),
            ),
        )
    ).scalar_one()


def _respuesta_intento(db: Session, intento: IntentoVisita) -> dict:
    pregunta = db.get(Pregunta, intento.pregunta_id)
    opciones = [pregunta.opciones[i] for i in intento.orden_opciones]
    restante = max(0, int((intento.vence_en - tiempo.ahora()).total_seconds()))
    return {"intento_id": intento.id, "pregunta": pregunta.texto, "opciones": opciones, "expira_en_s": restante}


@router.post("/visitas/iniciar")
def iniciar_visita(datos: IniciarVisitaEntrada, auth: Autenticado = Depends(solo_turista),
                   db: Session = Depends(obtener_db)):
    cfg = obtener_config()
    usuario_id = auth.usuario.id
    ahora_ms = tiempo.ahora_ms()
    muestras = datos.muestras

    # 1-2. formato y reloj
    desfase = antitrampa.validar_muestras(muestras, datos.reloj_ms, ahora_ms, cfg)

    # 3. ubicación falsa
    if antitrampa.hay_mock(muestras):
        antitrampa.registrar_alerta(db, "UBICACION_FALSA", usuario_id,
                                    {"lugar_id": datos.lugar_id, "dispositivo_id": datos.dispositivo_id,
                                     "etapa": "iniciar"})
        raise ErrorAPI(403, "UBICACION_FALSA", "Detectamos una ubicación simulada. Desactivá las apps de GPS falso.")

    # 7. lugar
    lugar = db.get(Lugar, datos.lugar_id)
    if lugar is None or not lugar.activo:
        raise no_encontrado("El lugar no existe.")
    preguntas = db.execute(
        select(Pregunta.id).where(Pregunta.lugar_id == lugar.id, Pregunta.activa.is_(True))
    ).scalars().all()
    if not preguntas:
        raise no_encontrado("El lugar no existe.")

    # 7. ya visitado
    if db.execute(select(Visita.id).where(Visita.usuario_id == usuario_id, Visita.lugar_id == lugar.id)).first():
        raise ErrorAPI(409, "YA_VISITADO", "Ya completaste este lugar.")

    # Intento vigente para el mismo lugar → se devuelve el mismo (no se puede pedir otra pregunta)
    momento = tiempo.ahora()
    vigente = db.execute(
        select(IntentoVisita).where(
            IntentoVisita.usuario_id == usuario_id,
            IntentoVisita.lugar_id == lugar.id,
            IntentoVisita.estado == "PENDIENTE",
            IntentoVisita.vence_en > momento,
        ).order_by(IntentoVisita.id.desc()).limit(1)
    ).scalar_one_or_none()

    # 8. demasiados intentos
    if vigente is None and _fallos_24h(db, usuario_id, lugar.id) >= cfg.fallos_max_24h:
        raise demasiados_intentos(3600, "Ya usaste tus intentos en este lugar. Volvé a probar mañana.")

    # 4. precisión, 5. rango
    antitrampa.validar_precision(muestras, cfg)
    antitrampa.validar_rango(muestras, lugar.latitud, lugar.longitud, lugar.radio_m)

    if vigente is not None:
        return _respuesta_intento(db, vigente)

    # 6. viaje imposible (contra el último intento del usuario en cualquier lugar)
    ultima = muestras[-1]
    actual = antitrampa.Posicion(ultima.lat, ultima.lon, ultima.tiempo_ms + desfase)
    previo = db.execute(
        select(IntentoVisita).where(IntentoVisita.usuario_id == usuario_id)
        .order_by(IntentoVisita.fecha_ubicacion.desc(), IntentoVisita.id.desc()).limit(1)
    ).scalar_one_or_none()
    anterior = (antitrampa.Posicion(previo.latitud, previo.longitud, tiempo.a_ms(previo.fecha_ubicacion))
                if previo else None)
    viaje = antitrampa.evaluar_viaje(anterior, actual, cfg)
    if viaje is not None:
        antitrampa.registrar_alerta(db, "VIAJE_IMPOSIBLE", usuario_id, {"lugar_id": lugar.id, **viaje})
        raise ErrorAPI(403, "VIAJE_IMPOSIBLE", "Detectamos un desplazamiento imposible. Si es un error, contactanos.",
                       viaje)

    # 9. muestras idénticas: se permite pero se alerta
    if antitrampa.muestras_identicas(muestras):
        antitrampa.registrar_alerta(db, "MUESTRAS_IDENTICAS", usuario_id,
                                    {"lugar_id": lugar.id, "lat": ultima.lat, "lon": ultima.lon,
                                     "cantidad": len(muestras)})

    pregunta_id = secrets.choice(preguntas)
    with escritura(db):
        # Re-chequeo dentro del lock de escritura (dos "iniciar" simultáneos)
        momento = tiempo.ahora()
        vigente = db.execute(
            select(IntentoVisita).where(
                IntentoVisita.usuario_id == usuario_id,
                IntentoVisita.lugar_id == lugar.id,
                IntentoVisita.estado == "PENDIENTE",
                IntentoVisita.vence_en > momento,
            ).limit(1)
        ).scalar_one_or_none()
        if vigente is not None:
            return _respuesta_intento(db, vigente)
        pregunta = db.get(Pregunta, pregunta_id)
        orden = list(range(len(pregunta.opciones)))
        _azar.shuffle(orden)
        momento = tiempo.ahora()
        intento = IntentoVisita(
            usuario_id=usuario_id,
            lugar_id=lugar.id,
            pregunta_id=pregunta.id,
            orden_opciones=orden,
            estado="PENDIENTE",
            vence_en=momento + timedelta(seconds=cfg.intento_duracion_s),
            desfase_ms=int(max(min(desfase, 2**31 - 1), -(2**31))),
            latitud=ultima.lat,
            longitud=ultima.lon,
            fecha_ubicacion=tiempo.desde_ms(actual.ms),
            dispositivo_id=datos.dispositivo_id,
            creado_en=momento,
        )
        db.add(intento)
        db.flush()
        respuesta = _respuesta_intento(db, intento)
    return respuesta


@router.post("/visitas/responder")
def responder_visita(datos: ResponderVisitaEntrada, auth: Autenticado = Depends(solo_turista),
                     db: Session = Depends(obtener_db)):
    cfg = obtener_config()
    usuario_id = auth.usuario.id
    intento = db.get(IntentoVisita, datos.intento_id)
    if intento is None or intento.usuario_id != usuario_id:
        raise no_encontrado("El intento no existe.")
    if intento.estado != "PENDIENTE":
        if intento.estado == "EXPIRADO":
            raise ErrorAPI(410, "INTENTO_EXPIRADO", "Se terminó el tiempo para responder. Volvé a intentarlo.")
        raise ErrorAPI(409, "INTENTO_USADO", "Este intento ya fue respondido.")
    if intento.vence_en <= tiempo.ahora():
        with escritura(db):
            db.execute(update(IntentoVisita).where(IntentoVisita.id == intento.id,
                                                   IntentoVisita.estado == "PENDIENTE")
                       .values(estado="EXPIRADO").execution_options(synchronize_session=False))
        raise ErrorAPI(410, "INTENTO_EXPIRADO", "Se terminó el tiempo para responder. Volvé a intentarlo.")

    if not 0 <= datos.opcion_index < len(intento.orden_opciones):
        raise datos_invalidos("La opción elegida no existe.")

    m = datos.muestra
    if m.mock:
        with escritura(db):
            db.execute(update(IntentoVisita).where(IntentoVisita.id == intento.id,
                                                   IntentoVisita.estado == "PENDIENTE")
                       .values(estado="ANULADO", respondido_en=tiempo.ahora())
                       .execution_options(synchronize_session=False))
        antitrampa.registrar_alerta(db, "UBICACION_FALSA", usuario_id,
                                    {"lugar_id": intento.lugar_id, "intento_id": intento.id, "etapa": "responder"})
        raise ErrorAPI(403, "UBICACION_FALSA", "Detectamos una ubicación simulada. Desactivá las apps de GPS falso.")

    reloj_ms = datos.reloj_ms if datos.reloj_ms is not None else tiempo.ahora_ms() - intento.desfase_ms
    antitrampa.validar_antiguedad(m, reloj_ms, cfg)
    antitrampa.validar_precision([m], cfg)
    lugar = db.get(Lugar, intento.lugar_id)
    if lugar is None or not lugar.activo:
        raise no_encontrado("El lugar no existe.")
    antitrampa.validar_rango([m], lugar.latitud, lugar.longitud, lugar.radio_m)

    pregunta = db.get(Pregunta, intento.pregunta_id)
    correcta = intento.orden_opciones[datos.opcion_index] == pregunta.correcta_index
    momento = tiempo.ahora()

    if not correcta:
        with escritura(db):
            r = db.execute(update(IntentoVisita).where(IntentoVisita.id == intento.id,
                                                       IntentoVisita.estado == "PENDIENTE")
                           .values(estado="INCORRECTO", respondido_en=momento)
                           .execution_options(synchronize_session=False))
            if r.rowcount == 0:
                raise ErrorAPI(409, "INTENTO_USADO", "Este intento ya fue respondido.")
            fallos = _fallos_24h(db, usuario_id, intento.lugar_id)
        return {"correcta": False, "intentos_restantes": max(0, cfg.fallos_max_24h - fallos)}

    try:
        with escritura(db):
            r = db.execute(update(IntentoVisita).where(IntentoVisita.id == intento.id,
                                                       IntentoVisita.estado == "PENDIENTE")
                           .values(estado="CORRECTO", respondido_en=momento)
                           .execution_options(synchronize_session=False))
            if r.rowcount == 0:
                raise ErrorAPI(409, "INTENTO_USADO", "Este intento ya fue respondido.")
            multiplicador = multiplicador_vigente(db)
            ganados = aplicar_multiplicador(lugar.puntos, multiplicador)
            db.add(Visita(usuario_id=usuario_id, lugar_id=lugar.id, intento_id=intento.id, puntos=ganados,
                          multiplicador=multiplicador, creado_en=momento))
            db.flush()  # dispara el UNIQUE(usuario, lugar) acá
            db.execute(update(Usuario).where(Usuario.id == usuario_id)
                       .values(puntos=Usuario.puntos + ganados,
                               puntos_historicos=Usuario.puntos_historicos + ganados)
                       .execution_options(synchronize_session=False))
            db.add(MovimientoPuntos(usuario_id=usuario_id, delta=ganados, campo="puntos", tipo="VISITA",
                                    referencia=f"lugar:{lugar.id}", creado_en=momento))
            puntos, historicos = db.execute(
                select(Usuario.puntos, Usuario.puntos_historicos).where(Usuario.id == usuario_id)
            ).one()
    except IntegrityError:
        raise ErrorAPI(409, "YA_VISITADO", "Ya completaste este lugar.")
    log.info("Visita usuario=%s lugar=%s puntos=%s", usuario_id, lugar.id, ganados)
    return {
        "correcta": True,
        "puntos_ganados": ganados,
        "puntos": puntos,
        "puntos_historicos": historicos,
        "rango": serializar.rango_turista(historicos),
        "multiplicador": multiplicador,
    }


@router.get("/visitas/mias")
def visitas_mias(auth: Autenticado = Depends(solo_turista), db: Session = Depends(obtener_db)):
    filas = db.execute(
        select(Visita, Lugar.nombre).join(Lugar, Lugar.id == Visita.lugar_id)
        .where(Visita.usuario_id == auth.usuario.id).order_by(Visita.creado_en.desc(), Visita.id.desc())
    ).all()
    return [{"lugar_id": v.lugar_id, "lugar_nombre": nombre, "puntos": v.puntos, "fecha": tiempo.iso(v.creado_en)}
            for v, nombre in filas]


# ------------------------------------------------------------------ beneficios y canjes
@router.get("/beneficios")
def beneficios(auth: Autenticado = Depends(obtener_autenticado), db: Session = Depends(obtener_db)):
    filas = db.execute(
        select(Beneficio)
        .join(Negocio, Negocio.id == Beneficio.negocio_id)
        .join(Usuario, Usuario.id == Negocio.usuario_id)
        .where(
            Beneficio.estado == "APROBADO",
            Beneficio.activo.is_(True),
            Beneficio.eliminado.is_(False),
            or_(Beneficio.stock.is_(None), Beneficio.stock > 0),
            Usuario.bloqueado.is_(False),
        )
        .order_by(Beneficio.puntos, Beneficio.id)
    ).unique().scalars().all()
    return [serializar.beneficio_turista(b) for b in filas]


@router.post("/canjes", status_code=201)
def crear_canje(datos: CanjeEntrada, auth: Autenticado = Depends(solo_turista), db: Session = Depends(obtener_db)):
    canje, restantes = realizar_canje(db, auth.usuario.id, datos.beneficio_id)
    respuesta = serializar.canje(canje)
    respuesta["puntos_restantes"] = restantes
    log.info("Canje usuario=%s beneficio=%s canje=%s", auth.usuario.id, datos.beneficio_id, canje.id)
    return respuesta


@router.get("/canjes/mios")
def canjes_mios(auth: Autenticado = Depends(solo_turista), db: Session = Depends(obtener_db)):
    marcar_vencidos(db, usuario_id=auth.usuario.id)
    filas = db.execute(
        select(Canje).where(Canje.usuario_id == auth.usuario.id).order_by(Canje.creado_en.desc(), Canje.id.desc())
    ).unique().scalars().all()
    return [serializar.canje(c) for c in filas]


# ------------------------------------------------------------------ recomendaciones
@router.get("/recomendaciones")
def recomendaciones(auth: Autenticado = Depends(obtener_autenticado), db: Session = Depends(obtener_db)):
    filas = db.execute(
        select(Recomendacion).where(Recomendacion.estado == "APROBADA")
        .order_by(Recomendacion.aprobada_en.desc(), Recomendacion.id.desc())
    ).unique().scalars().all()
    return [serializar.recomendacion_publica(r) for r in filas]
