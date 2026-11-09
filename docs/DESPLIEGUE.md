# Jujuy Ciudad Pass — Guía de despliegue en Linux

Esta guía explica cómo poner en marcha Jujuy Ciudad Pass en un servidor Linux recién contratado,
paso a paso y sin necesidad de ser experto. Todo lo pesado lo hace el script `deploy/install.sh`.

> **Convención:** los bloques de código son comandos para escribir en la terminal del servidor
> (salvo que diga "en tu PC"). Las partes `ASÍ_EN_MAYÚSCULAS` se reemplazan por tus datos.
> Si entrás como `root` (o en Alpine, que no trae `sudo`), escribí los comandos sin `sudo` adelante.

---

## 1. Qué se instala y dónde

```
Internet ──HTTPS──► nginx (puertos 80/443)
                      ├── /             → panel web (archivos de web/)
                      ├── /descargas/   → APK de turistas
                      └── /api/         → uvicorn + FastAPI en 127.0.0.1:8000 (solo local)
                                              └── SQLite en /var/lib/jujuy-pass/
```

| Qué | Dónde |
|---|---|
| Código (una carpeta por versión) | `/opt/jujuy-pass/releases/AAAAMMDD-HHMMSS/` |
| Versión en uso (enlace) | `/opt/jujuy-pass/actual` |
| Base de datos | `/var/lib/jujuy-pass/jujuy-pass.db` |
| Configuración de la app | `/etc/jujuy-pass/jujuy-pass.env` (permisos 640) |
| Dominio, email y origen del código | `/etc/jujuy-pass/despliegue.conf` |
| Backups | `/var/backups/jujuy-pass/` |
| Logs de la app y de los backups | `/var/log/jujuy-pass/` |
| Logs de nginx | `/var/log/nginx/jujuy-pass.*.log` |
| APK publicada | `/var/www/jujuy-pass/descargas/jujuy-pass.apk` |
| Configuración de nginx | `/etc/nginx/conf.d/jujuy-pass.conf` (Alpine: `/etc/nginx/http.d/`) |
| Servicio | `jujuy-pass` (systemd en Debian/Ubuntu, OpenRC en Alpine) |

La aplicación corre con un usuario de sistema propio (`jujuypass`) que **no puede** modificar el código;
solo puede escribir en la carpeta de la base de datos y en la de logs.

Comandos que quedan instalados (todos con `sudo`):

| Comando | Para qué |
|---|---|
| `jujuy-pass-estado` | Resumen: servicio, salud, memoria, disco, certificado, último backup |
| `jujuy-pass-cli ...` | La CLI del backend (`crear-admin`, etc.) con la configuración de producción |
| `jujuy-pass-subir-apk ARCHIVO.apk` | Publicar una APK nueva |
| `jujuy-pass-update` | Traer código nuevo (con vuelta atrás automática si falla) |
| `jujuy-pass-backup` | Backup manual (además del diario automático) |
| `jujuy-pass-restore` | Restaurar un backup |

---

## 2. Requisitos

### El servidor
- **Sistema:** Debian 12 o Ubuntu 22.04/24.04 LTS (recomendado), o Alpine 3.19 o más nuevo.
  Elegí la imagen de **64 bits** ("amd64" / "x86_64") si el proveedor la ofrece (ver sección 12).
- **RAM:** 1 GB alcanza. El instalador crea 1 GB de swap si no hay.
- **Disco:** 10 GB o más recomendado (el sistema, 1 GB de swap, 3 versiones del código y 14 días de backups).
- Acceso por **SSH** como `root` o como un usuario con `sudo`.

### El dominio (antes de instalar)
Necesitás un dominio o subdominio (por ejemplo `pass.ejemplo.com.ar`) con un **registro DNS tipo A**
que apunte a la **IP pública del servidor**. Se configura en el panel de quien te vende el dominio
(NIC.ar, Cloudflare, el proveedor del hosting, etc.).

