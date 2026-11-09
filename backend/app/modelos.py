"""Modelo de datos (SQLite hoy, compatible con PostgreSQL)."""
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base
from .tiempo import ahora

ROLES = ("turista", "negocio", "residente", "admin")


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(80))
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    rol: Mapped[str] = mapped_column(String(20), index=True)
    procedencia: Mapped[str | None] = mapped_column(String(80), nullable=True)
    puntos: Mapped[int] = mapped_column(Integer, default=0)
    puntos_historicos: Mapped[int] = mapped_column(Integer, default=0)
    puntos_comunidad: Mapped[int] = mapped_column(Integer, default=0)
    bloqueado: Mapped[bool] = mapped_column(Boolean, default=False)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)

    negocio: Mapped["Negocio | None"] = relationship(back_populates="usuario", uselist=False, lazy="joined")


class Negocio(Base):
    __tablename__ = "negocios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), unique=True)
    nombre: Mapped[str] = mapped_column(String(80))
    direccion: Mapped[str] = mapped_column(String(200), default="")
    telefono: Mapped[str] = mapped_column(String(40), default="")
    descripcion: Mapped[str] = mapped_column(Text, default="")
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)

    usuario: Mapped[Usuario] = relationship(back_populates="negocio")


class Sesion(Base):
    __tablename__ = "sesiones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), index=True)
    cliente: Mapped[str] = mapped_column(String(10))  # app | web
    vence_en: Mapped[datetime] = mapped_column(DateTime)
    ultimo_uso: Mapped[datetime] = mapped_column(DateTime, default=ahora)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)


class Dispositivo(Base):
    __tablename__ = "dispositivos"
    __table_args__ = (UniqueConstraint("dispositivo_id", "usuario_id", name="uq_dispositivo_usuario"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dispositivo_id: Mapped[str] = mapped_column(String(64), index=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), index=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)


class Lugar(Base):
    __tablename__ = "lugares"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120))
    descripcion: Mapped[str] = mapped_column(Text, default="")
    direccion: Mapped[str] = mapped_column(String(200), default="")
    categoria: Mapped[str] = mapped_column(String(40), default="")
    latitud: Mapped[float] = mapped_column(Float)
    longitud: Mapped[float] = mapped_column(Float)
    radio_m: Mapped[int] = mapped_column(Integer, default=100)
    puntos: Mapped[int] = mapped_column(Integer, default=50)
    activo: Mapped[bool] = mapped_column(Boolean, default=False)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)


class Pregunta(Base):
    __tablename__ = "preguntas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lugar_id: Mapped[int] = mapped_column(ForeignKey("lugares.id"), index=True)
    texto: Mapped[str] = mapped_column(String(300))
    opciones: Mapped[list] = mapped_column(JSON)
    correcta_index: Mapped[int] = mapped_column(Integer)
    activa: Mapped[bool] = mapped_column(Boolean, default=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)


class IntentoVisita(Base):
    __tablename__ = "intentos_visita"
    __table_args__ = (Index("ix_intentos_usuario_lugar", "usuario_id", "lugar_id", "creado_en"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), index=True)
    lugar_id: Mapped[int] = mapped_column(ForeignKey("lugares.id"))
    pregunta_id: Mapped[int] = mapped_column(ForeignKey("preguntas.id"))
    orden_opciones: Mapped[list] = mapped_column(JSON)  # índices originales en el orden mostrado
    estado: Mapped[str] = mapped_column(String(15), default="PENDIENTE")
    # PENDIENTE | CORRECTO | INCORRECTO | EXPIRADO | ANULADO
    vence_en: Mapped[datetime] = mapped_column(DateTime)
    desfase_ms: Mapped[int] = mapped_column(Integer, default=0)
    latitud: Mapped[float] = mapped_column(Float)
    longitud: Mapped[float] = mapped_column(Float)
    fecha_ubicacion: Mapped[datetime] = mapped_column(DateTime)
    dispositivo_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    respondido_en: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)


