"""Línea de comandos: `python -m app.cli crear-admin|seed-demo`."""
from __future__ import annotations

import argparse
import getpass
import sys
from datetime import timedelta

from sqlalchemy import select

from . import db, tiempo
from .config import obtener_config
from .esquemas import _validar_email
from .modelos import Beneficio, Lugar, Negocio, Pregunta, Recomendacion, Temporada, Usuario
from .seguridad import hashear_password, password_aleatoria


def _leer_password() -> str:
    if sys.stdin.isatty():
        p1 = getpass.getpass("Contraseña (mín. 8 caracteres): ")
        p2 = getpass.getpass("Repetí la contraseña: ")
        if p1 != p2:
            raise SystemExit("Las contraseñas no coinciden.")
    else:
        p1 = sys.stdin.readline().rstrip("\r\n")
    if not 8 <= len(p1) <= 128:
        raise SystemExit("La contraseña debe tener entre 8 y 128 caracteres.")
    return p1


def crear_admin(email: str, nombre: str) -> int:
    try:
        email = _validar_email(email)
    except ValueError:
        raise SystemExit("Email inválido.")
    nombre = nombre.strip()
    if not 1 <= len(nombre) <= 80:
        raise SystemExit("El nombre debe tener entre 1 y 80 caracteres.")
    cfg = obtener_config()
    db.configurar(cfg.db_path)
    with db.SessionLocal() as s:
        if s.execute(select(Usuario.id).where(Usuario.email == email)).first():
            raise SystemExit("Ya existe un usuario con ese email.")
    password = _leer_password()
    with db.SessionLocal() as s, db.escritura(s):
        s.add(Usuario(nombre=nombre, email=email, password_hash=hashear_password(password), rol="admin",
                      creado_en=tiempo.ahora()))
    print(f"Admin creado: {email}")
    return 0