- Si también hay un registro **AAAA** (IPv6), tiene que ser la IPv6 correcta del servidor; si no estás
  seguro, borralo. Un AAAA equivocado hace fallar a Let's Encrypt.
- Si usás Cloudflare, dejá la nube en **gris** ("DNS only") al menos durante la instalación.
- Para comprobar desde tu PC (PowerShell): `nslookup pass.ejemplo.com.ar` tiene que mostrar la IP del servidor.
  Los cambios de DNS pueden tardar desde minutos hasta unas horas.

### Puertos
En el **firewall del proveedor** (si tiene uno en su panel) tienen que estar abiertos:

| Puerto | Para qué |
|---|---|
| 22/TCP | SSH (tu acceso de administración) |
| 80/TCP | Let's Encrypt valida el dominio por acá; después solo redirige a HTTPS |
| 443/TCP | El sitio, la API y la descarga de la APK (HTTPS) |

El puerto 8000 **no** se abre: uvicorn solo escucha dentro del servidor. Si el servidor tiene `ufw`, el
instalador lo configura solo (abre 22 —y el puerto SSH real si es otro—, 80 y 443).

### Un email
Lo pide Let's Encrypt para avisar si un certificado está por vencer sin renovarse.

---

## 3. Por qué HTTPS es obligatorio (no es opcional)

1. **GPS.** Los navegadores solo permiten usar la ubicación (`navigator.geolocation`) en sitios seguros
   (HTTPS). Sin HTTPS, cualquier función del panel que use la ubicación queda bloqueada.
2. **Sesiones del panel web.** La cookie de sesión `jcp_sesion` se marca `Secure` en producción
   (`JCP_COOKIE_SECURE=1`): el navegador **solo la envía por HTTPS**. Por HTTP el login "funciona" pero
   la siguiente página te vuelve a pedir que entres.
3. **Contraseñas, tokens y cupones** viajan por la red: sin cifrado cualquiera en el mismo Wi‑Fi los puede leer.
4. **La app Android** (desde Android 9) bloquea por defecto las conexiones HTTP sin cifrar.

Por eso el instalador no deja el sitio funcionando por HTTP: el puerto 80 solo sirve para que
Let's Encrypt valide el dominio y para redirigir a `https://`. El certificado es gratuito y se renueva solo.

---

## 4. Instalación paso a paso (servidor recién contratado)

### 4.1. Entrar al servidor
Desde tu PC con Windows abrí **PowerShell** y escribí:

```powershell
ssh root@IP_DEL_SERVIDOR
```

La primera vez pregunta si confiás en el servidor: escribí `yes`. Después pide la contraseña que te dio
el proveedor (al escribirla no se ve nada; es normal).

Si te dieron un usuario que no es root, entrá con ese usuario y anteponé `sudo` a los comandos.

### 4.2. Actualizar el sistema (recomendado)

Debian/Ubuntu:
```bash
apt update && apt -y upgrade
```
Alpine:
```sh
apk update && apk upgrade && apk add bash
```
Si el sistema pide reiniciar (`reboot`), hacelo y volvé a entrar.

### 4.3. Subir el código al servidor
Elegí **una** de las dos opciones.

**Opción A — con git** (si el proyecto está en GitHub/GitLab). No hace falta subir nada a mano:
el instalador lo clona solo (ver 4.4, variante con `--repo`). Si el repositorio es privado, usá una URL
con token de solo lectura o configurá una "deploy key" SSH en el servidor.

**Opción B — copiando la carpeta desde tu PC.** En PowerShell, **en tu PC**, parado en la carpeta del proyecto:

```powershell
cd C:\ruta\a\jujuy-ciudad-pass
tar -czf jcp.tgz --exclude=.venv --exclude=__pycache__ --exclude=*.db backend web deploy docs
scp jcp.tgz root@IP_DEL_SERVIDOR:/root/
```

Y en el **servidor**:

```bash
mkdir -p /root/jujuy-ciudad-pass
tar -xzf /root/jcp.tgz -C /root/jujuy-ciudad-pass
ls /root/jujuy-ciudad-pass        # tiene que mostrar: backend  deploy  docs  web
```