class Visita(Base):
    __tablename__ = "visitas"
    __table_args__ = (UniqueConstraint("usuario_id", "lugar_id", name="uq_visita_usuario_lugar"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), index=True)
    lugar_id: Mapped[int] = mapped_column(ForeignKey("lugares.id"), index=True)
    intento_id: Mapped[int | None] = mapped_column(ForeignKey("intentos_visita.id"), nullable=True)
    puntos: Mapped[int] = mapped_column(Integer)
    multiplicador: Mapped[float] = mapped_column(Float, default=1.0)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=ahora, index=True)


class Beneficio(Base):
    __tablename__ = "beneficios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    negocio_id: Mapped[int] = mapped_column(ForeignKey("negocios.id"), index=True)
    titulo: Mapped[str] = mapped_column(String(120))
    descripcion: Mapped[str] = mapped_column(Text, default="")
    puntos: Mapped[int] = mapped_column(Integer)
    dias_validez: Mapped[int] = mapped_column(Integer, default=30)
    stock: Mapped[int | None] = mapped_column(Integer, nullable=True)  # restante; NULL = ilimitado
    estado: Mapped[str] = mapped_column(String(15), default="PENDIENTE")  # PENDIENTE | APROBADO | RECHAZADO
    motivo_rechazo: Mapped[str | None] = mapped_column(String(300), nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    eliminado: Mapped[bool] = mapped_column(Boolean, default=False)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)

    negocio: Mapped[Negocio] = relationship(lazy="joined")


class Canje(Base):
    __tablename__ = "canjes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    codigo: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), index=True)
    beneficio_id: Mapped[int] = mapped_column(ForeignKey("beneficios.id"), index=True)
    puntos: Mapped[int] = mapped_column(Integer)
    estado: Mapped[str] = mapped_column(String(15), default="DISPONIBLE")  # DISPONIBLE|USADO|VENCIDO|ANULADO
    vence_en: Mapped[datetime] = mapped_column(DateTime)
    usado_en: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    anulado_en: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=ahora, index=True)

    beneficio: Mapped[Beneficio] = relationship(lazy="joined")
    usuario: Mapped[Usuario] = relationship(lazy="joined")


class MovimientoPuntos(Base):
    __tablename__ = "movimientos_puntos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), index=True)
    delta: Mapped[int] = mapped_column(Integer)
    campo: Mapped[str] = mapped_column(String(20), default="puntos")  # puntos | puntos_comunidad
    tipo: Mapped[str] = mapped_column(String(30))  # VISITA | CANJE | DEVOLUCION_CANJE | RECOMENDACION_APROBADA
    referencia: Mapped[str | None] = mapped_column(String(60), nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)


class Recomendacion(Base):
    __tablename__ = "recomendaciones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), index=True)
    titulo: Mapped[str] = mapped_column(String(120))
    categoria: Mapped[str] = mapped_column(String(20))
    descripcion: Mapped[str] = mapped_column(Text)
    estado: Mapped[str] = mapped_column(String(15), default="PENDIENTE")  # PENDIENTE | APROBADA | RECHAZADA
    motivo_rechazo: Mapped[str | None] = mapped_column(String(300), nullable=True)
    aprobada_en: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)

    autor: Mapped[Usuario] = relationship(lazy="joined")


class Temporada(Base):
    __tablename__ = "temporadas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(80))
    fecha_inicio: Mapped[date] = mapped_column(Date)
    fecha_fin: Mapped[date] = mapped_column(Date)
    multiplicador: Mapped[float] = mapped_column(Float, default=1.0)
    activa: Mapped[bool] = mapped_column(Boolean, default=False)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)


class Alerta(Base):
    __tablename__ = "alertas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tipo: Mapped[str] = mapped_column(String(40), index=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True, index=True)
    datos: Mapped[dict] = mapped_column(JSON, default=dict)
    resuelta: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    resuelta_en: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resuelta_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)

    usuario: Mapped[Usuario | None] = relationship(foreign_keys=[usuario_id], lazy="joined")


class IntentoLogin(Base):
    """Auditoría de logins fallidos (el límite activo vive en memoria)."""

    __tablename__ = "intentos_login"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(254), index=True)
    ip: Mapped[str] = mapped_column(String(64))
    exito: Mapped[bool] = mapped_column(Boolean, default=False)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)
