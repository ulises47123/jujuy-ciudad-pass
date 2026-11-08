"""Motor SQLAlchemy (sync). SQLite en WAL con foreign_keys y busy_timeout.

Las transacciones de lectura empiezan con BEGIN (diferido). Las de escritura usan `escritura(db)`,
que en SQLite emite BEGIN IMMEDIATE (toma el lock de escritura al empezar y evita errores de
"snapshot" al pasar de lectura a escritura). En PostgreSQL `escritura` es una transacción normal y
la correctitud la dan los UPDATE condicionales atómicos.
"""
from __future__ import annotations

import contextvars
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    pass


_inmediata: contextvars.ContextVar[bool] = contextvars.ContextVar("jcp_begin_inmediata", default=False)

engine: Engine | None = None
SessionLocal: sessionmaker[Session] | None = None


def _url_desde_path(db_path: str) -> str:
    if "://" in db_path:
        return db_path
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{db_path}"


def configurar(db_path: str) -> Engine:
    """Crea (o recrea) el motor global y las tablas."""
    global engine, SessionLocal
    if engine is not None:
        engine.dispose()
    url = _url_desde_path(db_path)
    es_sqlite = url.startswith("sqlite")
    kwargs: dict = {"pool_pre_ping": False}
    if es_sqlite:
        kwargs["connect_args"] = {"check_same_thread": False, "timeout": 10}
        kwargs["pool_size"] = 5
        kwargs["max_overflow"] = 10
    nuevo = create_engine(url, **kwargs)

    if es_sqlite:

        @event.listens_for(nuevo, "connect")
        def _al_conectar(dbapi_conn, _registro):  # pragma: no cover - trivial
            # Desactiva el manejo implícito de transacciones de pysqlite: las emitimos nosotros.
            dbapi_conn.isolation_level = None
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA foreign_keys=ON")
            cur.execute("PRAGMA busy_timeout=10000")
            cur.execute("PRAGMA synchronous=NORMAL")
            cur.execute("PRAGMA cache_size=-4000")  # ~4 MB por conexión, servidor chico
            cur.close()

        @event.listens_for(nuevo, "begin")
        def _al_empezar(conn):
            conn.exec_driver_sql("BEGIN IMMEDIATE" if _inmediata.get() else "BEGIN")

    engine = nuevo
    SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    from . import modelos  # noqa: F401  (registra las tablas)

    Base.metadata.create_all(engine)
    return engine


def obtener_db() -> Iterator[Session]:
    """Dependencia de FastAPI: una sesión por petición."""
    assert SessionLocal is not None, "Base de datos no configurada"
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def escritura(db: Session) -> Iterator[Session]:
    """Transacción de escritura: termina la lectura en curso y abre BEGIN IMMEDIATE.

    Hace commit al salir sin error y rollback si hay excepción.
    """
    if db.in_transaction():
        db.commit()
    token = _inmediata.set(True)
    try:
        db.connection()  # dispara el BEGIN (IMMEDIATE)
    finally:
        _inmediata.reset(token)
    try:
        yield db
        db.commit()
    except BaseException:
        db.rollback()
        raise
