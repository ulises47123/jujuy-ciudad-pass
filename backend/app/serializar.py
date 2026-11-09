"""Conversión de modelos a los objetos JSON del contrato (docs/API.md §2)."""
from __future__ import annotations

from datetime import date

from . import tiempo
from .modelos import Alerta, Beneficio, Canje, Lugar, Negocio, Pregunta, Recomendacion, Temporada, Usuario
from .tiempo import iso


def rango_turista(puntos_historicos: int) -> str:
    if puntos_historicos < 150:
        return "Novato"
    if puntos_historicos < 300:
        return "Explorador"
    return "Maestro Andino"


def rango_residente(puntos_comunidad: int) -> str:
    if puntos_comunidad < 300:
        return "Vecino"
    if puntos_comunidad < 1000:
        return "Vecino Activo"
    return "Embajador Local"


def rango_de(u: Usuario) -> str | None:
    if u.rol == "turista":
        return rango_turista(u.puntos_historicos)
    if u.rol == "residente":
        return rango_residente(u.puntos_comunidad)
    return None


def negocio(n: Negocio | None) -> dict | None:
    if n is None:
        return None
    return {
        "id": n.id,
        "nombre": n.nombre,
        "direccion": n.direccion,
        "telefono": n.telefono,
        "descripcion": n.descripcion,
    }


def usuario(u: Usuario) -> dict:
    return {
        "id": u.id,
        "nombre": u.nombre,
        "email": u.email,
        "rol": u.rol,
        "puntos": u.puntos,
        "puntos_historicos": u.puntos_historicos,
        "puntos_comunidad": u.puntos_comunidad,
        "rango": rango_de(u),
        "bloqueado": u.bloqueado,
        "creado_en": iso(u.creado_en),
        "negocio": negocio(u.negocio) if u.rol == "negocio" else None,
    }


def lugar_turista(l: Lugar, visitado: bool) -> dict:
    return {
        "id": l.id,
        "nombre": l.nombre,
        "descripcion": l.descripcion,
        "direccion": l.direccion,
        "categoria": l.categoria,
        "latitud": l.latitud,
        "longitud": l.longitud,
        "radio_m": l.radio_m,
        "puntos": l.puntos,
        "visitado": visitado,
    }


def lugar_admin(l: Lugar, cantidad_preguntas: int) -> dict:
    d = lugar_turista(l, False)
    del d["visitado"]
    d.update({"activo": l.activo, "cantidad_preguntas": cantidad_preguntas, "creado_en": iso(l.creado_en)})
    return d


def pregunta_admin(p: Pregunta) -> dict:
    return {
        "id": p.id,
        "lugar_id": p.lugar_id,
        "texto": p.texto,
        "opciones": list(p.opciones),
        "correcta_index": p.correcta_index,
        "activa": p.activa,
        "creado_en": iso(p.creado_en),
    }


def beneficio_turista(b: Beneficio) -> dict:
    return {
        "id": b.id,
        "titulo": b.titulo,
        "descripcion": b.descripcion,
        "puntos": b.puntos,
        "dias_validez": b.dias_validez,
        "stock_restante": b.stock,
        "negocio": {"id": b.negocio.id, "nombre": b.negocio.nombre, "direccion": b.negocio.direccion},
    }


def beneficio_gestion(b: Beneficio, admin: bool = False) -> dict:
    d = beneficio_turista(b)
    d.update(
        {
            "estado": b.estado,
            "activo": b.activo,
            "motivo_rechazo": b.motivo_rechazo,
            "eliminado": b.eliminado,
            "creado_en": iso(b.creado_en),
        }
    )
    if admin:
        d["negocio_id"] = b.negocio_id
    return d


def canje(c: Canje) -> dict:
    return {
        "id": c.id,
        "codigo": c.codigo,
        "estado": c.estado,
        "beneficio": {
            "id": c.beneficio.id,
            "titulo": c.beneficio.titulo,
            "negocio_nombre": c.beneficio.negocio.nombre,
        },
        "puntos": c.puntos,
        "creado_en": iso(c.creado_en),
        "vence_en": iso(c.vence_en),
        "usado_en": iso(c.usado_en),
    }


def canje_negocio(c: Canje) -> dict:
    d = canje(c)
    d["turista_nombre"] = c.usuario.nombre
    return d


def canje_admin(c: Canje) -> dict:
    d = canje(c)
    d.update(
        {
            "turista_id": c.usuario_id,
            "turista_nombre": c.usuario.nombre,
            "negocio_nombre": c.beneficio.negocio.nombre,
        }
    )
    return d


def recomendacion_propia(r: Recomendacion) -> dict:
    return {
        "id": r.id,
        "titulo": r.titulo,
        "categoria": r.categoria,
        "descripcion": r.descripcion,
        "estado": r.estado,
        "motivo_rechazo": r.motivo_rechazo,
        "creado_en": iso(r.creado_en),
    }


def recomendacion_publica(r: Recomendacion) -> dict:
    return {
        "id": r.id,
        "titulo": r.titulo,
        "categoria": r.categoria,
        "descripcion": r.descripcion,
        "autor_nombre": r.autor.nombre,
        "fecha": iso(r.aprobada_en or r.creado_en),
    }


def recomendacion_admin(r: Recomendacion) -> dict:
    d = recomendacion_propia(r)
    d.update({"autor_id": r.usuario_id, "autor_nombre": r.autor.nombre})
    return d


def temporada(t: Temporada, hoy: date | None = None) -> dict:
    hoy = hoy or tiempo.hoy_argentina()
    return {
        "id": t.id,
        "nombre": t.nombre,
        "fecha_inicio": t.fecha_inicio.isoformat(),
        "fecha_fin": t.fecha_fin.isoformat(),
        "multiplicador": t.multiplicador,
        "activa": t.activa,
        "vigente": bool(t.activa and t.fecha_inicio <= hoy <= t.fecha_fin),
        "creado_en": iso(t.creado_en),
    }


def alerta(a: Alerta) -> dict:
    return {
        "id": a.id,
        "tipo": a.tipo,
        "usuario_id": a.usuario_id,
        "usuario_nombre": a.usuario.nombre if a.usuario else None,
        "datos": a.datos or {},
        "resuelta": a.resuelta,
        "creado_en": iso(a.creado_en),
        "resuelta_en": iso(a.resuelta_en),
    }