### 4.4. Correr el instalador

Con la carpeta copiada (opción B):
```bash
bash /root/jujuy-ciudad-pass/deploy/install.sh --dominio pass.ejemplo.com.ar --email tu@email.com
```

Con git (opción A), primero bajá solo el instalador o cloná el repo en cualquier lado, y:
```bash
git clone https://github.com/USUARIO/jujuy-ciudad-pass.git /root/jujuy-ciudad-pass
bash /root/jujuy-ciudad-pass/deploy/install.sh --dominio pass.ejemplo.com.ar --email tu@email.com \
     --repo https://github.com/USUARIO/jujuy-ciudad-pass.git --rama main
```
(Con `--repo`, el código que se despliega y las actualizaciones futuras vienen siempre del repositorio.)

También se puede pasar todo por variables: `DOMINIO=... EMAIL=... bash deploy/install.sh`.

Opciones útiles:

| Opción | Cuándo usarla |
|---|---|
| `--staging` | Para ensayar: pide un certificado de *prueba* (el navegador lo marca inválido). Al volver a correr sin `--staging` se reemplaza por uno real. |
| `--sin-certificado` | El DNS todavía no apunta al servidor. Instala todo menos el certificado; después volvé a correr el instalador. |
| `--sin-firewall` | No tocar `ufw`. |
| `--origen CARPETA` | Copiar el código desde otra carpeta. |

**Qué hace el instalador**, en orden: detecta la distro (Debian/Ubuntu con systemd o Alpine con OpenRC) y
la arquitectura; crea 1 GB de swap si no hay; instala python3, venv, nginx, certbot, sqlite3, logrotate,
cron, rsync y curl; activa la sincronización de hora (el anti‑trampa compara relojes); crea el usuario
`jujuypass` y las carpetas; crea `/etc/jujuy-pass/jujuy-pass.env`; configura `ufw` si existe; copia el código
a una release nueva con su propio venv; instala y arranca el servicio; configura logrotate, el backup diario
y los comandos `jujuy-pass-*`; configura nginx, pide el certificado a Let's Encrypt y deja la renovación automática.

Tarda entre 5 y 15 minutos (más si tiene que compilar algo, ver sección 12). Al final muestra un resumen.

**Es idempotente:** si algo falla (por ejemplo el DNS no estaba listo), corregí el problema y volvé a
correr el mismo comando. La segunda vez ya no hace falta `--dominio` ni `--email` (quedan guardados).

### 4.5. Comprobar que anda

```bash
sudo jujuy-pass-estado
```
Todo tiene que decir **OK**. Después abrí `https://pass.ejemplo.com.ar/` en el navegador: tiene que verse
el panel con el candado de sitio seguro.

---

## 5. Crear el primer administrador

En producción **no hay usuarios de demostración**. Creá el admin con:

```bash
sudo jujuy-pass-cli crear-admin --email admin@ejemplo.com.ar --nombre "Nombre Apellido"
```

Pide la contraseña por la terminal (mínimo 8 caracteres; no se ve al escribirla). Después entrá al panel
web con ese email y contraseña. Desde el panel, el admin crea los usuarios de negocios y residentes.

> Usá siempre `jujuy-pass-cli` (y no `python -m app.cli` a mano): carga la configuración de producción y
> corre como el usuario `jujuypass`, así la base de datos sigue perteneciendo al servicio.

---

## 6. Publicar la APK de turistas

1. Copiá la APK al servidor (en tu PC, PowerShell):
   ```powershell
   scp C:\ruta\a\app-release.apk root@IP_DEL_SERVIDOR:/root/
   ```
2. Publicala (en el servidor):
   ```bash
   sudo jujuy-pass-subir-apk /root/app-release.apk
   ```

Queda disponible en `https://pass.ejemplo.com.ar/descargas/jujuy-pass.apk` con el tipo correcto
(`application/vnd.android.package-archive`), así Android la reconoce como instalable. Se guarda la versión
anterior como `jujuy-pass-anterior.apk` y el SHA‑256 en `jujuy-pass.apk.sha256`.