# ---------------------------------------------------------------------------- seed-demo
LUGARES_DEMO = [
    {
        "nombre": "Cabildo de Jujuy",
        "categoria": "Historia",
        "direccion": "Plaza Belgrano, lado norte",
        "descripcion": "Edificio colonial reconstruido en el siglo XIX frente a la plaza principal. "
                       "Hoy alberga el Museo Histórico Policial.",
        "latitud": -24.18542, "longitud": -65.29952, "radio_m": 80, "puntos": 50,
        "preguntas": [
            ("¿Qué museo funciona hoy en el edificio del Cabildo?",
             ["Museo Histórico Policial", "Museo de Bellas Artes", "Museo de Ciencias Naturales"], 0),
            ("¿Frente a qué plaza se encuentra el Cabildo?",
             ["Plaza Belgrano", "Plaza San Martín", "Plaza Mitre"], 0),
            ("¿Qué función cumplía el Cabildo en la época colonial?",
             ["Era la sede del gobierno de la ciudad", "Era un convento", "Era un mercado"], 0),
        ],
    },
    {
        "nombre": "Plaza General Belgrano",
        "categoria": "Paseo",
        "direccion": "Entre Belgrano, San Martín, Sarmiento y Gorriti",
        "descripcion": "La plaza fundacional de la ciudad, rodeada por la Catedral, la Casa de Gobierno y el Cabildo.",
        "latitud": -24.18580, "longitud": -65.29955, "radio_m": 90, "puntos": 40,
        "preguntas": [
            ("¿Qué militar ordenó el Éxodo Jujeño en 1812?",
             ["Manuel Belgrano", "José de San Martín", "Martín Miguel de Güemes", "Juan Lavalle"], 0),
            ("¿En qué fecha se realizó el Éxodo Jujeño?",
             ["23 de agosto de 1812", "25 de mayo de 1810", "9 de julio de 1816"], 0),
            ("¿En qué año se fundó San Salvador de Jujuy?",
             ["1593", "1810", "1492", "1700"], 0),
        ],
    },
    {
        "nombre": "Catedral de San Salvador de Jujuy",
        "categoria": "Historia",
        "direccion": "Plaza Belgrano, lado oeste",
        "descripcion": "Templo colonial famoso por su púlpito de madera tallada y dorada.",
        "latitud": -24.18598, "longitud": -65.30028, "radio_m": 70, "puntos": 50,
        "preguntas": [
            ("¿Por qué obra de arte es famosa la Catedral de Jujuy?",
             ["Su púlpito de madera tallada y dorada", "Sus vitrales góticos", "Su cúpula de vidrio"], 0),
            ("¿A quién está dedicada la Catedral, igual que el nombre de la ciudad?",
             ["Al Santísimo Salvador", "A San Francisco de Asís", "A Nuestra Señora de Luján"], 0),
        ],
    },
    {
        "nombre": "Casa de Gobierno y Salón de la Bandera",
        "categoria": "Historia",
        "direccion": "San Martín 450",
        "descripcion": "Sede del gobierno provincial. En el Salón de la Bandera se conserva la Bandera Nacional de la "
                       "Libertad Civil, donada por Belgrano al pueblo jujeño.",
        "latitud": -24.18605, "longitud": -65.29878, "radio_m": 70, "puntos": 60,
        "preguntas": [
            ("¿Qué bandera se conserva en el Salón de la Bandera?",
             ["La Bandera Nacional de la Libertad Civil", "La bandera de los Andes", "La bandera de Macha"], 0),
            ("¿Quién donó esa bandera al pueblo de Jujuy?",
             ["Manuel Belgrano", "Bernardino Rivadavia", "Juan Manuel de Rosas"], 0),
            ("¿Qué escultora realizó las estatuas que adornan la Casa de Gobierno?",
             ["Lola Mora", "Lucio Correa Morales", "Rogelio Yrurtia"], 0),
        ],
    },
    {
        "nombre": "Iglesia y Convento de San Francisco",
        "categoria": "Historia",
        "direccion": "Belgrano y Lavalle",
        "descripcion": "Templo franciscano con un destacado púlpito colonial tallado.",
        "latitud": -24.18490, "longitud": -65.30195, "radio_m": 70, "puntos": 40,
        "preguntas": [
            ("¿Qué orden religiosa está a cargo de esta iglesia?",
             ["Los franciscanos", "Los jesuitas", "Los dominicos"], 0),
            ("¿Qué elemento colonial tallado se destaca en su interior?",
             ["El púlpito", "Un órgano de tubos", "Un reloj de sol"], 0),
        ],
    },
    {
        "nombre": "Teatro Mitre",
        "categoria": "Cultura",
        "direccion": "Alvear y Lamadrid",
        "descripcion": "Principal sala teatral de la ciudad, de principios del siglo XX.",
        "latitud": -24.18712, "longitud": -65.30178, "radio_m": 60, "puntos": 40,
        "preguntas": [
            ("¿En honor a qué expresidente argentino lleva su nombre el teatro?",
             ["Bartolomé Mitre", "Domingo F. Sarmiento", "Nicolás Avellaneda"], 0),
            ("¿Qué tipo de espectáculos se presentan principalmente en el Teatro Mitre?",
             ["Obras de teatro, música y danza", "Partidos de fútbol", "Carreras de autos"], 0),
        ],
    },
    {
        "nombre": "Parque San Martín",
        "categoria": "Naturaleza",
        "direccion": "Centro, hacia el oeste de la Plaza Belgrano",
        "descripcion": "Gran espacio verde de la ciudad, ideal para caminar y descansar a la sombra.",
        "latitud": -24.19010, "longitud": -65.30420, "radio_m": 150, "puntos": 30,
        "preguntas": [
            ("¿En homenaje a qué prócer se llama el parque?",
             ["José de San Martín", "Manuel Belgrano", "Juan Galo Lavalle"], 0),
            ("¿Qué cordillera cruzó San Martín con el Ejército de los Andes?",
             ["La cordillera de los Andes", "Las Sierras de Córdoba", "Los Alpes"], 0),
        ],
    },
    {
        "nombre": "Mercado 6 de Agosto",
        "categoria": "Gastronomía",
        "direccion": "Zona de la vieja terminal",
        "descripcion": "Mercado popular con productos andinos: papas de colores, hierbas, especias y comidas regionales.",
        "latitud": -24.19340, "longitud": -65.29890, "radio_m": 100, "puntos": 40,
        "preguntas": [
            ("¿Qué tubérculo andino se consigue en decenas de variedades y colores?",
             ["La papa andina", "La batata", "El jengibre"], 0),
            ("¿Qué país celebra su independencia el 6 de agosto?",
             ["Bolivia", "Chile", "Paraguay", "Uruguay"], 0),
            ("¿Qué grano andino muy nutritivo se vende en el mercado?",
             ["La quinoa", "El arroz basmati", "El centeno"], 0),
        ],
    },
]

NEGOCIOS_DEMO = [
    ("Café Belgrano", "Belgrano 650", "388 400-0001", "Café de especialidad frente a la plaza.",
     [("2x1 en café con leche", "Válido de lunes a viernes por la mañana.", 100, 30, None),
      ("Porción de torta gratis", "Con cualquier bebida caliente.", 180, 30, 50)]),
    ("Peña La Jujeña", "Lavalle 320", "388 400-0002", "Comidas regionales y música en vivo.",
     [("Empanadas: 3x2", "Empanadas jujeñas al horno.", 150, 30, None),
      ("Entrada gratis a la peña", "Válido viernes y sábados.", 250, 15, 20)]),
    ("Artesanías Quebrada", "Paseo de los artesanos, Plaza Belgrano", "388 400-0003",
     "Tejidos y cerámica de artesanos locales.",
     [("15% de descuento en tejidos", "No acumulable con otras promociones.", 120, 60, None)]),
    ("Heladería Xibi Xibi", "Senador Pérez 410", "388 400-0004", "Helados artesanales con sabores regionales.",
     [("Cucurucho de cortesía", "Sabor a elección.", 80, 15, 100)]),
]

