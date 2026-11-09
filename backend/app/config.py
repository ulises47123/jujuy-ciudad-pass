"""Configuración por variables de entorno (prefijo JCP_).

En dev se lee además `backend/.env` (formato CLAVE=valor). Las variables ya definidas en el
entorno tienen prioridad sobre el archivo.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
WEB_DIR = BACKEND_DIR.parent / "web"


def _cargar_dotenv(ruta: Path) -> None:
    if not ruta.is_file():
        return
    for linea in ruta.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        clave, valor = linea.split("=", 1)
        clave = clave.strip()
        valor = valor.strip().strip('"').strip("'")
        if clave.startswith("JCP_") and clave not in os.environ:
            os.environ[clave] = valor


def _str(nombre: str, defecto: str) -> str:
    return os.environ.get(nombre, defecto).strip()


def _int(nombre: str, defecto: int) -> int:
    valor = os.environ.get(nombre)
    return int(valor) if valor not in (None, "") else defecto


def _float(nombre: str, defecto: float) -> float:
    valor = os.environ.get(nombre)
    return float(valor) if valor not in (None, "") else defecto


def _bool(nombre: str, defecto: bool) -> bool:
    valor = os.environ.get(nombre)
    if valor in (None, ""):
        return defecto
    return valor.strip().lower() in ("1", "true", "si", "sí", "yes", "on")


@dataclass(frozen=True)
class Config:
    entorno: str = "dev"
    db_path: str = str(BACKEND_DIR / "data" / "jujuy-pass.db")
    cookie_secure: bool = False
    servir_web: bool = False
    log_level: str = "INFO"
    bcrypt_rounds: int = 12

    # Sesiones
    sesion_app_dias: int = 30
    sesion_web_horas: int = 12

    # Rate limits
    login_max_fallos: int = 5
    login_ventana_s: int = 900
    cupon_max_fallos: int = 20
    cupon_ventana_s: int = 600
    registro_max_hora: int = 10

    # Anti-trampa
    muestras_min: int = 3
    muestras_max: int = 10
    muestras_separacion_min_s: float = 5.0
    muestra_antiguedad_max_s: float = 60.0
    muestra_futuro_max_s: float = 5.0
    precision_max_m: float = 50.0
    velocidad_max_kmh: float = 200.0
    viaje_tolerancia_m: float = 100.0
    intento_duracion_s: int = 120
    fallos_max_24h: int = 3
    dispositivo_max_cuentas: int = 3

    web_dir: str = field(default=str(WEB_DIR))

    @property
    def es_prod(self) -> bool:
        return self.entorno == "prod"


def cargar_config() -> Config:
    _cargar_dotenv(BACKEND_DIR / ".env")
    entorno = _str("JCP_ENTORNO", "dev").lower()
    if entorno not in ("dev", "prod"):
        raise ValueError("JCP_ENTORNO debe ser 'dev' o 'prod'")
    return Config(
        entorno=entorno,
        db_path=_str("JCP_DB_PATH", str(BACKEND_DIR / "data" / "jujuy-pass.db")),
        cookie_secure=_bool("JCP_COOKIE_SECURE", entorno == "prod"),
        servir_web=_bool("JCP_SERVIR_WEB", False),
        log_level=_str("JCP_LOG_LEVEL", "INFO").upper(),
        bcrypt_rounds=_int("JCP_BCRYPT_ROUNDS", 12),
        sesion_app_dias=_int("JCP_SESION_APP_DIAS", 30),
        sesion_web_horas=_int("JCP_SESION_WEB_HORAS", 12),
        login_max_fallos=_int("JCP_LOGIN_MAX_FALLOS", 5),
        login_ventana_s=_int("JCP_LOGIN_VENTANA_S", 900),
        cupon_max_fallos=_int("JCP_CUPON_MAX_FALLOS", 20),
        cupon_ventana_s=_int("JCP_CUPON_VENTANA_S", 600),
        registro_max_hora=_int("JCP_REGISTRO_MAX_HORA", 10),
        muestras_min=_int("JCP_MUESTRAS_MIN", 3),
        muestras_max=_int("JCP_MUESTRAS_MAX", 10),
        muestras_separacion_min_s=_float("JCP_MUESTRAS_SEPARACION_MIN_S", 5.0),
        muestra_antiguedad_max_s=_float("JCP_MUESTRA_ANTIGUEDAD_MAX_S", 60.0),
        muestra_futuro_max_s=_float("JCP_MUESTRA_FUTURO_MAX_S", 5.0),
        precision_max_m=_float("JCP_PRECISION_MAX_M", 50.0),
        velocidad_max_kmh=_float("JCP_VELOCIDAD_MAX_KMH", 200.0),
        viaje_tolerancia_m=_float("JCP_VIAJE_TOLERANCIA_M", 100.0),
        intento_duracion_s=_int("JCP_INTENTO_DURACION_S", 120),
        fallos_max_24h=_int("JCP_FALLOS_MAX_24H", 3),
        dispositivo_max_cuentas=_int("JCP_DISPOSITIVO_MAX_CUENTAS", 3),
        web_dir=_str("JCP_WEB_DIR", str(WEB_DIR)),
    )


_config: Config | None = None


def obtener_config() -> Config:
    global _config
    if _config is None:
        _config = cargar_config()
    return _config


def establecer_config(config: Config) -> None:
    """Usado por los tests y por crear_app() para fijar la configuración activa."""
    global _config
    _config = config
