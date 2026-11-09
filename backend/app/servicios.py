"""Lógica compartida: temporadas, códigos de cupón, canjes, vencimientos y paginación."""
from __future__ import annotations

import math
import re
import secrets
from datetime import timedelta

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import tiempo
from .db import escritura
from .errores import ErrorAPI, no_encontrado
from .modelos import Beneficio, Canje, MovimientoPuntos, Negocio, Temporada, Usuario

ALFABETO_CUPON = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_RE_CODIGO = re.compile(r"^[0-9A-HJKMNP-TV-Z]{8}$")


# ------------------------------------------------------------------ temporadas
def multiplicador_vigente(db: Session) -> float:
    hoy = tiempo.hoy_argentina()
    t = db.execute(
        select(Temporada)
        .where(Temporada.activa.is_(True), Temporada.fecha_inicio <= hoy, Temporada.fecha_fin >= hoy)
        .order_by(Temporada.id.desc())
        .limit(1)
    ).scalar_one_or_none()
    return float(t.multiplicador) if t else 1.0


def aplicar_multiplicador(puntos: int, multiplicador: float) -> int:
    # Redondeo "medio hacia arriba" (no el redondeo bancario de round()).
    return max(1, int(math.floor(puntos * multiplicador + 0.5 + 1e-9)))


# ------------------------------------------------------------------ cupones
def generar_codigo() -> str:
    cuerpo = "".join(secrets.choice(ALFABETO_CUPON) for _ in range(8))
    return f"JCP-{cuerpo[:4]}-{cuerpo[4:]}"


def normalizar_codigo(texto: str) -> str | None:
    """Normaliza lo que tipea el negocio. Devuelve `JCP-XXXX-XXXX` o None si no tiene formato válido."""
    if not texto or len(texto) > 40:
        return None
    s = re.sub(r"[\s\-_.]", "", texto.upper())
    if s.startswith("JCP"):
        s = s[3:]
    s = s.replace("O", "0").replace("I", "1").replace("L", "1")
    if not _RE_CODIGO.match(s):
        return None
    return f"JCP-{s[:4]}-{s[4:]}"


def marcar_vencidos(db: Session, *, usuario_id: int | None = None, negocio_id: int | None = None,
                    canje_id: int | None = None) -> None:
    """Pasa a VENCIDO los cupones DISPONIBLE con vence_en en el pasado (en su propia transacción)."""
    momento = tiempo.ahora()
    stmt = update(Canje).where(Canje.estado == "DISPONIBLE", Canje.vence_en <= momento)
    if usuario_id is not None:
        stmt = stmt.where(Canje.usuario_id == usuario_id)
    if canje_id is not None:
        stmt = stmt.where(Canje.id == canje_id)
    if negocio_id is not None:
        stmt = stmt.where(
            Canje.beneficio_id.in_(select(Beneficio.id).where(Beneficio.negocio_id == negocio_id))
        )
    with escritura(db):
        db.execute(stmt.values(estado="VENCIDO").execution_options(synchronize_session=False))


def realizar_canje(db: Session, usuario_id: int, beneficio_id: int) -> tuple[Canje, int]:
    """Canjea puntos por un cupón en una única transacción. Devuelve (canje, puntos_restantes)."""
    for _ in range(5):  # reintentos solo ante colisión (improbable) del código único
        try:
            with escritura(db):
                b = db.execute(select(Beneficio).where(Beneficio.id == beneficio_id)).scalar_one_or_none()
                if b is None:
                    raise no_encontrado("El beneficio no existe.")
                dueno_bloqueado = db.execute(
                    select(Usuario.bloqueado).join(Negocio, Negocio.usuario_id == Usuario.id)
                    .where(Negocio.id == b.negocio_id)
                ).scalar_one()
                if b.estado != "APROBADO" or not b.activo or b.eliminado or dueno_bloqueado:
                    raise ErrorAPI(409, "BENEFICIO_NO_DISPONIBLE", "Este beneficio no está disponible.")
                if b.stock is not None:
                    r = db.execute(
                        update(Beneficio)
                        .where(Beneficio.id == b.id, Beneficio.stock > 0)
                        .values(stock=Beneficio.stock - 1)
                        .execution_options(synchronize_session=False)
                    )
                    if r.rowcount == 0:
                        raise ErrorAPI(409, "SIN_STOCK", "Este beneficio se quedó sin stock.")
                r = db.execute(
                    update(Usuario)
                    .where(Usuario.id == usuario_id, Usuario.puntos >= b.puntos)
                    .values(puntos=Usuario.puntos - b.puntos)
                    .execution_options(synchronize_session=False)
                )
                if r.rowcount == 0:
                    actuales = db.execute(select(Usuario.puntos).where(Usuario.id == usuario_id)).scalar_one()
                    raise ErrorAPI(
                        409,
                        "PUNTOS_INSUFICIENTES",
                        "No tenés puntos suficientes para este beneficio.",
                        {"puntos": actuales, "necesarios": b.puntos},
                    )
                momento = tiempo.ahora()
                c = Canje(
                    codigo=generar_codigo(),
                    usuario_id=usuario_id,
                    beneficio_id=b.id,
                    puntos=b.puntos,
                    estado="DISPONIBLE",
                    vence_en=momento + timedelta(days=b.dias_validez),
                    creado_en=momento,
                )
                db.add(c)
                db.flush()
                db.add(MovimientoPuntos(usuario_id=usuario_id, delta=-b.puntos, campo="puntos", tipo="CANJE",
                                        referencia=f"canje:{c.id}", creado_en=momento))
                restantes = db.execute(select(Usuario.puntos).where(Usuario.id == usuario_id)).scalar_one()
            db.refresh(c)
            return c, restantes
        except IntegrityError:
            continue
    raise RuntimeError("No se pudo generar un código de cupón único")


# ------------------------------------------------------------------ paginación
def paginar(db: Session, stmt, pagina: int, por_pagina: int, serializar) -> dict:
    total = db.execute(select(func.count()).select_from(stmt.order_by(None).subquery())).scalar_one()
    filas = db.execute(stmt.limit(por_pagina).offset((pagina - 1) * por_pagina)).unique().scalars().all()
    return {"items": [serializar(f) for f in filas], "total": total, "pagina": pagina, "por_pagina": por_pagina}