EMAILS_DEMO = {
    "turista": "turista@demo.jujuypass.ar",
    "negocio": "negocio@demo.jujuypass.ar",
    "residente": "residente@demo.jujuypass.ar",
    "admin": "admin@demo.jujuypass.ar",
}


def seed_demo() -> int:
    cfg = obtener_config()
    if cfg.es_prod:
        print("seed-demo no se puede ejecutar con JCP_ENTORNO=prod.", file=sys.stderr)
        return 2
    db.configurar(cfg.db_path)
    with db.SessionLocal() as s:
        existentes = s.execute(select(Usuario.email).where(Usuario.email.in_(EMAILS_DEMO.values()))).scalars().all()
        if existentes:
            print("Los datos demo ya existen (usuarios: " + ", ".join(existentes) + "). No se hizo nada.",
                  file=sys.stderr)
            return 1

    passwords = {rol: password_aleatoria(12) for rol in EMAILS_DEMO}
    hashes = {rol: hashear_password(p) for rol, p in passwords.items()}
    momento = tiempo.ahora()
    with db.SessionLocal() as s, db.escritura(s):
        usuarios = {}
        nombres = {"turista": "Turista Demo", "negocio": "Café Belgrano (demo)", "residente": "Vecina Demo",
                   "admin": "Admin Demo"}
        for rol, email in EMAILS_DEMO.items():
            u = Usuario(nombre=nombres[rol], email=email, password_hash=hashes[rol], rol=rol, creado_en=momento)
            s.add(u)
            usuarios[rol] = u
        s.flush()

        for datos in LUGARES_DEMO:
            preguntas = datos["preguntas"]
            campos = {k: v for k, v in datos.items() if k != "preguntas"}
            lugar = Lugar(**campos, activo=True, creado_en=momento)
            s.add(lugar)
            s.flush()
            for texto, opciones, correcta in preguntas:
                s.add(Pregunta(lugar_id=lugar.id, texto=texto, opciones=opciones, correcta_index=correcta,
                               activa=True, creado_en=momento))

        for i, (nombre, direccion, telefono, descripcion, beneficios) in enumerate(NEGOCIOS_DEMO):
            if i == 0:
                dueno = usuarios["negocio"]
            else:
                dueno = Usuario(nombre=f"{nombre} (demo)", email=f"negocio{i + 1}@demo.jujuypass.ar",
                                password_hash=hashes["negocio"], rol="negocio", creado_en=momento)
                s.add(dueno)
                s.flush()
            n = Negocio(usuario_id=dueno.id, nombre=nombre, direccion=direccion, telefono=telefono,
                        descripcion=descripcion, creado_en=momento)
            s.add(n)
            s.flush()
            for titulo, desc, puntos, dias, stock in beneficios:
                s.add(Beneficio(negocio_id=n.id, titulo=titulo, descripcion=desc, puntos=puntos, dias_validez=dias,
                                stock=stock, estado="APROBADO", activo=True, eliminado=False, creado_en=momento))

        hoy = tiempo.hoy_argentina()
        s.add(Temporada(nombre="Temporada de primavera", fecha_inicio=hoy - timedelta(days=30),
                        fecha_fin=hoy + timedelta(days=60), multiplicador=1.5, activa=True, creado_en=momento))

        s.add(Recomendacion(usuario_id=usuarios["residente"].id, titulo="Tamales en la feria del barrio",
                            categoria="Gastronomía",
                            descripcion="Los sábados a la mañana hay puestos con tamales y humitas caseras.",
                            estado="APROBADA", aprobada_en=momento, creado_en=momento))
        s.add(Recomendacion(usuario_id=usuarios["residente"].id, titulo="Atardecer desde el puente Lavalle",
                            categoria="Paseo", descripcion="Al caer el sol se ven los cerros sobre el río Grande.",
                            estado="PENDIENTE", creado_en=momento))

    print("Datos demo creados. Usuarios (las contraseñas son aleatorias y no se guardan en ningún lado):")
    for rol, email in EMAILS_DEMO.items():
        print(f"  {rol:10s} {email:32s} {passwords[rol]}")
    print("  (los negocios 2..4 usan la misma contraseña que el negocio demo: negocio2@, negocio3@, negocio4@...)")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="Jujuy Ciudad Pass - CLI")
    sub = parser.add_subparsers(dest="comando", required=True)
    p_admin = sub.add_parser("crear-admin", help="Crea un usuario administrador")
    p_admin.add_argument("--email", required=True)
    p_admin.add_argument("--nombre", required=True)
    sub.add_parser("seed-demo", help="Carga datos de demostración (solo dev)")
    args = parser.parse_args(argv)
    if args.comando == "crear-admin":
        return crear_admin(args.email, args.nombre)
    return seed_demo()


if __name__ == "__main__":
    sys.exit(main())
