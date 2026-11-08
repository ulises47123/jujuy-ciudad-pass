import http.server
import socketserver
import json
import sqlite3
import os
import hashlib
import math
import urllib.parse

PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, 'jujuy_pass.db')
PUBLIC_DIR = os.path.join(BASE_DIR, 'public')

def get_db():
    conn = sqlite3.connect(DB_FILE, timeout=20.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn

def hash_pw(pw: str) -> str:
    return hashlib.sha256(f"jujuy_salt_2026_{pw}".encode('utf-8')).hexdigest()

def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371000 # Radio en metros
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2.0)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2.0)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def init_db():
    conn = get_db()
    c = conn.cursor()

    # 1. Usuarios
    c.execute('''
    CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        nombre TEXT NOT NULL,
        rol TEXT CHECK(rol IN ('turista', 'residente', 'admin')) NOT NULL DEFAULT 'turista',
        puntos_turista INTEGER DEFAULT 0,
        puntos_comunidad INTEGER DEFAULT 0,
        rango TEXT DEFAULT 'Novato',
        intereses TEXT DEFAULT '[]',
        tiempo_estadia TEXT DEFAULT 'explorador',
        viaja_en_grupo INTEGER DEFAULT 0,
        procedencia TEXT DEFAULT 'Argentina',
        barrio TEXT DEFAULT '',
        bloqueado INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # 2. Lugares turísticos
    c.execute('''
    CREATE TABLE IF NOT EXISTS lugares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        descripcion TEXT,
        direccion TEXT,
        latitud REAL NOT NULL,
        longitud REAL NOT NULL,
        radio_metros REAL DEFAULT 100.0,
        categoria TEXT NOT NULL,
        pregunta_verificacion TEXT NOT NULL,
        opciones_json TEXT NOT NULL,
        respuesta_correcta TEXT NOT NULL,
        puntos_otorgados INTEGER NOT NULL DEFAULT 50,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # 3. Comercios y Beneficios
    c.execute('''
    CREATE TABLE IF NOT EXISTS beneficios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        tipo TEXT NOT NULL,
        descripcion TEXT NOT NULL,
        puntos_necesarios INTEGER NOT NULL,
        comercio TEXT DEFAULT 'Comercio Adherido',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # 4. Historial de Visitas
    c.execute('''
    CREATE TABLE IF NOT EXISTS historial_visitas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_usuario INTEGER NOT NULL,
        id_lugar INTEGER NOT NULL,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        puntos_ganados INTEGER NOT NULL,
        FOREIGN KEY(id_usuario) REFERENCES usuarios(id),
        FOREIGN KEY(id_lugar) REFERENCES lugares(id)
    )
    ''')

    # 5. Recomendaciones de Residentes
    c.execute('''
    CREATE TABLE IF NOT EXISTS recomendaciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_residente INTEGER NOT NULL,
        lugar_nombre TEXT NOT NULL,
        comentario TEXT NOT NULL,
        puntos_otorgados INTEGER DEFAULT 50,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(id_residente) REFERENCES usuarios(id)
    )
    ''')

    # 6. Canjes
    c.execute('''
    CREATE TABLE IF NOT EXISTS canjes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_usuario INTEGER NOT NULL,
        id_beneficio INTEGER NOT NULL,
        id_comercio_residente INTEGER,
        codigo_unico TEXT UNIQUE NOT NULL,
        puntos_gastados INTEGER NOT NULL,
        estado TEXT CHECK(estado IN ('PENDIENTE', 'CONFIRMADO')) DEFAULT 'PENDIENTE',
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(id_usuario) REFERENCES usuarios(id),
        FOREIGN KEY(id_beneficio) REFERENCES beneficios(id)
    )
    ''')

    # 7. Temporadas
    c.execute('''
    CREATE TABLE IF NOT EXISTS temporadas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        fecha_inicio TEXT,
        fecha_fin TEXT,
        multiplicador_puntos REAL DEFAULT 1.0,
        activa INTEGER DEFAULT 0
    )
    ''')

    # Semillas de usuarios siempre sincronizadas
    demo_users = [
        ("admin@admin.com", hash_pw("admin123"), "Administrador General", "admin", 0, 0, "Administrador General", "Centro"),
        ("carlos@residente.com", hash_pw("residente123"), "Carlos R. (Residente)", "residente", 0, 1150, "Embajador Local", "Barrio Centro"),
        ("mateo@turista.com", hash_pw("turista123"), "Mateo García", "turista", 250, 0, "Explorador", "Buenos Aires")
    ]
    for email, pwh, nom, rol, pt, pc, rk, prov in demo_users:
        c.execute("SELECT id FROM usuarios WHERE email = ?", (email,))
        row = c.fetchone()
        if not row:
            c.execute('''
            INSERT INTO usuarios (email, password_hash, nombre, rol, puntos_turista, puntos_comunidad, rango, intereses, tiempo_estadia, viaja_en_grupo, procedencia, barrio)
            VALUES (?, ?, ?, ?, ?, ?, ?, '["Historia", "Naturaleza"]', 'explorador', 1, ?, ?)
            ''', (email, pwh, nom, rol, pt, pc, rk, prov, prov))
        else:
            # Asegurar que la contraseña coincida siempre
            c.execute("UPDATE usuarios SET password_hash = ? WHERE email = ?", (pwh, email))

    # Semillas de lugares
    c.execute("SELECT count(*) as cnt FROM lugares")
    if c.fetchone()['cnt'] == 0:
        lugares_seed = [
            (
                "Cabildo de Jujuy",
                "Monumento Histórico Nacional frente a Plaza Belgrano, sede del Museo Histórico y testigo del Éxodo Jujeño.",
                "Belgrano 493, San Salvador de Jujuy",
                -24.18567, -65.30012, 100.0, "Historia",
                "¿En qué año fue fundado el histórico Cabildo de Jujuy?",
                json.dumps(["1593", "1810", "1834"]), "1593", 50
            ),
            (
                "Parque Botánico Municipal 'Barón Schuel'",
                "Reserva natural urbana en Los Perales con senderos ecológicos en plena Selva de Yungas.",
                "Caballito 450, Los Perales",
                -24.17511, -65.31295, 150.0, "Naturaleza",
                "¿Qué ecosistema de montaña protege principalmente esta reserva?",
                json.dumps(["Selva de Yungas", "Puna y Prepuna", "Estepa"]), "Selva de Yungas", 120
            ),
            (
                "Paseo Sarmiento y Corredor Sabores",
                "Centro gastronómico por excelencia para degustar humitas, empanadas y tamales tradicionales.",
                "Paseo Sarmiento y Belgrano",
                -24.18432, -65.30215, 100.0, "Sabores",
                "¿Cuál es el ingrediente base tradicional de la humita jujeña?",
                json.dumps(["Maíz choclo rallado", "Carne picada", "Harina"]), "Maíz choclo rallado", 70
            ),
            (
                "Mercado 6 de Agosto (Central)",
                "Edificio patrimonial gastronómico con productos de la Quebrada y los Valles.",
                "Alvear y Balcarce, Centro",
                -24.18720, -65.30150, 100.0, "Cultura",
                "¿En qué año tuvo lugar la gesta heroica del Éxodo Jujeño?",
                json.dumps(["1812", "1816", "1825"]), "1812", 60
            ),
            (
                "Ciudad Cultural",
                "Predio de eventos y festivales, sede oficial de la Fiesta Nacional de los Estudiantes.",
                "Alto Padilla, San Salvador",
                -24.16850, -65.31980, 200.0, "Cultura",
                "¿Qué fiesta estudiantil nacional se realiza anualmente en este predio?",
                json.dumps(["Fiesta Nacional de los Estudiantes", "Carnaval de Jujuy", "Festival del Huancar"]), "Fiesta Nacional de los Estudiantes", 90
            )
        ]
        c.executemany('''
        INSERT INTO lugares (nombre, descripcion, direccion, latitud, longitud, radio_metros, categoria, pregunta_verificacion, opciones_json, respuesta_correcta, puntos_otorgados)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', lugares_seed)

    # Semillas de beneficios
    c.execute("SELECT count(*) as cnt FROM beneficios")
    if c.fetchone()['cnt'] == 0:
        beneficios_seed = [
            ("2x1 en Café de Especialidad", "Cafetería", "Dos cafés al precio de uno en Café Central.", 100, "Café Central"),
            ("20% de Descuento en Artesanías", "Artesanías", "Descuento en tejidos de vicuña y cerámica.", 150, "Paseo de Artesanos"),
            ("Entrada Libre a Museo Arqueológico", "Cultura", "Acceso liberado para 1 persona.", 200, "Museo Provincial"),
            ("Empanada Jujeña de Degustación", "Gastronomía", "Cortesía con tu consumo regional.", 80, "Rincón Tradicional")
        ]
        c.executemany('''
        INSERT INTO beneficios (nombre, tipo, descripcion, puntos_necesarios, comercio)
        VALUES (?, ?, ?, ?, ?)
        ''', beneficios_seed)

    # Temporada
    c.execute("SELECT count(*) as cnt FROM temporadas")
    if c.fetchone()['cnt'] == 0:
        c.execute('''
        INSERT INTO temporadas (nombre, fecha_inicio, fecha_fin, multiplicador_puntos, activa)
        VALUES ('Temporada Regular', '2026-01-01', '2026-12-31', 1.0, 1)
        ''')

    conn.commit()
    conn.close()