La APK de producción tiene que estar compilada apuntando a `https://pass.ejemplo.com.ar/api/v1`.

---

## 7. Actualizar a una versión nueva

1. **Si el código viene de git:** subí los cambios al repositorio y en el servidor corré
   ```bash
   sudo jujuy-pass-update
   ```
2. **Si copiás la carpeta:** volvé a subir el `.tgz` y descomprimilo **en la misma carpeta** que usaste al
   instalar (por ejemplo `/root/jujuy-ciudad-pass`), y después `sudo jujuy-pass-update`.

Qué hace `jujuy-pass-update`:
1. Backup de la base (`jujuy-pass-...-preupdate.db.gz`).
2. Copia el código nuevo a una carpeta nueva en `/opt/jujuy-pass/releases/` y le instala sus dependencias.
   Si esto falla, **la versión en uso no se toca**.
3. Cambia el enlace `/opt/jujuy-pass/actual`, reinicia el servicio y consulta `GET /api/v1/salud`.
4. Si la salud **falla**, vuelve sola a la versión anterior y te lo avisa.

Volver manualmente a la versión anterior (por ejemplo, si algo anda mal aunque la salud dé OK):
```bash
sudo jujuy-pass-update --anterior
```

Otras opciones: `--rama OTRA`, `--repo URL`, `--origen CARPETA`.

Si la versión nueva trae cambios en `deploy/` (nginx, servicio, logrotate), después de actualizar corré:
```bash
sudo bash /opt/jujuy-pass/actual/deploy/install.sh
```
(no vuelve a desplegar código: solo reaplica la configuración del sistema).

---

## 8. Backups y restauración

### Automáticos
Todos los días (Debian/Ubuntu a las 03:30; Alpine a las 02:00, hora del servidor) se hace una copia
**consistente** de la base con `sqlite3 .backup` (sirve con el servicio andando), se verifica con
`PRAGMA quick_check`, se comprime y se guarda en `/var/backups/jujuy-pass/`. Se conservan **14 días**.
El resultado queda en `/var/log/jujuy-pass/backup.log`.

### Manual
```bash
sudo jujuy-pass-backup             # hacer uno ahora
sudo jujuy-pass-backup --listar    # ver los que hay
```

### Sacar copias fuera del servidor (muy recomendado)
Si el servidor se rompe, los backups que están adentro se pierden con él. Cada tanto, desde tu PC:
```powershell
scp "root@IP_DEL_SERVIDOR:/var/backups/jujuy-pass/*.db.gz" C:\backups\jujuy-pass\
```

### Restaurar
```bash
sudo jujuy-pass-restore                   # lista los backups disponibles
sudo jujuy-pass-restore ultimo            # restaura el más reciente
sudo jujuy-pass-restore /var/backups/jujuy-pass/jujuy-pass-20261107-033000.db.gz
```
Antes de tocar nada verifica el backup y pide que escribas `RESTAURAR`. Luego guarda una copia de la base
actual (`...-antes-de-restaurar.db.gz`, por si te arrepentís), detiene el servicio, reemplaza la base,
arranca y chequea la salud. **Se pierde todo lo registrado después de la fecha del backup.**

Para restaurar un backup traído desde tu PC, primero subilo con `scp` a `/var/backups/jujuy-pass/`.

---

## 9. Ver logs

| Qué | Comando |
|---|---|
| App (en vivo; Ctrl+C para salir) | `sudo tail -f /var/log/jujuy-pass/app.log` |
| Últimos errores de la app | `sudo grep -iE 'error\|traceback' /var/log/jujuy-pass/app.log \| tail -n 30` |
| Peticiones al sitio | `sudo tail -f /var/log/nginx/jujuy-pass.access.log` |
| Errores de nginx | `sudo tail -n 50 /var/log/nginx/jujuy-pass.error.log` |
| Backups | `sudo tail -n 30 /var/log/jujuy-pass/backup.log` |
| Arranques/caídas del servicio (Debian/Ubuntu) | `sudo journalctl -u jujuy-pass -n 50` |
| Renovaciones del certificado | `sudo tail -n 50 /var/log/letsencrypt/letsencrypt.log` |

