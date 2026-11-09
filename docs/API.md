# Jujuy Ciudad Pass — Contrato de la API v1

Este documento es la fuente de verdad compartida entre el backend (`backend/`), el panel web
(`web/`), la app Android de turistas (`android/`) y el despliegue (`deploy/`).
Si algo no está acá, se decide de forma conservadora y se documenta en este mismo archivo.

## 0. Decisiones de producto

- **4 roles:** `turista`, `negocio`, `residente`, `admin`.
- **Turistas usan SOLO la app Android.** El login web rechaza turistas; la app rechaza a los otros roles.
- **Negocio, residente y admin usan SOLO el panel web.**
- **Misión = estar en el lugar + responder la trivia estando en el lugar.** La pregunta recién se revela
  cuando el servidor confirmó la ubicación. Nunca se envía la respuesta correcta a ningún cliente salvo al admin.
- **Sin QR en los lugares** (se pueden fotografiar y compartir). La presencia se valida por GPS con controles anti‑trampa.
- Los cupones sí pueden mostrarse como QR en la app: son personales y de un solo uso.
- **Servidor destino:** Linux (distro a definir), Intel Atom, 1 GB RAM. Un único proceso uvicorn (1 worker),
  SQLite en modo WAL, nginx delante con HTTPS (Let's Encrypt). Nada de Docker ni Node en el servidor.
- No se reutiliza la lógica del prototipo (`prototipo-original/`); solo la paleta de colores.

## 1. Convenciones generales

- Base: `/api/v1`. JSON UTF‑8. Fechas en ISO‑8601 UTC (`2026-11-07T15:04:05Z`).
- **Errores:** status HTTP adecuado + cuerpo
  `{"error": {"codigo": "CODIGO_EN_MAYUSCULAS", "mensaje": "Texto en español para mostrar", "datos": {...opcional}}}`.
  Errores de validación de FastAPI (422) también se convierten a este formato con `codigo = "DATOS_INVALIDOS"`.
- Códigos comunes: `NO_AUTENTICADO` (401), `SESION_EXPIRADA` (401), `PROHIBIDO` (403), `CUENTA_BLOQUEADA` (403),
  `ROL_NO_PERMITIDO_EN_CLIENTE` (403), `NO_ENCONTRADO` (404), `DATOS_INVALIDOS` (422), `DEMASIADOS_INTENTOS` (429),
  `ERROR_INTERNO` (500).
- **Autenticación:**
  - App Android: header `Authorization: Bearer <token>`.
  - Web: cookie `jcp_sesion` (HttpOnly, SameSite=Strict, Secure en prod). Toda petición **no GET** autenticada por cookie
    debe traer el header `X-JCP: 1`; si falta → 403 `PROHIBIDO` (protección CSRF).
  - Tokens: 32 bytes aleatorios (urlsafe). En la base se guarda solo su SHA‑256.
  - Duración: app 30 días; web 12 h deslizantes (se renueva con el uso).
- Contraseñas: `bcrypt`. Mínimo 8 caracteres.
- Paginación (listas de admin): `?pagina=1&por_pagina=50` → `{"items": [...], "total": N, "pagina": 1, "por_pagina": 50}`.
  Las listas de turista/negocio/residente devuelven arrays simples.
- Health check: `GET /api/v1/salud` → `{"ok": true, "version": "1.0.0"}` (sin auth).

## 2. Objetos

```jsonc
// Usuario
{"id": 1, "nombre": "Ana", "email": "ana@x.com", "rol": "turista",
 "puntos": 120,               // saldo canjeable (turista)
 "puntos_historicos": 270,    // total ganado, define el rango (turista)
 "puntos_comunidad": 0,       // residente
 "rango": "Explorador",
 "bloqueado": false, "creado_en": "...",
 "negocio": null}              // si rol=negocio: {"id":3,"nombre":"Café Central","direccion":"...","telefono":"...","descripcion":"..."}

// Lugar (vista turista)
{"id": 1, "nombre": "Cabildo de Jujuy", "descripcion": "...", "direccion": "...", "categoria": "Historia",
 "latitud": -24.18567, "longitud": -65.30012, "radio_m": 100, "puntos": 50, "visitado": false}

// Beneficio (vista turista)
{"id": 1, "titulo": "2x1 en café", "descripcion": "...", "puntos": 100, "dias_validez": 30,
 "stock_restante": null,  // null = ilimitado
 "negocio": {"id": 3, "nombre": "Café Central", "direccion": "..."}}

// Canje / cupón
{"id": 9, "codigo": "JCP-7K3M-Q9TX", "estado": "DISPONIBLE", // DISPONIBLE | USADO | VENCIDO | ANULADO
 "beneficio": {"id": 1, "titulo": "...", "negocio_nombre": "..."},
 "puntos": 100, "creado_en": "...", "vence_en": "...", "usado_en": null}
```

- Rangos turista según `puntos_historicos`: `< 150` Novato · `< 300` Explorador · `>= 300` Maestro Andino.
- Rangos residente según `puntos_comunidad`: `< 300` Vecino · `< 1000` Vecino Activo · `>= 1000` Embajador Local.
- Código de cupón: `JCP-` + 8 caracteres del alfabeto Crockford base32 sin ambiguos (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`),
  formateado `JCP-XXXX-XXXX`, generado con `secrets`. Al validar se normaliza (mayúsculas, sin espacios, `O→0`, `I/L→1`).

## 3. Endpoints

### 3.1 Auth — `/api/v1/auth`

| Método | Ruta | Quién | Cuerpo | Respuesta |
|---|---|---|---|---|
| POST | `/auth/registro` | público (app) | `{nombre, email, password, procedencia?, dispositivo_id}` | 201 `{token, usuario}` (rol siempre `turista`) |
| POST | `/auth/login` | público | `{email, password, cliente: "app"\|"web", dispositivo_id?}` | app: `{token, usuario}` · web: setea cookie y `{usuario}` |
| POST | `/auth/logout` | autenticado | — | `{ok: true}` |
| GET | `/auth/yo` | autenticado | — | `{usuario}` |
| POST | `/auth/cambiar-password` | autenticado | `{actual, nueva}` | `{ok: true}` (revoca las demás sesiones) |

Reglas: `cliente=app` solo turistas; `cliente=web` solo negocio/residente/admin → si no, 403 `ROL_NO_PERMITIDO_EN_CLIENTE`.
Errores: `EMAIL_EN_USO` (409), `CREDENCIALES_INVALIDAS` (401, mismo mensaje si el email no existe),
`CUENTA_BLOQUEADA`, `DEMASIADOS_INTENTOS` (5 fallos / 15 min por email+IP).
`dispositivo_id` (UUID que la app genera al instalarse) se registra; si un dispositivo ya tiene 3 cuentas turista
distintas, el registro falla con `DISPOSITIVO_CON_DEMASIADAS_CUENTAS` (403) y se crea una alerta.

### 3.2 Turista — app Android

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/lugares` | — | `[Lugar]` (solo activos con ≥1 pregunta activa) |
| POST | `/visitas/iniciar` | ver abajo | `{intento_id, pregunta, opciones: [str], expira_en_s}` |
| POST | `/visitas/responder` | `{intento_id, opcion_index, muestra}` | `{correcta: true, puntos_ganados, puntos, puntos_historicos, rango}` o `{correcta: false, intentos_restantes}` |
| GET | `/visitas/mias` | — | `[{lugar_id, lugar_nombre, puntos, fecha}]` |
| GET | `/beneficios` | — | `[Beneficio]` (aprobados, activos, con stock) |
| POST | `/canjes` | `{beneficio_id}` | 201 `Canje` + `{puntos_restantes}` |
| GET | `/canjes/mios` | — | `[Canje]` (los vencidos se marcan `VENCIDO` al leer) |
| GET | `/recomendaciones` | — | `[{id, titulo, categoria, descripcion, autor_nombre, fecha}]` (solo aprobadas) |

`/lugares`, `/beneficios` y `/recomendaciones` aceptan cualquier rol autenticado (el admin los usa para previsualizar).

**`POST /visitas/iniciar`**
```json
{"lugar_id": 1, "dispositivo_id": "uuid",
 "reloj_ms": 1762527845000,
 "muestras": [{"lat": -24.18567, "lon": -65.30012, "precision_m": 12.5, "tiempo_ms": 1762527835000, "mock": false}, ...]}
```
Validaciones del servidor (parámetros en config, valores por defecto):
1. Entre 3 y 10 muestras; `tiempo_ms` crecientes; separación total entre primera y última ≥ 5 s → si no `MUESTRAS_INVALIDAS`.
2. Desfase de reloj = `servidor_ahora - reloj_ms`. Cada muestra corregida debe tener ≤ 60 s de antigüedad → si no `MUESTRAS_INVALIDAS`.
3. Alguna muestra con `mock: true` → `UBICACION_FALSA` (403) + alerta.
4. Precisión: la mediana de `precision_m` debe ser ≤ 50 m → si no `PRECISION_INSUFICIENTE` (con `datos.precision_m`).
5. Todas las muestras a distancia (haversine) ≤ `radio_m` del lugar → si no `FUERA_DE_RANGO` (`datos: {distancia_m, radio_m}`).
6. Viaje imposible: velocidad entre la última visita/intento del usuario y esta > 200 km/h → `VIAJE_IMPOSIBLE` (403) + alerta.
7. Ya visitado → `YA_VISITADO` (409). Lugar inactivo → `NO_ENCONTRADO`.
8. Más de 2 respuestas incorrectas en este lugar en las últimas 24 h → `DEMASIADOS_INTENTOS` (429).
9. Todas las muestras con coordenadas exactamente idénticas → se permite pero se crea alerta `MUESTRAS_IDENTICAS`.
Si pasa: se elige al azar una pregunta activa del lugar, se barajan las opciones (el orden barajado se guarda en el intento),
se crea un intento con vencimiento de 120 s.

**`POST /visitas/responder`**: `muestra` = una muestra nueva con el mismo formato (+ `reloj_ms` opcional en el cuerpo).
El intento debe existir, ser del usuario, no estar vencido (`INTENTO_EXPIRADO` 410) ni usado. La muestra debe estar en
rango y no ser mock. Correcta → en **una transacción** (`BEGIN IMMEDIATE`): insertar visita (UNIQUE usuario+lugar),
sumar `puntos * multiplicador_temporada_activa` (redondeado) a `puntos` y `puntos_historicos`, registrar movimiento,
recalcular rango. Incorrecta → cierra el intento y devuelve `intentos_restantes`.

**`POST /canjes`**: en una transacción: beneficio aprobado+activo (`BENEFICIO_NO_DISPONIBLE` 409), stock
(`SIN_STOCK` 409), `UPDATE usuarios SET puntos = puntos - ? WHERE id = ? AND puntos >= ?` (si 0 filas →
`PUNTOS_INSUFICIENTES` 409 con `datos: {puntos, necesarios}`), crear cupón con `vence_en = ahora + dias_validez`.

### 3.3 Negocio — panel web — `/api/v1/negocio`

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/negocio/resumen` | — | `{beneficios_activos, cupones_usados_total, cupones_usados_mes, cupones_pendientes}` |
| GET | `/negocio/cupones/{codigo}` | — | `{codigo, estado, beneficio_titulo, turista_nombre, vence_en, usado_en}` |
| POST | `/negocio/cupones/{codigo}/usar` | — | `{ok: true, codigo, beneficio_titulo, turista_nombre, usado_en}` |
| GET | `/negocio/cupones?estado=` | — | `[Canje + turista_nombre]` de sus beneficios |
| GET | `/negocio/beneficios` | — | `[Beneficio + estado + activo]` propios |
| POST | `/negocio/beneficios` | `{titulo, descripcion, puntos, dias_validez, stock?}` | 201 (estado `PENDIENTE`) |
| PATCH | `/negocio/beneficios/{id}` | campos parciales + `activo` | Si cambia titulo/descripcion/puntos → vuelve a `PENDIENTE` |
| GET/PATCH | `/negocio/perfil` | `{nombre, direccion, telefono, descripcion}` | perfil del negocio |

Un negocio solo ve/usa cupones de **sus** beneficios; un cupón ajeno responde igual que uno inexistente
(`CUPON_NO_ENCONTRADO` 404). Usar: `CUPON_USADO` (409), `CUPON_VENCIDO` (409), `CUPON_ANULADO` (409); el cambio a
`USADO` es atómico (`UPDATE ... WHERE estado='DISPONIBLE'`). Límite: 20 consultas de código fallidas / 10 min por negocio → 429.
Estados de beneficio: `PENDIENTE` | `APROBADO` | `RECHAZADO`; además `activo` (bool, pausa).

### 3.4 Residente — panel web — `/api/v1/residente`

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| POST | `/residente/recomendaciones` | `{titulo, categoria, descripcion}` | 201 (estado `PENDIENTE`) |
| GET | `/residente/recomendaciones` | — | propias con `estado` (`PENDIENTE`/`APROBADA`/`RECHAZADA`) y `motivo_rechazo` |
| GET | `/residente/ranking` | — | top 10 residentes `{nombre, puntos_comunidad, rango}` + `mi_posicion` |

Al aprobarse una recomendación el residente suma +50 `puntos_comunidad`. Máximo 5 recomendaciones pendientes por residente.
Categorías: `Gastronomía`, `Historia`, `Naturaleza`, `Cultura`, `Paseo`, `Compras`, `Otro`.

### 3.5 Admin — panel web — `/api/v1/admin`

- `GET /admin/estadisticas` → `{usuarios: {total, turistas, negocios, residentes, admins}, visitas_total, visitas_7d,
  canjes_total, canjes_usados, lugares_mas_visitados: [..5], lugares_menos_visitados: [..5], alertas_abiertas,
  recomendaciones_pendientes, beneficios_pendientes}`
- **Lugares:** `GET /admin/lugares` (todos, incluye inactivos y `cantidad_preguntas`), `POST /admin/lugares`
  `{nombre, descripcion, direccion, categoria, latitud, longitud, radio_m (20–1000), puntos (1–1000), activo}`,
  `PATCH /admin/lugares/{id}`, `DELETE /admin/lugares/{id}` (borrado suave: `activo=false`, conserva historial).
  No se puede activar un lugar sin al menos una pregunta activa (`LUGAR_SIN_PREGUNTAS` 409).
- **Preguntas:** `GET /admin/lugares/{id}/preguntas`, `POST /admin/lugares/{id}/preguntas`
  `{texto, opciones: [2..6 strings], correcta_index}`, `PATCH /admin/preguntas/{id}`, `DELETE /admin/preguntas/{id}` (suave).
- **Beneficios:** `GET /admin/beneficios?estado=`, `POST /admin/beneficios` (con `negocio_id`, queda `APROBADO`),
  `PATCH /admin/beneficios/{id}` (incluye `estado` y `motivo_rechazo`), `DELETE` (suave).
- **Usuarios:** `GET /admin/usuarios?rol=&q=&pagina=`, `POST /admin/usuarios`
  `{nombre, email, password, rol, negocio?: {nombre, direccion, telefono, descripcion}}` (si `rol=negocio`, `negocio` obligatorio),
  `PATCH /admin/usuarios/{id}` `{nombre?, bloqueado?}` (bloquear revoca sesiones; un admin no puede bloquearse a sí mismo),
  `POST /admin/usuarios/{id}/reset-password` → `{password_temporal}`.
- **Recomendaciones:** `GET /admin/recomendaciones?estado=`, `POST /admin/recomendaciones/{id}/aprobar`,
  `POST /admin/recomendaciones/{id}/rechazar` `{motivo}`.
- **Temporadas:** `GET/POST /admin/temporadas`, `PATCH /admin/temporadas/{id}` `{nombre, fecha_inicio, fecha_fin, multiplicador (0.5–5), activa}`.
  Solo una activa a la vez (activar una desactiva las otras). Se aplica si hoy está dentro del rango.
- **Canjes:** `GET /admin/canjes?estado=&pagina=`, `POST /admin/canjes/{id}/anular` `{devolver_puntos: bool}`.
- **Alertas anti‑trampa:** `GET /admin/alertas?resueltas=false`, `POST /admin/alertas/{id}/resolver`.
  Tipos: `UBICACION_FALSA`, `VIAJE_IMPOSIBLE`, `MUESTRAS_IDENTICAS`, `DISPOSITIVO_CON_DEMASIADAS_CUENTAS`, `FUERZA_BRUTA_CUPONES`.

## 4. Modelo de datos (SQLite, compatible con PostgreSQL)

`usuarios`, `negocios` (1:1 con usuario rol negocio), `sesiones` (token_hash, usuario_id, cliente, vence_en, ultimo_uso),
`dispositivos` (dispositivo_id, usuario_id), `lugares`, `preguntas` (opciones JSON, correcta_index, activa),
`intentos_visita` (usuario, lugar, pregunta, orden_opciones JSON, vence_en, estado, lat/lon/fecha para viaje imposible),
`visitas` (UNIQUE usuario_id+lugar_id), `beneficios` (negocio_id, estado, activo, stock, dias_validez),
`canjes` (codigo UNIQUE), `movimientos_puntos` (usuario, delta, tipo, referencia — auditoría de todo cambio de saldo),
`recomendaciones`, `temporadas`, `alertas`, `intentos_login` (para rate limit persistente opcional).
Todas con `creado_en`. Borrados siempre suaves para lugares/preguntas/beneficios.

## 5. Ejecución y configuración

- Dev: `cd backend && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt && .venv/Scripts/python -m app.cli seed-demo && .venv/Scripts/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
- Prod: `uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 --proxy-headers --forwarded-allow-ips 127.0.0.1`
- Primer admin: `python -m app.cli crear-admin --email ... --nombre ...` (pide la contraseña por consola). **No hay
  usuarios demo en producción.** `seed-demo` se niega a correr si `JCP_ENTORNO=prod`.
- Variables (`/etc/jujuy-pass/jujuy-pass.env` en prod, `backend/.env` en dev):
  `JCP_ENTORNO` (`dev`|`prod`), `JCP_DB_PATH`, `JCP_COOKIE_SECURE` (1 en prod), `JCP_SERVIR_WEB` (1 en dev: FastAPI sirve
  `../web` en `/`; en prod lo sirve nginx), `JCP_LOG_LEVEL`, y los parámetros anti‑trampa (`JCP_PRECISION_MAX_M`, etc.).
- En prod nginx sirve `web/` en `/`, la APK en `/descargas/jujuy-pass.apk`, y hace proxy de `/api/` a `127.0.0.1:8000`.
- Rate limiting en memoria (válido porque hay un solo worker).

## 6. Aclaraciones del backend (agregadas al implementar; no cambian los contratos de arriba)

**Generales**
- Las rutas de la sección 3.2 cuelgan directamente de la base: `/api/v1/lugares`, `/api/v1/visitas/iniciar`, etc.
- Todos los errores (incluidos 404 de ruta inexistente → `NO_ENCONTRADO` y 405 → `METODO_NO_PERMITIDO`) usan el formato
  `{"error": {...}}`. Los 429 incluyen `datos.reintentar_en_s` y el header `Retry-After`.
- Un error 500 nunca incluye trazas: `{"error": {"codigo": "ERROR_INTERNO", "mensaje": "..."}}`.
- Fechas-hora: `YYYY-MM-DDTHH:MM:SSZ` (UTC, sin milisegundos). Fechas de temporada: `YYYY-MM-DD`.
  "Hoy" y "mes actual" se calculan en hora de Argentina (UTC−3, sin horario de verano).
- Campos de texto: se recortan espacios; `nombre` 1–80, `titulo` 1–120, `descripcion` ≤ 2000, `direccion` ≤ 200,
  `telefono` ≤ 40. Email: se normaliza a minúsculas. Contraseña: 8–128 caracteres.
- `rango` es `null` para los roles `negocio` y `admin`. `puntos`, `puntos_historicos` y `puntos_comunidad` siempre se
  envían (0 si no aplica).
- Documentación interactiva en `/api/v1/docs` y `/api/v1/openapi.json`, solo con `JCP_ENTORNO=dev`.

**Sesiones**
- Un token Bearer solo es válido si la sesión se creó con `cliente=app`; la cookie solo si se creó con `cliente=web`.
  Si vienen ambos, manda el header `Authorization`.
- Token inexistente o revocado → 401 `NO_AUTENTICADO`; token vencido → 401 `SESION_EXPIRADA`;
  usuario bloqueado con sesión → 403 `CUENTA_BLOQUEADA` (además, bloquear borra sus sesiones).
- La cookie `jcp_sesion` es `Path=/`, `Max-Age` 12 h, y se re-emite al renovarse la sesión (como mucho una vez por minuto).
- `POST /auth/login` con `cliente=web` **no** requiere `X-JCP` (todavía no hay sesión), pero el panel puede enviarlo siempre.
- Orden en login: límite de intentos (429) → credenciales (401) → cuenta bloqueada (403 `CUENTA_BLOQUEADA`) →
  rol vs cliente (403 `ROL_NO_PERMITIDO_EN_CLIENTE`). Un login correcto reinicia el contador de fallos.
- `POST /auth/logout` borra la sesión actual (y la cookie si era web).
- `POST /auth/cambiar-password` con `actual` incorrecta → 400 `PASSWORD_ACTUAL_INCORRECTA`. Mantiene la sesión actual.
- `POST /auth/registro`: `dispositivo_id` 8–64 caracteres `[A-Za-z0-9_-]`; `procedencia` opcional ≤ 80.
  Límite extra: 10 registros por hora por IP → 429 `DEMASIADOS_INTENTOS`.
- `POST /admin/usuarios/{id}/reset-password` revoca todas las sesiones de ese usuario.

**Rutas por rol**: `/visitas/*` y `/canjes*` solo `turista`; `/negocio/*` solo `negocio`; `/residente/*` solo `residente`;
`/admin/*` solo `admin`. Otro rol → 403 `PROHIBIDO`. Para roles no turista, `Lugar.visitado` es siempre `false`.

**Visitas (anti‑trampa)**
- Códigos y status: `MUESTRAS_INVALIDAS` 422, `PRECISION_INSUFICIENTE` 422, `FUERA_DE_RANGO` 403, `UBICACION_FALSA` 403,
  `VIAJE_IMPOSIBLE` 403, `YA_VISITADO` 409, `DEMASIADOS_INTENTOS` 429, `NO_ENCONTRADO` 404 (lugar inexistente, inactivo
  o sin preguntas activas).
- Orden de validación en `iniciar`: formato de muestras (1) → reloj (2) → mock (3) → lugar (7) → ya visitado (7) →
  demasiados intentos (8) → precisión (4) → rango (5) → viaje imposible (6) → muestras idénticas (9, solo alerta).
- Reloj: además, una muestra no puede estar más de 5 s en el futuro respecto de `reloj_ms`. El desfase calculado se
  guarda en el intento y se usa para la muestra de `responder` cuando no viene `reloj_ms`.
- Viaje imposible: se compara la última muestra con la posición y hora guardadas en el último intento del usuario
  (de cualquier lugar). Se descuentan 100 m de tolerancia GPS a la distancia.
  `datos: {velocidad_kmh, distancia_m, segundos}`.
- Si ya hay un intento `PENDIENTE` y vigente para ese usuario+lugar, `iniciar` devuelve **el mismo** intento (misma
  pregunta y orden, `expira_en_s` restante). Así no se puede "pedir otra pregunta".
- Para el límite de 24 h cuentan las respuestas incorrectas **y** los intentos que vencieron sin responder.
  Se bloquea al llegar a 3 (es decir, "más de 2"). `intentos_restantes = 3 − fallos_24h` (mínimo 0).
- `responder`: intento inexistente o de otro usuario → 404 `NO_ENCONTRADO`; ya respondido → 409 `INTENTO_USADO`;
  vencido → 410 `INTENTO_EXPIRADO`; `opcion_index` fuera de rango → 422 `DATOS_INVALIDOS`.
  La muestra también debe cumplir precisión (`PRECISION_INSUFICIENTE`) y antigüedad ≤ 60 s (`MUESTRAS_INVALIDAS`).
  Fuera de rango no cierra el intento (puede volver a responder dentro de los 120 s); mock lo anula y crea alerta.
- Puntos: `round(puntos_lugar × multiplicador)` redondeando .5 hacia arriba, mínimo 1. Sin temporada vigente, ×1.
  La respuesta correcta incluye además `multiplicador`.
- `GET /visitas/mias`: más recientes primero.

**Canjes y cupones**
- `POST /canjes`: beneficio inexistente → 404 `NO_ENCONTRADO`; existente pero no aprobado, inactivo, eliminado o de
  un negocio bloqueado → 409 `BENEFICIO_NO_DISPONIBLE`.
- `GET /beneficios` excluye beneficios eliminados, sin stock o de negocios bloqueados. Orden: puntos ascendente.
- Un cupón ya emitido sigue siendo válido aunque después se pause o elimine el beneficio.
- Anular (`/admin/canjes/{id}/anular`): solo desde `DISPONIBLE` o `VENCIDO` (si no → 409 `CANJE_NO_ANULABLE`).
  Devuelve 1 unidad de stock si el beneficio tiene stock limitado. `devolver_puntos=true` suma los puntos a `puntos`
  (no a `puntos_historicos`) y registra el movimiento. Responde el canje actualizado (formato admin).
- Código con formato inválido en `/negocio/cupones/{codigo}` → 404 `CUPON_NO_ENCONTRADO` (cuenta como fallo).
  Al llegar a 20 fallos en 10 min se responde 429 a **todas** las consultas de código de ese negocio hasta que pase la
  ventana, y se crea una alerta `FUERZA_BRUTA_CUPONES` (una por ventana).
- `GET /negocio/cupones/{codigo}` de un cupón vencido devuelve 200 con `estado: "VENCIDO"`; `usar` → 409 `CUPON_VENCIDO`.
- `GET /negocio/cupones?estado=` → objetos `Canje` + `turista_nombre`, más recientes primero; `estado` opcional.
- `GET /negocio/resumen`: `beneficios_activos` = aprobados, activos y no eliminados; `cupones_pendientes` = `DISPONIBLE`
  no vencidos; `cupones_usados_mes` = mes calendario actual (hora Argentina).
- Beneficio en vistas de negocio y admin: campos de `Beneficio` + `estado`, `activo`, `motivo_rechazo`, `eliminado`,
  `creado_en` (admin además `negocio_id`). En los cuerpos, `stock` = unidades restantes (`null` = ilimitado).
  Rangos: `puntos` 1–100000, `dias_validez` 1–365, `stock` 0–100000 o `null`.
- `POST /negocio/beneficios` y `PATCH` responden el beneficio en formato negocio. Cambiar `stock`, `dias_validez` o
  `activo` no lo devuelve a `PENDIENTE`. Un beneficio eliminado por el admin → 404 para el negocio.

**Residentes**
- Recomendación (vista propia): `{id, titulo, categoria, descripcion, estado, motivo_rechazo, creado_en}`.
  Con 5 pendientes, crear otra → 409 `LIMITE_PENDIENTES`. Categoría fuera de la lista → 422 `DATOS_INVALIDOS`.
- `GET /residente/ranking` → `{"ranking": [{posicion, nombre, puntos_comunidad, rango}], "mi_posicion": N}`
  (empates comparten posición, tipo 1‑2‑2‑4; excluye bloqueados).
- `GET /recomendaciones`: `fecha` = fecha de aprobación; más recientes primero.

**Admin**
- **Todas** las listas `GET /admin/...` devuelven el sobre paginado `{items, total, pagina, por_pagina}`
  (`por_pagina` máx. 200). Orden: más recientes primero (lugares y preguntas por `id` ascendente).
- `POST /admin/lugares`: `activo` por defecto `false` (un lugar nuevo no tiene preguntas; con `activo=true` da
  `LUGAR_SIN_PREGUNTAS`). Desactivar la última pregunta de un lugar activo está permitido: el lugar deja de aparecer
  en `/lugares`. Lugar (admin) = Lugar sin `visitado` + `activo`, `cantidad_preguntas` (activas), `creado_en`.
- Pregunta (admin): `{id, lugar_id, texto, opciones, correcta_index, activa, creado_en}`. Opciones 2–6, no vacías,
  sin repetir; texto 1–300.
- `POST /admin/beneficios`: `{negocio_id, titulo, descripcion, puntos, dias_validez, stock?, activo?}`; `negocio_id` es
  el id de la tabla negocios (`usuario.negocio.id`); inexistente → 404 `NO_ENCONTRADO`.
- `POST /admin/usuarios` responde 201 `{usuario}` y `PATCH /admin/usuarios/{id}` responde `{usuario}`. `PATCH` a sí mismo con `bloqueado=true` → 409
  `AUTOBLOQUEO_NO_PERMITIDO`. `GET /admin/usuarios?q=` busca en nombre y email; los items son objetos `Usuario`.
- Recomendaciones: aprobar/rechazar solo desde `PENDIENTE` (si no → 409 `ESTADO_INVALIDO`). `motivo` 1–300 obligatorio.
  Items admin: `{id, titulo, categoria, descripcion, estado, motivo_rechazo, autor_id, autor_nombre, creado_en}`.
- Temporada: `{id, nombre, fecha_inicio, fecha_fin, multiplicador, activa, vigente, creado_en}` (`vigente` = activa y
  hoy dentro del rango, inclusive). `fecha_fin < fecha_inicio` → 422 `DATOS_INVALIDOS`. `activa` por defecto `false`.
- Canje (admin): objeto `Canje` + `turista_id`, `turista_nombre`, `negocio_nombre`.
- Alerta: `{id, tipo, usuario_id, usuario_nombre, datos, resuelta, creado_en, resuelta_en}`. `?resueltas=` omitido → todas.
- `POST`/`PATCH`/`DELETE` de lugares, preguntas, beneficios y temporadas responden el objeto resultante (formato admin);
  aprobar/rechazar recomendación y resolver alerta responden el item actualizado.
- `GET /admin/estadisticas`: `lugares_mas_visitados` / `lugares_menos_visitados` = `[{id, nombre, visitas}]` sobre
  lugares activos.

**CLI y configuración**
- `python -m app.cli crear-admin --email X --nombre Y` pide la contraseña dos veces (o la lee de stdin si no es una terminal).
- `python -m app.cli seed-demo` crea datos de ejemplo e imprime contraseñas aleatorias; se niega si ya existen los
  usuarios demo o si `JCP_ENTORNO=prod`.
- Parámetros anti‑trampa por entorno (valores por defecto): `JCP_MUESTRAS_MIN=3`, `JCP_MUESTRAS_MAX=10`,
  `JCP_MUESTRAS_SEPARACION_MIN_S=5`, `JCP_MUESTRA_ANTIGUEDAD_MAX_S=60`, `JCP_PRECISION_MAX_M=50`,
  `JCP_VELOCIDAD_MAX_KMH=200`, `JCP_VIAJE_TOLERANCIA_M=100`, `JCP_INTENTO_DURACION_S=120`, `JCP_FALLOS_MAX_24H=3`,
  `JCP_DISPOSITIVO_MAX_CUENTAS=3`.
  Otros: `JCP_BCRYPT_ROUNDS=12`, `JCP_LOGIN_MAX_FALLOS=5`, `JCP_LOGIN_VENTANA_S=900`, `JCP_CUPON_MAX_FALLOS=20`,
  `JCP_CUPON_VENTANA_S=600`, `JCP_REGISTRO_MAX_HORA=10`, `JCP_SESION_APP_DIAS=30`, `JCP_SESION_WEB_HORAS=12`.
  `JCP_MUESTRA_FUTURO_MAX_S=5`, `JCP_WEB_DIR` (por defecto `../web`).
  `JCP_DB_PATH` por defecto `backend/data/jujuy-pass.db` (el directorio se crea solo).
- Las tablas se crean al arrancar si no existen (no hay migraciones todavía).
