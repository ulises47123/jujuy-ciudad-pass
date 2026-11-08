"""Esquemas Pydantic v2 de entrada. Las respuestas se arman en `serializar.py`."""
from __future__ import annotations

import re
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

Nombre = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Titulo = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Descripcion = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
DescripcionObligatoria = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
Direccion = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
Telefono = Annotated[str, StringConstraints(strip_whitespace=True, max_length=40)]
Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]
DispositivoId = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[A-Za-z0-9_-]{8,64}$")]
Coordenada = Annotated[float, Field(allow_inf_nan=False)]

_EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$")

CATEGORIAS_RECOMENDACION = ("Gastronomía", "Historia", "Naturaleza", "Cultura", "Paseo", "Compras", "Otro")


class Entrada(BaseModel):
    model_config = ConfigDict(extra="ignore")


def _validar_email(valor: str) -> str:
    valor = valor.strip().lower()
    if len(valor) > 254 or not _EMAIL_RE.match(valor):
        raise ValueError("email inválido")
    return valor


# ------------------------------------------------------------------ auth
class RegistroEntrada(Entrada):
    nombre: Nombre
    email: str
    password: Password
    procedencia: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None
    dispositivo_id: DispositivoId

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return _validar_email(v)


class LoginEntrada(Entrada):
    email: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=254)]
    password: Annotated[str, StringConstraints(min_length=1, max_length=128)]
    cliente: Literal["app", "web"]
    dispositivo_id: DispositivoId | None = None


class CambiarPasswordEntrada(Entrada):
    actual: Annotated[str, StringConstraints(min_length=1, max_length=128)]
    nueva: Password


# ------------------------------------------------------------------ visitas
class Muestra(Entrada):
    lat: Coordenada = Field(ge=-90, le=90)
    lon: Coordenada = Field(ge=-180, le=180)
    precision_m: Coordenada = Field(ge=0, le=100000)
    tiempo_ms: int = Field(ge=0, le=10**14)
    mock: bool


class IniciarVisitaEntrada(Entrada):
    lugar_id: int
    dispositivo_id: DispositivoId | None = None
    reloj_ms: int = Field(ge=0, le=10**14)
    muestras: list[Muestra] = Field(max_length=50)


class ResponderVisitaEntrada(Entrada):
    intento_id: int
    opcion_index: int = Field(ge=0, le=20)
    muestra: Muestra
    reloj_ms: int | None = Field(default=None, ge=0, le=10**14)


class CanjeEntrada(Entrada):
    beneficio_id: int


# ------------------------------------------------------------------ negocio
class BeneficioEntrada(Entrada):
    titulo: Titulo
    descripcion: Descripcion = ""
    puntos: int = Field(ge=1, le=100000)
    dias_validez: int = Field(ge=1, le=365)
    stock: int | None = Field(default=None, ge=0, le=100000)


class BeneficioPatch(Entrada):
    titulo: Titulo | None = None
    descripcion: Descripcion | None = None
    puntos: int | None = Field(default=None, ge=1, le=100000)
    dias_validez: int | None = Field(default=None, ge=1, le=365)
    stock: int | None = Field(default=None, ge=0, le=100000)
    activo: bool | None = None


class NegocioPerfil(Entrada):
    nombre: Nombre
    direccion: Direccion = ""
    telefono: Telefono = ""
    descripcion: Descripcion = ""


class NegocioPerfilPatch(Entrada):
    nombre: Nombre | None = None
    direccion: Direccion | None = None
    telefono: Telefono | None = None
    descripcion: Descripcion | None = None


# ------------------------------------------------------------------ residente
class RecomendacionEntrada(Entrada):
    titulo: Titulo
    categoria: str
    descripcion: DescripcionObligatoria

    @field_validator("categoria")
    @classmethod
    def _categoria(cls, v: str) -> str:
        v = v.strip()
        if v not in CATEGORIAS_RECOMENDACION:
            raise ValueError("categoría inválida")
        return v


# ------------------------------------------------------------------ admin
class LugarEntrada(Entrada):
    nombre: Titulo
    descripcion: Descripcion = ""
    direccion: Direccion = ""
    categoria: Annotated[str, StringConstraints(strip_whitespace=True, max_length=40)] = ""
    latitud: Coordenada = Field(ge=-90, le=90)
    longitud: Coordenada = Field(ge=-180, le=180)
    radio_m: int = Field(ge=20, le=1000)
    puntos: int = Field(ge=1, le=1000)
    activo: bool = False


class LugarPatch(Entrada):
    nombre: Titulo | None = None
    descripcion: Descripcion | None = None
    direccion: Direccion | None = None
    categoria: Annotated[str, StringConstraints(strip_whitespace=True, max_length=40)] | None = None
    latitud: Coordenada | None = Field(default=None, ge=-90, le=90)
    longitud: Coordenada | None = Field(default=None, ge=-180, le=180)
    radio_m: int | None = Field(default=None, ge=20, le=1000)
    puntos: int | None = Field(default=None, ge=1, le=1000)
    activo: bool | None = None


Opcion = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
TextoPregunta = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


def _validar_opciones(opciones: list[str]) -> None:
    if len({o.casefold() for o in opciones}) != len(opciones):
        raise ValueError("las opciones no pueden repetirse")


class PreguntaEntrada(Entrada):
    texto: TextoPregunta
    opciones: list[Opcion] = Field(min_length=2, max_length=6)
    correcta_index: int

    @model_validator(mode="after")
    def _coherente(self):
        _validar_opciones(self.opciones)
        if not 0 <= self.correcta_index < len(self.opciones):
            raise ValueError("correcta_index fuera de rango")
        return self


class PreguntaPatch(Entrada):
    texto: TextoPregunta | None = None
    opciones: list[Opcion] | None = Field(default=None, min_length=2, max_length=6)
    correcta_index: int | None = None
    activa: bool | None = None

    @model_validator(mode="after")
    def _opciones(self):
        if self.opciones is not None:
            _validar_opciones(self.opciones)
        return self


class BeneficioAdminEntrada(BeneficioEntrada):
    negocio_id: int
    activo: bool = True


class BeneficioAdminPatch(BeneficioPatch):
    estado: Literal["PENDIENTE", "APROBADO", "RECHAZADO"] | None = None
    motivo_rechazo: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] | None = None


class UsuarioAdminEntrada(Entrada):
    nombre: Nombre
    email: str
    password: Password
    rol: Literal["turista", "negocio", "residente", "admin"]
    negocio: NegocioPerfil | None = None

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return _validar_email(v)

    @model_validator(mode="after")
    def _negocio(self):
        if self.rol == "negocio" and self.negocio is None:
            raise ValueError("negocio es obligatorio para rol negocio")
        return self


class UsuarioAdminPatch(Entrada):
    nombre: Nombre | None = None
    bloqueado: bool | None = None


class RechazoEntrada(Entrada):
    motivo: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


class TemporadaEntrada(Entrada):
    nombre: Nombre
    fecha_inicio: date
    fecha_fin: date
    multiplicador: float = Field(ge=0.5, le=5, allow_inf_nan=False)
    activa: bool = False

    @model_validator(mode="after")
    def _fechas(self):
        if self.fecha_fin < self.fecha_inicio:
            raise ValueError("fecha_fin no puede ser anterior a fecha_inicio")
        return self


class TemporadaPatch(Entrada):
    nombre: Nombre | None = None
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    multiplicador: float | None = Field(default=None, ge=0.5, le=5, allow_inf_nan=False)
    activa: bool | None = None


class AnularCanjeEntrada(Entrada):
    devolver_puntos: bool = False