Los logs de la app rotan todos los días (se guardan 14, comprimidos).

### Comandos de servicio

| Acción | Debian/Ubuntu | Alpine |
|---|---|---|
| Estado | `sudo systemctl status jujuy-pass` | `sudo rc-service jujuy-pass status` |
| Reiniciar la app | `sudo systemctl restart jujuy-pass` | `sudo rc-service jujuy-pass restart` |
| Recargar nginx | `sudo systemctl reload nginx` | `sudo rc-service nginx reload` |
| Probar la config de nginx | `sudo nginx -t` | `sudo nginx -t` |
| Probar la renovación del certificado | `sudo certbot renew --dry-run` | `sudo certbot renew --dry-run` |

### Cambiar la configuración de la app
Editá `/etc/jujuy-pass/jujuy-pass.env` (por ejemplo con `sudo nano /etc/jujuy-pass/jujuy-pass.env`),
guardá y reiniciá el servicio. Formato `CLAVE=valor`, sin espacios ni comillas.
**No cambies** `JCP_ENTORNO=prod`, `JCP_COOKIE_SECURE=1` ni `JCP_SERVIR_WEB=0`.

---

## 10. Problemas frecuentes

**certbot falla ("Timeout during connect", "unauthorized", "NXDOMAIN").**
El dominio no apunta a este servidor o el puerto 80 está cerrado. Comprobá: `nslookup TU_DOMINIO`
(desde tu PC) muestra la IP del servidor; el firewall del proveedor tiene abiertos 80 y 443; no hay un
AAAA equivocado; Cloudflare en modo "DNS only". Luego volvé a correr `install.sh`. Si fallaste muchas veces
seguidas, Let's Encrypt bloquea un rato: ensayá con `--staging` hasta que funcione.

**El sitio muestra "502" o la app dice "El servicio no está disponible".**
La API no está corriendo. `sudo jujuy-pass-estado` y `sudo tail -n 50 /var/log/jujuy-pass/app.log`.
Causas típicas: un error en el código nuevo (volvé con `sudo jujuy-pass-update --anterior`), un valor
inválido en `jujuy-pass.env`, o la base sin permisos (ver más abajo).

**Hago login en el panel y me vuelve a pedir que entre.**
Estás entrando por `http://` o por la IP en vez de `https://TU_DOMINIO`. La cookie es `Secure` y solo
viaja por HTTPS. Usá siempre la dirección con el dominio.

**El panel no puede usar la ubicación (GPS).**
Requiere HTTPS (sección 3) y que aceptes el permiso del navegador. Si lo rechazaste, habilitalo desde el
candado de la barra de direcciones.

**Error 429 "Demasiadas solicitudes".**
nginx limita por IP: login/registro 10 por minuto (con margen de 10), consultas de cupones 30 por minuto,
y la API en general 10 por segundo. Si muchos turistas comparten la misma IP (Wi‑Fi de un hotel) y aparece
seguido, se puede subir `rate=` en las líneas `limit_req_zone` de `/etc/nginx/conf.d/jujuy-pass.conf`
(y luego `sudo nginx -t && sudo systemctl reload nginx`). El backend tiene además sus propios límites.

**"attempt to write a readonly database" o "unable to open database file".**
Alguien tocó la base como root. Arreglalo con:
```bash
sudo chown -R jujuypass:jujuypass /var/lib/jujuy-pass && sudo systemctl restart jujuy-pass
```
(Alpine: `rc-service jujuy-pass restart`). Para usar la CLI siempre `jujuy-pass-cli`; para mirar la base,
`sudo -u jujuypass sqlite3 /var/lib/jujuy-pass/jujuy-pass.db` (en Alpine: `su-exec jujuypass sqlite3 ...`).

