"""Reglas anti‑trampa de presencia por GPS (docs/API.md §3.2 y §6)."""
from __future__ import annotations

import logging
import math
import statistics
from dataclasses import dataclass
from typing import Sequence

from sqlalchemy.orm import Session

from . import tiempo
from .config import Config
from .db import escritura
from .errores import ErrorAPI
from .esquemas import Muestra
from .modelos import Alerta

log = logging.getLogger("jcp.antitrampa")

RADIO_TIERRA_M = 6_371_008.8


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * RADIO_TIERRA_M * math.asin(min(1.0, math.sqrt(a)))


def muestras_invalidas(mensaje: str) -> ErrorAPI:
    return ErrorAPI(422, "MUESTRAS_INVALIDAS", mensaje)


def validar_muestras(muestras: Sequence[Muestra], reloj_ms: int, ahora_ms: int, cfg: Config) -> int:
    """Reglas 1 y 2. Devuelve el desfase de reloj (servidor - cliente) en ms."""
    if not cfg.muestras_min <= len(muestras) <= cfg.muestras_max:
        raise muestras_invalidas(
            f"Se necesitan entre {cfg.muestras_min} y {cfg.muestras_max} lecturas de ubicación."
        )
    for previa, actual in zip(muestras, muestras[1:]):
        if actual.tiempo_ms <= previa.tiempo_ms:
            raise muestras_invalidas("Las lecturas de ubicación no están en orden.")
    if muestras[-1].tiempo_ms - muestras[0].tiempo_ms < cfg.muestras_separacion_min_s * 1000:
        raise muestras_invalidas("Las lecturas de ubicación tienen que abarcar al menos unos segundos.")
    desfase = ahora_ms - reloj_ms
    for m in muestras:
        validar_antiguedad(m, reloj_ms, cfg)
    return desfase


def validar_antiguedad(m: Muestra, reloj_ms: int, cfg: Config) -> None:
    # antigüedad corregida = servidor_ahora - (tiempo_ms + desfase) = reloj_ms - tiempo_ms
    antiguedad_ms = reloj_ms - m.tiempo_ms
    if antiguedad_ms > cfg.muestra_antiguedad_max_s * 1000 or antiguedad_ms < -cfg.muestra_futuro_max_s * 1000:
        raise muestras_invalidas("Las lecturas de ubicación son demasiado viejas o tienen la hora mal.")


def hay_mock(muestras: Sequence[Muestra]) -> bool:
    return any(m.mock for m in muestras)


def precision_mediana(muestras: Sequence[Muestra]) -> float:
    return float(statistics.median(m.precision_m for m in muestras))


def validar_precision(muestras: Sequence[Muestra], cfg: Config) -> None:
    mediana = precision_mediana(muestras)
    if mediana > cfg.precision_max_m:
        raise ErrorAPI(
            422,
            "PRECISION_INSUFICIENTE",
            "La señal GPS no es lo bastante precisa. Probá al aire libre y esperá unos segundos.",
            {"precision_m": round(mediana, 1), "precision_max_m": cfg.precision_max_m},
        )


def validar_rango(muestras: Sequence[Muestra], lat: float, lon: float, radio_m: int) -> None:
    distancia = max(haversine_m(m.lat, m.lon, lat, lon) for m in muestras)
    if distancia > radio_m:
        raise ErrorAPI(
            403,
            "FUERA_DE_RANGO",
            "Todavía no estás en el lugar. Acercate un poco más.",
            {"distancia_m": round(distancia), "radio_m": radio_m},
        )


def velocidad_kmh(distancia_m: float, segundos: float) -> float:
    return (distancia_m / max(segundos, 1.0)) * 3.6


def muestras_identicas(muestras: Sequence[Muestra]) -> bool:
    primera = muestras[0]
    return all(m.lat == primera.lat and m.lon == primera.lon for m in muestras)


@dataclass
class Posicion:
    lat: float
    lon: float
    ms: int  # hora corregida al reloj del servidor


def evaluar_viaje(anterior: Posicion | None, actual: Posicion, cfg: Config) -> dict | None:
    """Devuelve los datos del viaje si es imposible; None si es plausible."""
    if anterior is None:
        return None
    distancia = haversine_m(anterior.lat, anterior.lon, actual.lat, actual.lon)
    efectiva = max(0.0, distancia - cfg.viaje_tolerancia_m)
    if efectiva <= 0:
        return None
    segundos = abs(actual.ms - anterior.ms) / 1000
    vel = velocidad_kmh(efectiva, segundos)
    if vel > cfg.velocidad_max_kmh:
        return {"velocidad_kmh": round(vel, 1), "distancia_m": round(distancia), "segundos": round(segundos, 1)}
    return None


def registrar_alerta(db: Session, tipo: str, usuario_id: int | None, datos: dict) -> None:
    """Crea la alerta en su propia transacción (persiste aunque después se devuelva un error)."""
    with escritura(db):
        db.add(Alerta(tipo=tipo, usuario_id=usuario_id, datos=datos, creado_en=tiempo.ahora()))
    log.warning("Alerta %s usuario=%s datos=%s", tipo, usuario_id, datos)