class JujuyServer(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def read_json_body(self):
        content_len = int(self.headers.get('Content-Length', 0))
        if content_len > 0:
            raw_bytes = self.rfile.read(content_len)
            try:
                text = raw_bytes.decode('utf-8')
            except UnicodeDecodeError:
                text = raw_bytes.decode('latin-1', errors='replace')
            return json.loads(text)
        return {}

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path.startswith('/api/'):
            conn = get_db()
            c = conn.cursor()

            if path == '/api/lugares':
                c.execute("SELECT * FROM lugares")
                rows = [dict(r) for r in c.fetchall()]
                for r in rows:
                    try:
                        r['opciones'] = json.loads(r['opciones_json'])
                    except:
                        r['opciones'] = []
                conn.close()
                return self.send_json({"status": "success", "lugares": rows})

            elif path == '/api/beneficios':
                c.execute("SELECT * FROM beneficios")
                rows = [dict(r) for r in c.fetchall()]
                conn.close()
                return self.send_json({"status": "success", "beneficios": rows})

            elif path == '/api/auth/me' or path == '/api/usuario':
                user_id = query.get('id', [None])[0]
                if not user_id:
                    conn.close()
                    return self.send_json({"status": "error", "message": "ID requerido"}, 400)
                
                c.execute("SELECT id, email, nombre, rol, puntos_turista, puntos_comunidad, rango, intereses, tiempo_estadia, viaja_en_grupo, procedencia, barrio, bloqueado FROM usuarios WHERE id = ?", (user_id,))
                row = c.fetchone()
                if not row:
                    conn.close()
                    return self.send_json({"status": "error", "message": "Usuario no encontrado"}, 404)
                
                u = dict(row)
                try:
                    u['intereses'] = json.loads(u['intereses'])
                except:
                    u['intereses'] = []
                
                # Canjes
                c.execute('''
                SELECT c.id, c.codigo_unico, c.estado, c.puntos_gastados, c.fecha, b.nombre as beneficio_nombre, b.tipo
                FROM canjes c
                JOIN beneficios b ON c.id_beneficio = b.id
                WHERE c.id_usuario = ?
                ORDER BY c.fecha DESC
                ''', (u['id'],))
                u['canjes'] = [dict(item) for item in c.fetchall()]

                # Visitas
                c.execute('''
                SELECT h.id_lugar, l.nombre as lugar_nombre, h.fecha, h.puntos_ganados
                FROM historial_visitas h
                JOIN lugares l ON h.id_lugar = l.id
                WHERE h.id_usuario = ?
                ''', (u['id'],))
                u['visitas'] = [dict(v) for v in c.fetchall()]
                u['misiones_completadas'] = len(u['visitas'])

                # Recomendaciones (residente)
                c.execute("SELECT * FROM recomendaciones WHERE id_residente = ? ORDER BY fecha DESC", (u['id'],))
                u['recomendaciones_hechas'] = [dict(r) for r in c.fetchall()]

                conn.close()
                return self.send_json({"status": "success", "usuario": u})

            elif path == '/api/comunidad/ranking':
                c.execute("SELECT id, nombre, barrio, puntos_comunidad, rango FROM usuarios WHERE rol = 'residente' ORDER BY puntos_comunidad DESC LIMIT 10")
                ranking = [dict(r) for r in c.fetchall()]

                c.execute('''
                SELECT r.*, u.nombre as residente_nombre, u.barrio as residente_barrio
                FROM recomendaciones r
                JOIN usuarios u ON r.id_residente = u.id
                ORDER BY r.fecha DESC
                LIMIT 20
                ''')
                recs = [dict(r) for r in c.fetchall()]

                conn.close()
                return self.send_json({"status": "success", "ranking": ranking, "recomendaciones": recs})

            elif path == '/api/admin/estadisticas':
                c.execute("SELECT count(*) as total, sum(case when rol='turista' then 1 else 0 end) as turistas, sum(case when rol='residente' then 1 else 0 end) as residentes FROM usuarios")
                stats_users = dict(c.fetchone())

                c.execute('''
                SELECT l.id, l.nombre, l.categoria, count(h.id) as total_visitas, sum(coalesce(h.puntos_ganados, 0)) as total_puntos
                FROM lugares l
                LEFT JOIN historial_visitas h ON l.id = h.id_lugar
                GROUP BY l.id
                ORDER BY total_visitas DESC
                LIMIT 5
                ''')
                top_mas = [dict(r) for r in c.fetchall()]

                c.execute('''
                SELECT l.id, l.nombre, l.categoria, count(h.id) as total_visitas, sum(coalesce(h.puntos_ganados, 0)) as total_puntos
                FROM lugares l
                LEFT JOIN historial_visitas h ON l.id = h.id_lugar
                GROUP BY l.id
                ORDER BY total_visitas ASC
                LIMIT 5
                ''')
                top_menos = [dict(r) for r in c.fetchall()]

                c.execute('''
                SELECT c.id, c.codigo_unico, c.estado, c.puntos_gastados, c.fecha, u.nombre as turista_nombre, b.nombre as beneficio_nombre
                FROM canjes c
                JOIN usuarios u ON c.id_usuario = u.id
                JOIN beneficios b ON c.id_beneficio = b.id
                ORDER BY c.fecha DESC
                LIMIT 15
                ''')
                historial_canjes = [dict(r) for r in c.fetchall()]

                conn.close()
                return self.send_json({
                    "status": "success",
                    "usuarios": stats_users,
                    "top_mas_visitados": top_mas,
                    "top_menos_visitados": top_menos,
                    "historial_canjes": historial_canjes
                })

            elif path == '/api/turista/canjes':
                user_id = query.get('usuario_id', [None])[0] or query.get('id', [None])[0]
                if not user_id:
                    conn.close()
                    return self.send_json({"status": "success", "canjes": []})
                c.execute('''
                SELECT c.id, c.codigo_unico as codigo_cupon, c.codigo_unico, c.estado, 
                       (CASE WHEN c.estado = 'CONFIRMADO' THEN 1 ELSE 0 END) as usado,
                       c.puntos_gastados, c.fecha, b.nombre as beneficio_nombre, b.tipo
                FROM canjes c
                JOIN beneficios b ON c.id_beneficio = b.id
                WHERE c.id_usuario = ?
                ORDER BY c.fecha DESC
                ''', (user_id,))
                canjes = [dict(item) for item in c.fetchall()]
                conn.close()
                return self.send_json({"status": "success", "canjes": canjes})

            elif path == '/api/turista/historial':
                user_id = query.get('usuario_id', [None])[0] or query.get('id', [None])[0]
                if not user_id:
                    conn.close()
                    return self.send_json({"status": "success", "historial": []})
                c.execute('''
                SELECT h.id, h.id_lugar, l.nombre as lugar_nombre, h.fecha, h.puntos_ganados, 'gps' as metodo
                FROM historial_visitas h
                JOIN lugares l ON h.id_lugar = l.id
                WHERE h.id_usuario = ?
                ORDER BY h.fecha DESC
                ''', (user_id,))
                visitas = [dict(v) for v in c.fetchall()]
                conn.close()
                return self.send_json({"status": "success", "historial": visitas})

            elif path == '/api/recomendaciones':
                c.execute('''
                SELECT r.id, r.lugar_nombre as titulo, r.comentario as descripcion, 'Gastronomía y Cultura' as categoria,
                       r.fecha, u.nombre as autor_nombre
                FROM recomendaciones r
                JOIN usuarios u ON r.id_residente = u.id
                ORDER BY r.fecha DESC
                ''')
                recs = [dict(r) for r in c.fetchall()]
                conn.close()
                return self.send_json({"status": "success", "recomendaciones": recs})

            elif path == '/api/admin/usuarios':
                c.execute("SELECT id, email, nombre, rol, puntos_turista, puntos_comunidad, rango, bloqueado, created_at FROM usuarios ORDER BY id DESC")
                users = [dict(r) for r in c.fetchall()]
                conn.close()
                return self.send_json({"status": "success", "usuarios": users})

            conn.close()
            return self.send_json({"status": "error", "message": "Endpoint no encontrado"}, 404)

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self.read_json_body()

        if path.startswith('/api/'):
            conn = get_db()
            c = conn.cursor()

            if path in ('/api/auth/login', '/api/login'):
                email = body.get('email', '').strip()
                password = body.get('password', '').strip()

                c.execute("SELECT * FROM usuarios WHERE email = ?", (email,))
                user = c.fetchone()
                if not user:
                    conn.close()
                    return self.send_json({"status": "error", "message": "Credenciales inválidas"}, 401)

                u = dict(user)
                if u['password_hash'] != hash_pw(password):
                    conn.close()
                    return self.send_json({"status": "error", "message": "Contraseña incorrecta"}, 401)

                try:
                    u['intereses'] = json.loads(u['intereses'])
                except:
                    u['intereses'] = []
                del u['password_hash']

                conn.close()
                return self.send_json({"status": "success", "usuario": u, "user": u})

            elif path in ('/api/auth/register', '/api/registro'):
                nombre = body.get('nombre', '').strip()
                email = body.get('email', '').strip()
                password = body.get('password', '').strip()
                intereses = json.dumps(body.get('intereses', []))
                tiempo_estadia = body.get('tiempo_estadia', 'explorador')
                viaja_en_grupo = 1 if body.get('viaja_en_grupo') else 0
                procedencia = body.get('procedencia', 'Argentina')

                if not nombre or not email or not password:
                    conn.close()
                    return self.send_json({"status": "error", "message": "Campos obligatorios incompletos"}, 400)

                puntos_iniciales = 15 if viaja_en_grupo == 1 else 0

                try:
                    c.execute('''
                    INSERT INTO usuarios (email, password_hash, nombre, rol, puntos_turista, puntos_comunidad, rango, intereses, tiempo_estadia, viaja_en_grupo, procedencia)
                    VALUES (?, ?, ?, 'turista', ?, 0, 'Novato', ?, ?, ?, ?)
                    ''', (email, hash_pw(password), nombre, puntos_iniciales, intereses, tiempo_estadia, viaja_en_grupo, procedencia))
                    conn.commit()
                    uid = c.lastrowid
                    
                    c.execute("SELECT id, email, nombre, rol, puntos_turista, puntos_comunidad, rango, intereses, tiempo_estadia, viaja_en_grupo, procedencia FROM usuarios WHERE id = ?", (uid,))
                    new_u = dict(c.fetchone())
                    new_u['intereses'] = json.loads(new_u['intereses'])
                    conn.close()
                    return self.send_json({"status": "success", "usuario": new_u}, 201)
                except sqlite3.IntegrityError:
                    conn.close()
                    return self.send_json({"status": "error", "message": "El correo ya está registrado"}, 400)

            elif path == '/api/misiones/validar':
                user_id = body.get('user_id')
                lugar_id = body.get('lugar_id')
                user_lat = float(body.get('lat', 0.0))
                user_lon = float(body.get('lon', 0.0))
                respuesta_usuario = str(body.get('respuesta', '')).strip().lower()

                c.execute("SELECT * FROM usuarios WHERE id = ?", (user_id,))
                user = c.fetchone()
                c.execute("SELECT * FROM lugares WHERE id = ?", (lugar_id,))
                lugar = c.fetchone()

                if not user or not lugar:
                    conn.close()
                    return self.send_json({"status": "error", "message": "Datos no válidos"}, 404)

                c.execute("SELECT * FROM historial_visitas WHERE id_usuario = ? AND id_lugar = ?", (user_id, lugar_id))
                if c.fetchone():
                    conn.close()
                    return self.send_json({"status": "error", "message": "Ya has completado esta misión"}, 400)

                dist = haversine_distance(user_lat, user_lon, lugar['latitud'], lugar['longitud'])
                if dist > (lugar['radio_metros'] or 100.0):
                    conn.close()
                    return self.send_json({"status": "error", "message": f"Estás a {int(dist)}m. Debes estar a menos de {int(lugar['radio_metros'])}m."}, 400)

                if respuesta_usuario != lugar['respuesta_correcta'].strip().lower():
                    conn.close()
                    return self.send_json({"status": "error", "message": "Respuesta incorrecta. ¡Intenta de nuevo!"}, 400)

                bonus = 15 if user['viaja_en_grupo'] == 1 else 0
                puntos_ganados = lugar['puntos_otorgados'] + bonus
                nuevos_puntos = user['puntos_turista'] + puntos_ganados
                rango = "Maestro Andino" if nuevos_puntos >= 300 else ("Explorador" if nuevos_puntos >= 150 else "Novato")

                c.execute("UPDATE usuarios SET puntos_turista = ?, rango = ? WHERE id = ?", (nuevos_puntos, rango, user_id))
                c.execute("INSERT INTO historial_visitas (id_usuario, id_lugar, puntos_ganados) VALUES (?, ?, ?)", (user_id, lugar_id, puntos_ganados))
                conn.commit()
                conn.close()

                return self.send_json({
                    "status": "success",
                    "message": f"¡Correcto! Ganaste +{puntos_ganados} puntos.",
                    "puntos_ganados": puntos_ganados,
                    "puntos_totales": nuevos_puntos,
                    "rango": rango
                })

            elif path == '/api/canjes/solicitar':
                user_id = body.get('user_id')
                ben_id = body.get('beneficio_id')

                c.execute("SELECT * FROM usuarios WHERE id = ?", (user_id,))
                user = c.fetchone()
                c.execute("SELECT * FROM beneficios WHERE id = ?", (ben_id,))
                ben = c.fetchone()

                if not user or not ben:
                    conn.close()
                    return self.send_json({"status": "error", "message": "Datos inválidos"}, 404)

                if user['puntos_turista'] < ben['puntos_necesarios']:
                    conn.close()
                    return self.send_json({"status": "error", "message": f"Puntos insuficientes ({user['puntos_turista']}/{ben['puntos_necesarios']} pts)"}, 400)

                nuevos_puntos = user['puntos_turista'] - ben['puntos_necesarios']
                codigo = f"JUJUY-{ben['id']:02d}{os.urandom(2).hex().upper()}-{os.urandom(2).hex().upper()}"

                c.execute("UPDATE usuarios SET puntos_turista = ? WHERE id = ?", (nuevos_puntos, user_id))
                c.execute("INSERT INTO canjes (id_usuario, id_beneficio, codigo_unico, puntos_gastados, estado) VALUES (?, ?, ?, ?, 'PENDIENTE')", (user_id, ben['id'], codigo, ben['puntos_necesarios']))
                conn.commit()
                conn.close()

                return self.send_json({
                    "status": "success",
                    "codigo_unico": codigo,
                    "beneficio": ben['nombre'],
                    "puntos_gastados": ben['puntos_necesarios'],
                    "puntos_restantes": nuevos_puntos
                })

            elif path == '/api/canjes/validar-comercio':
                codigo = body.get('codigo', '').strip().upper()
                residente_id = body.get('residente_id')

                c.execute('''
                SELECT c.*, u.nombre as turista_nombre, b.nombre as beneficio_nombre, b.puntos_necesarios
                FROM canjes c
                JOIN usuarios u ON c.id_usuario = u.id
                JOIN beneficios b ON c.id_beneficio = b.id
                WHERE c.codigo_unico = ?
                ''', (codigo,))
                canje = c.fetchone()

                if not canje:
                    conn.close()
                    return self.send_json({"status": "error", "message": "Código de cupón inexistente"}, 404)

                if canje['estado'] == 'CONFIRMADO':
                    conn.close()
                    return self.send_json({"status": "error", "message": "Este cupón ya fue utilizado"}, 400)

                c.execute("UPDATE canjes SET estado = 'CONFIRMADO', id_comercio_residente = ?, fecha = CURRENT_TIMESTAMP WHERE id = ?", (residente_id, canje['id']))
                if residente_id:
                    c.execute("UPDATE usuarios SET puntos_comunidad = puntos_comunidad + 30 WHERE id = ?", (residente_id,))

                conn.commit()
                conn.close()

                return self.send_json({
                    "status": "success",
                    "message": f"¡Cupón validado! '{canje['beneficio_nombre']}' otorgado a {canje['turista_nombre']}.",
                    "turista": canje['turista_nombre'],
                    "beneficio": canje['beneficio_nombre']
                })

            elif path == '/api/comunidad/recomendar':
                residente_id = body.get('residente_id')
                lugar = body.get('lugar_nombre', '').strip()
                coment = body.get('comentario', '').strip()

                c.execute("UPDATE usuarios SET puntos_comunidad = puntos_comunidad + 50 WHERE id = ?", (residente_id,))
                c.execute("SELECT puntos_comunidad FROM usuarios WHERE id = ?", (residente_id,))
                pts = c.fetchone()['puntos_comunidad']
                rango = "Embajador Local" if pts >= 1000 else "Vecino Activo"
                c.execute("UPDATE usuarios SET rango = ? WHERE id = ?", (rango, residente_id))

                c.execute("INSERT INTO recomendaciones (id_residente, lugar_nombre, comentario, puntos_otorgados) VALUES (?, ?, ?, 50)", (residente_id, lugar, coment))
                conn.commit()
                conn.close()

                return self.send_json({
                    "status": "success",
                    "message": "¡Recomendación publicada! +50 pts de comunidad sumados.",
                    "puntos_comunidad": pts,
                    "rango": rango
                })

            # --- API ALIASES Y SOPORTE DE ENDPOINTS ---
            elif path == '/api/turista/visita/gps':
                user_id = body.get('usuario_id') or body.get('user_id')
                lugar_id = body.get('lugar_id')
                lat = float(body.get('latitud', 0.0) or body.get('lat', 0.0))
                lon = float(body.get('longitud', 0.0) or body.get('lon', 0.0))

                c.execute("SELECT * FROM usuarios WHERE id = ?", (user_id,))
                user = c.fetchone()
                c.execute("SELECT * FROM lugares WHERE id = ?", (lugar_id,))
                lugar = c.fetchone()

                if not user or not lugar:
                    conn.close()
                    return self.send_json({"status": "error", "message": "Datos de usuario o atracción inválidos"}, 404)

                c.execute("SELECT * FROM historial_visitas WHERE id_usuario = ? AND id_lugar = ?", (user_id, lugar_id))
                if c.fetchone():
                    conn.close()
                    return self.send_json({"status": "error", "message": "Ya validaste tu visita a esta atracción anteriormente."}, 400)

                # Validación real de distancia GPS
                dist = haversine_distance(lat, lon, lugar['latitud'], lugar['longitud'])
                radio = lugar['radio_metros'] or 100.0
                if dist > radio:
                    conn.close()
                    return self.send_json({
                        "status": "error", 
                        "message": f"Estás a {int(dist)} metros del lugar. Debes estar a menos de {int(radio)} metros para validar por GPS."
                    }, 400)

                puntos_ganados = lugar['puntos_otorgados'] or 50
                nuevos_puntos = (user['puntos_turista'] or 0) + puntos_ganados
                rango = "Maestro Andino" if nuevos_puntos >= 300 else ("Explorador" if nuevos_puntos >= 150 else "Novato")

                c.execute("UPDATE usuarios SET puntos_turista = ?, rango = ? WHERE id = ?", (nuevos_puntos, rango, user_id))
                c.execute("INSERT INTO historial_visitas (id_usuario, id_lugar, puntos_ganados) VALUES (?, ?, ?)", (user_id, lugar_id, puntos_ganados))
                conn.commit()
                conn.close()

                return self.send_json({
                    "status": "success",
                    "message": f"¡Visita validada con éxito! +{puntos_ganados} puntos.",
                    "puntos_ganados": puntos_ganados,
                    "puntos_totales": nuevos_puntos,
                    "rango": rango
                })

            elif path == '/api/turista/visita/trivia':
                user_id = body.get('usuario_id') or body.get('user_id')
                lugar_id = body.get('lugar_id')
                respuesta = str(body.get('respuesta', '')).strip().lower()

                c.execute("SELECT * FROM usuarios WHERE id = ?", (user_id,))
                user = c.fetchone()
                c.execute("SELECT * FROM lugares WHERE id = ?", (lugar_id,))
                lugar = c.fetchone()

                if not user or not lugar:
                    conn.close()
                    return self.send_json({"status": "error", "message": "Datos no válidos"}, 404)

                c.execute("SELECT * FROM historial_visitas WHERE id_usuario = ? AND id_lugar = ?", (user_id, lugar_id))
                if c.fetchone():
                    conn.close()
                    return self.send_json({"status": "error", "message": "Ya has completado esta misión"}, 400)

                if respuesta != lugar['respuesta_correcta'].strip().lower():
                    conn.close()
                    return self.send_json({"status": "error", "message": "Respuesta incorrecta. ¡Intenta de nuevo!"}, 400)

                puntos_ganados = lugar['puntos_otorgados'] or 50
                nuevos_puntos = (user['puntos_turista'] or 0) + puntos_ganados
                rango = "Maestro Andino" if nuevos_puntos >= 300 else ("Explorador" if nuevos_puntos >= 150 else "Novato")

                c.execute("UPDATE usuarios SET puntos_turista = ?, rango = ? WHERE id = ?", (nuevos_puntos, rango, user_id))
                c.execute("INSERT INTO historial_visitas (id_usuario, id_lugar, puntos_ganados) VALUES (?, ?, ?)", (user_id, lugar_id, puntos_ganados))
                conn.commit()
                conn.close()

                return self.send_json({
                    "status": "success",
                    "message": f"¡Trivia correcta! Ganaste +{puntos_ganados} puntos.",
                    "puntos_ganados": puntos_ganados,
                    "puntos_totales": nuevos_puntos,
                    "rango": rango
                })

            elif path == '/api/turista/canjear':
                user_id = body.get('usuario_id') or body.get('user_id')
                ben_id = body.get('beneficio_id')

                c.execute("SELECT * FROM usuarios WHERE id = ?", (user_id,))
                user = c.fetchone()
                c.execute("SELECT * FROM beneficios WHERE id = ?", (ben_id,))
                ben = c.fetchone()

                if not user or not ben:
                    conn.close()
                    return self.send_json({"status": "error", "message": "Datos inválidos"}, 404)

                if (user['puntos_turista'] or 0) < ben['puntos_necesarios']:
                    conn.close()
                    return self.send_json({"status": "error", "message": f"Puntos insuficientes ({user['puntos_turista']}/{ben['puntos_necesarios']} pts)"}, 400)

                nuevos_puntos = user['puntos_turista'] - ben['puntos_necesarios']
                codigo = f"JUJUY-{ben['id']:02d}{os.urandom(2).hex().upper()}"

                c.execute("UPDATE usuarios SET puntos_turista = ? WHERE id = ?", (nuevos_puntos, user_id))
                c.execute("INSERT INTO canjes (id_usuario, id_beneficio, codigo_unico, puntos_gastados, estado) VALUES (?, ?, ?, ?, 'PENDIENTE')", (user_id, ben['id'], codigo, ben['puntos_necesarios']))
                conn.commit()
                conn.close()

                return self.send_json({
                    "status": "success",
                    "codigo_cupon": codigo,
                    "codigo_unico": codigo,
                    "beneficio": ben['nombre'],
                    "puntos_gastados": ben['puntos_necesarios'],
                    "puntos_restantes": nuevos_puntos
                })

            elif path == '/api/residente/canjear_cupon':
                codigo = body.get('codigo_cupon', '').strip().upper()
                c.execute('''
                SELECT c.*, u.nombre as turista_nombre, b.nombre as beneficio_nombre
                FROM canjes c
                JOIN usuarios u ON c.id_usuario = u.id
                JOIN beneficios b ON c.id_beneficio = b.id
                WHERE c.codigo_unico = ?
                ''', (codigo,))
                canje = c.fetchone()

                if not canje:
                    conn.close()
                    return self.send_json({"status": "error", "message": "Código de cupón inexistente"}, 404)

                if canje['estado'] == 'CONFIRMADO':
                    conn.close()
                    return self.send_json({"status": "error", "message": "Este cupón ya fue utilizado anteriormente"}, 400)

                c.execute("UPDATE canjes SET estado = 'CONFIRMADO', fecha = CURRENT_TIMESTAMP WHERE id = ?", (canje['id'],))
                conn.commit()
                conn.close()

                return self.send_json({
                    "status": "success",
                    "message": f"¡Cupón validado! '{canje['beneficio_nombre']}' otorgado a {canje['turista_nombre']}.",
                    "turista": canje['turista_nombre'],
                    "beneficio": canje['beneficio_nombre']
                })

            elif path == '/api/residente/recomendacion':
                user_id = body.get('usuario_id') or 2
                titulo = body.get('titulo', '').strip() or 'Recomendación'
                categoria = body.get('categoria', '').strip() or 'Paseo Local'
                desc = body.get('descripcion', '').strip()

                try:
                    c.execute("UPDATE usuarios SET puntos_comunidad = coalesce(puntos_comunidad, 0) + 50 WHERE id = ?", (user_id,))
                    c.execute('''
                    INSERT INTO recomendaciones (id_residente, lugar_nombre, comentario, puntos_otorgados) 
                    VALUES (?, ?, ?, 50)
                    ''', (user_id, f"{titulo} [{categoria}]", desc))
                    conn.commit()
                except Exception as ex:
                    print("Error guardando recomendación:", ex)

                conn.close()
                return self.send_json({
                    "status": "success",
                    "message": "¡Recomendación compartida con éxito! +50 pts de comunidad."
                })

            # Admin POST endpoints
            elif path == '/api/admin/lugares':
                c.execute('''
                INSERT INTO lugares (nombre, descripcion, direccion, latitud, longitud, radio_metros, categoria, pregunta_verificacion, opciones_json, respuesta_correcta, puntos_otorgados)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    body.get('nombre'),
                    body.get('descripcion'),
                    body.get('direccion') or 'San Salvador de Jujuy',
                    float(body.get('latitud', -24.1858)),
                    float(body.get('longitud', -65.2995)),
                    float(body.get('radio_metros', 100.0)),
                    body.get('categoria', 'Historia'),
                    body.get('pregunta_trivia') or body.get('pregunta_verificacion') or '¿Año?',
                    json.dumps(body.get('opciones') or [body.get('respuesta_trivia', '1593'), '1810', '1834']),
                    body.get('respuesta_trivia') or body.get('respuesta_correcta') or '1593',
                    int(body.get('puntos') or body.get('puntos_otorgados') or 50)
                ))
                conn.commit()
                conn.close()
                return self.send_json({"status": "success", "message": "Atracción guardada con éxito"})

            elif path == '/api/admin/lugares/eliminar':
                c.execute("DELETE FROM lugares WHERE id = ?", (body.get('id'),))
                conn.commit()
                conn.close()
                return self.send_json({"status": "success", "message": "Atracción eliminada"})

            elif path == '/api/admin/beneficios':
                c.execute('''
                INSERT INTO beneficios (nombre, tipo, descripcion, puntos_necesarios, comercio)
                VALUES (?, ?, ?, ?, ?)
                ''', (
                    body.get('nombre'),
                    body.get('tipo', 'Descuento'),
                    body.get('descripcion'),
                    int(body.get('puntos_necesarios', 100)),
                    body.get('comercio', 'Comercio Adherido')
                ))
                conn.commit()
                conn.close()
                return self.send_json({"status": "success", "message": "Beneficio guardado"})

            elif path == '/api/admin/beneficios/eliminar':
                c.execute("DELETE FROM beneficios WHERE id = ?", (body.get('id'),))
                conn.commit()
                conn.close()
                return self.send_json({"status": "success", "message": "Beneficio eliminado"})

            conn.close()
            return self.send_json({"status": "error", "message": "Endpoint no encontrado"}, 404)

        return super().do_POST()

class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

if __name__ == '__main__':
    init_db()
    import socket
    local_ip = "127.0.0.1"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        pass
    print(f"============================================================")
    print(f"  Jujuy Ciudad Pass - Servidor Web & API Concurrente")
    print(f"  > Local:   http://localhost:{PORT}")
    print(f"  > Red LAN: http://{local_ip}:{PORT}")
    print(f"============================================================")
    with ThreadedHTTPServer(("", PORT), JujuyServer) as httpd:
        httpd.serve_forever()