**Falla la instalación de dependencias de Python (pip) — típico en 32 bits.**
Ver sección 12. El instalador ya reintenta instalando gcc y Rust.

**`$'\r': command not found` o `bad interpreter` al correr un script.**
El archivo se guardó con fin de línea de Windows (CRLF). Arreglalo con:
```bash
sed -i 's/\r$//' /root/jujuy-ciudad-pass/deploy/*.sh
```
(El repositorio incluye `deploy/.gitattributes` para que git siempre los deje en LF.)

**El servidor se queda sin memoria / la app se reinicia sola.**
El servicio tiene un tope de 300 MB (`MemoryMax`); si lo pasa, se reinicia solo. Mirá
`sudo jujuy-pass-estado` (memoria y swap) y `journalctl -u jujuy-pass | grep -i oom`. Verificá que haya swap
(`swapon --show`); algunos VPS tipo contenedor no permiten swap.

**El login tarda 1 segundo o más.**
Es bcrypt (protege las contraseñas) en un procesador Atom. Es normal. Si molesta mucho se puede bajar
`JCP_BCRYPT_ROUNDS` a 11 en el `.env` (solo afecta contraseñas nuevas; menos es menos seguro).

**Las visitas fallan por "MUESTRAS_INVALIDAS" a todos los turistas.**
La hora del servidor está mal. `timedatectl` (Debian/Ubuntu) tiene que decir
"System clock synchronized: yes"; en Alpine, `rc-service chronyd status`.

**Me quedé afuera por SSH después de instalar.**
Solo pasa si SSH usa un puerto raro que no se detectó. Entrá por la consola web del proveedor y corré
`ufw allow PUERTO/tcp`.

**El disco se llenó.**
`sudo jujuy-pass-estado` muestra el uso. Revisá `/var/backups/jujuy-pass` (se puede bajar la cantidad de
días de backups cambiando `JCP_BACKUP_DIAS=14` en `/etc/jujuy-pass/despliegue.conf`) y `/var/log`.

**El certificado está por vencer.**
`sudo certbot renew --dry-run` muestra el error. Casi siempre es el puerto 80 cerrado o el DNS cambiado.

---

## 11. Seguridad y mantenimiento recomendados

- **Actualizaciones de seguridad automáticas** (Debian/Ubuntu):
  `sudo apt install unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades`.
- **Entrar por SSH con clave** en lugar de contraseña, y luego desactivar el login con contraseña.
- **Sacar los backups fuera del servidor** periódicamente (sección 8).
- Revisar `sudo jujuy-pass-estado` una vez por semana.
- Probar una restauración cada tanto (en otro servidor o en una copia) para confirmar que los backups sirven.

