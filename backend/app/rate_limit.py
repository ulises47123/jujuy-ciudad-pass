"""Rate limiting en memoria por ventana deslizante (válido con un único worker).

La memoria está acotada: se purgan claves vencidas y, si aun así se supera `max_claves`, se
descartan las más viejas.
"""
from __future__ import annotations

import threading
import time
from collections import OrderedDict, deque


class LimitadorVentana:
    def __init__(self, max_eventos: int, ventana_s: float, max_claves: int = 20000) -> None:
        self.max_eventos = max_eventos
        self.ventana_s = ventana_s
        self.max_claves = max_claves
        self._datos: OrderedDict[str, deque[float]] = OrderedDict()
        self._lock = threading.Lock()
        self._ultima_purga = 0.0

    @staticmethod
    def _reloj() -> float:
        return time.monotonic()

    def _limpiar(self, cola: deque[float], ahora: float) -> None:
        limite = ahora - self.ventana_s
        while cola and cola[0] <= limite:
            cola.popleft()

    def _purgar(self, ahora: float) -> None:
        if ahora - self._ultima_purga < 60 and len(self._datos) < self.max_claves:
            return
        self._ultima_purga = ahora
        for clave in list(self._datos.keys()):
            cola = self._datos[clave]
            self._limpiar(cola, ahora)
            if not cola:
                del self._datos[clave]
        while len(self._datos) > self.max_claves:
            self._datos.popitem(last=False)

    def bloqueado(self, clave: str) -> int:
        """0 si se permite; si no, segundos hasta que se libere un lugar."""
        ahora = self._reloj()
        with self._lock:
            cola = self._datos.get(clave)
            if not cola:
                return 0
            self._limpiar(cola, ahora)
            if len(cola) < self.max_eventos:
                return 0
            return max(1, int(cola[0] + self.ventana_s - ahora) + 1)

    def registrar(self, clave: str) -> int:
        """Registra un evento y devuelve cuántos hay en la ventana."""
        ahora = self._reloj()
        with self._lock:
            self._purgar(ahora)
            cola = self._datos.get(clave)
            if cola is None:
                cola = deque()
                self._datos[clave] = cola
            else:
                self._datos.move_to_end(clave)
            self._limpiar(cola, ahora)
            cola.append(ahora)
            return len(cola)

    def reiniciar(self, clave: str) -> None:
        with self._lock:
            self._datos.pop(clave, None)

    def limpiar_todo(self) -> None:
        with self._lock:
            self._datos.clear()


class Limitadores:
    def __init__(self, login: LimitadorVentana, cupones: LimitadorVentana, registro: LimitadorVentana) -> None:
        self.login = login
        self.cupones = cupones
        self.registro = registro


_limitadores: Limitadores | None = None


def configurar_limitadores(cfg) -> Limitadores:
    global _limitadores
    _limitadores = Limitadores(
        login=LimitadorVentana(cfg.login_max_fallos, cfg.login_ventana_s),
        cupones=LimitadorVentana(cfg.cupon_max_fallos, cfg.cupon_ventana_s),
        registro=LimitadorVentana(cfg.registro_max_hora, 3600),
    )
    return _limitadores


def limitadores() -> Limitadores:
    assert _limitadores is not None, "Limitadores no configurados"
    return _limitadores
