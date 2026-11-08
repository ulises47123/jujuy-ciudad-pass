"""Reloj central (UTC naive en la base). Los tests pueden reemplazar `ahora`."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

ARGENTINA = timezone(timedelta(hours=-3))


def ahora() -> datetime:
    """Hora actual UTC sin tzinfo (así se guarda en la base)."""
    return datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)


def ahora_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def a_ms(dt: datetime) -> int:
    return int(dt.replace(tzinfo=timezone.utc).timestamp() * 1000)


def desde_ms(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).replace(tzinfo=None, microsecond=0)


def hoy_argentina(momento: datetime | None = None) -> date:
    m = momento or ahora()
    return m.replace(tzinfo=timezone.utc).astimezone(ARGENTINA).date()


def inicio_mes_argentina_utc(momento: datetime | None = None) -> datetime:
    m = (momento or ahora()).replace(tzinfo=timezone.utc).astimezone(ARGENTINA)
    inicio_local = m.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return inicio_local.astimezone(timezone.utc).replace(tzinfo=None)


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