Qué hace la configuración por vos: HTTPS con TLS 1.2/1.3 y HSTS; cabeceras de seguridad (CSP sin
recursos externos salvo los tiles de OpenStreetMap, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`);
límites de tamaño y de peticiones por IP; el servicio corre sin privilegios, con el sistema de archivos en
solo lectura salvo datos y logs (systemd), y nginx no publica archivos ocultos (`.git`, `.env`).

---

## 12. Servidor de 32 bits (Atom i686) y paquetes que se compilan

Muchos Atom viejos (N270, N450, D525…) son de 32 bits; otros (D2xxx, Z3xxx, C2xxx) son de 64.
El instalador lo detecta y avisa; si el procesador es de 64 bits pero el sistema instalado es de 32,
**reinstalá con una imagen de 64 bits**: todo será más rápido y simple.

**Por qué importa:** pip descarga paquetes ya compilados ("wheels"). Para 32 bits (i686), y en menor medida
para Alpine (musl), algunos no existen y hay que compilarlos en el servidor:

| Paquete | Riesgo en i686 | Qué necesita para compilar |
|---|---|---|
| `bcrypt` (4.x) | No publica wheels para i686 | Rust (`cargo`, `rustc`) + gcc |
| `pydantic-core` | Suele tener wheel i686, pero no siempre la última versión | Rust |
| `uvloop`, `httptools`, `watchfiles` (si se usa `uvicorn[standard]`) | Puede faltar | gcc / Rust |

El instalador usa `pip install --prefer-binary` (elige una versión con wheel si existe) y, si aun así falla,
instala las herramientas y reintenta:
- Debian/Ubuntu: `build-essential python3-dev libffi-dev libssl-dev pkg-config cargo rustc`
- Alpine: `build-base python3-dev libffi-dev openssl-dev pkgconf cargo rust`

En 32 bits las instala desde el principio. Compilar en un Atom con 1 GB puede tardar 10–30 minutos;
por eso conviene que exista la swap (el instalador la crea antes).

Si la compilación falla de todos modos:
1. **Usar el bcrypt de la distribución:** `JCP_VENV_SISTEMA=1 bash deploy/install.sh ...` crea el venv con
   acceso a los paquetes del sistema e instala `python3-bcrypt` (Debian/Ubuntu) o `py3-bcrypt` (Alpine).
   Funciona si `requirements.txt` no fija una versión de bcrypt distinta de la del sistema.
2. **Rust demasiado viejo** (el de Debian puede no alcanzar para el bcrypt más nuevo): instalar uno actual con
   `curl https://sh.rustup.rs -sSf | sh -s -- -y --profile minimal`, luego `source ~/.cargo/env` y volver a correr.
3. Fijar en `requirements.txt` versiones que tengan wheel para la plataforma (coordinarlo con backend).

---

## 13. Referencia: archivos de `deploy/`

| Archivo | Qué es |
|---|---|
| `install.sh` | Instalador idempotente (Debian/Ubuntu + systemd, Alpine + OpenRC) |
| `comun.sh` | Funciones compartidas por todos los scripts |
| `update.sh` → `jujuy-pass-update` | Actualizar con vuelta atrás automática |
| `backup.sh` → `jujuy-pass-backup` | Backup consistente, comprimido, 14 días |
| `restore.sh` → `jujuy-pass-restore` | Restauración con confirmación |
| `estado.sh` → `jujuy-pass-estado` | Estado del servidor |
| `cli.sh` → `jujuy-pass-cli` | CLI del backend con la configuración de producción |
| `subir-apk.sh` → `jujuy-pass-subir-apk` | Publicar la APK |
| `jujuy-pass.service` | Servicio systemd (usuario `jujuypass`, `MemoryMax=300M`, endurecido) |
| `openrc/jujuy-pass`, `openrc/jujuy-pass.confd` | Servicio equivalente para Alpine (OpenRC) |
| `nginx/jujuy-pass.conf` | Plantilla de nginx (HTTPS, estáticos, APK, proxy de la API, límites, cabeceras) |
| `logrotate/jujuy-pass` | Rotación de los logs de la app |
| `.gitattributes` | Fuerza fin de línea LF en esta carpeta |

### Supuestos sobre el backend (a confirmar por quien integre)
- `backend/requirements.txt` incluye `uvicorn` (instala el ejecutable `.venv/bin/uvicorn`) y el
  punto de entrada es `app.main:app`.
- La app crea sus tablas sola al arrancar (no hay paso de migraciones aparte). Si en el futuro se agregan
  migraciones, hay que sumarlas a `update.sh` antes del reinicio.
- `JCP_DB_PATH` es una ruta de archivo dentro de `/var/lib/jujuy-pass` (el servicio solo puede escribir ahí).
- La app escribe sus logs a la salida estándar (van a `/var/log/jujuy-pass/app.log`).
- `python -m app.cli crear-admin --email ... --nombre ...` pide la contraseña por la terminal.
- El panel web es un sitio de varias páginas `.html` (no una SPA con rutas del lado del cliente): nginx
  responde 404 a rutas que no son archivos. Si fuera SPA, cambiar `try_files` a `$uri $uri/ /index.html`.
- La CSP permite estilos en línea (`style-src 'unsafe-inline'`) pero **no** scripts en línea: todo el JS
  del panel tiene que estar en archivos `.js` (nada de `onclick="..."` ni `<script>` con código adentro).
