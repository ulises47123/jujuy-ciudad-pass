#!/usr/bin/env bash
# =============================================================================
#  Jujuy Ciudad Pass — funciones compartidas de los scripts de despliegue
#
#  No se ejecuta solo: lo cargan install.sh, update.sh, backup.sh, restore.sh,
#  estado.sh, cli.sh y subir-apk.sh. install.sh lo copia a
#  /usr/local/lib/jujuy-pass/comun.sh para los comandos jujuy-pass-*.
# =============================================================================
# shellcheck shell=bash disable=SC2034

# ---- Rutas y nombres fijos -------------------------------------------------
JCP_SERVICIO="jujuy-pass"
JCP_USUARIO="jujuypass"
JCP_BASE="/opt/jujuy-pass"                 # código: releases/ + enlace "actual"
JCP_RELEASES="$JCP_BASE/releases"
JCP_ACTUAL="$JCP_BASE/actual"
JCP_REPO_DIR="$JCP_BASE/repo"              # clon de git (si el origen es git)
JCP_ANTERIOR_TXT="$JCP_BASE/.anterior"     # release anterior (para volver atrás)
JCP_DATOS="/var/lib/jujuy-pass"            # base de datos SQLite
JCP_ETC="/etc/jujuy-pass"
JCP_ENV_FILE="$JCP_ETC/jujuy-pass.env"     # variables de la aplicación (640)
JCP_CONF_DESPLIEGUE="$JCP_ETC/despliegue.conf"  # dominio, email y origen del código
JCP_BACKUPS="/var/backups/jujuy-pass"
JCP_LOGS="/var/log/jujuy-pass"
JCP_DESCARGAS="/var/www/jujuy-pass/descargas"   # APK pública (/descargas/)
JCP_ACME_WEBROOT="/var/www/letsencrypt"
JCP_LIB_INSTALADA="/usr/local/lib/jujuy-pass"
JCP_CACHE_PIP="/var/cache/jujuy-pass/pip"
JCP_LOCK="/run/jujuy-pass.lock"
JCP_PUERTO=8000
JCP_URL_SALUD="http://127.0.0.1:${JCP_PUERTO}/api/v1/salud"
JCP_RELEASES_EXTRA=1                       # releases viejas que se guardan además de actual y anterior
JCP_BACKUP_DIAS="${JCP_BACKUP_DIAS:-14}"

# ---- Mensajes --------------------------------------------------------------
if [ -t 1 ]; then
    _C_B=$'\e[1m'; _C_V=$'\e[32m'; _C_A=$'\e[33m'; _C_R=$'\e[31m'; _C_0=$'\e[0m'
else
    _C_B=""; _C_V=""; _C_A=""; _C_R=""; _C_0=""
fi
info()  { printf '%s==>%s %s\n' "$_C_B" "$_C_0" "$*"; }
ok()    { printf '%s[ OK ]%s %s\n' "$_C_V" "$_C_0" "$*"; }
aviso() { printf '%s[AVISO]%s %s\n' "$_C_A" "$_C_0" "$*" >&2; }
morir() { printf '%s[ERROR]%s %s\n' "$_C_R" "$_C_0" "$*" >&2; exit 1; }

requerir_root() {
    [ "$(id -u)" -eq 0 ] || morir "Este comando necesita permisos de administrador. Probá de nuevo anteponiendo: sudo"
}

# Evita que dos scripts (instalar/actualizar/restaurar) corran a la vez.
tomar_lock() {
    local archivo=${1:-$JCP_LOCK}
    exec 9>"$archivo"
    if ! flock -n 9; then
        morir "Ya hay otra operación de Jujuy Pass en curso (lock $archivo). Esperá a que termine."
    fi
}

# ---- Detección del sistema -------------------------------------------------
# Deja en JCP_DISTRO "debian" o "alpine", y en JCP_INIT "systemd" u "openrc".
detectar_sistema() {
    [ -r /etc/os-release ] || morir "No encuentro /etc/os-release: no puedo saber qué Linux es."
    local id like
    # shellcheck disable=SC1091
    id=$(. /etc/os-release && printf '%s' "${ID:-}")
    # shellcheck disable=SC1091
    like=$(. /etc/os-release && printf '%s' "${ID_LIKE:-}")
    # shellcheck disable=SC1091
    JCP_DISTRO_NOMBRE=$(. /etc/os-release && printf '%s' "${PRETTY_NAME:-$id}")
    case " $id $like " in
        *" alpine "*) JCP_DISTRO=alpine ;;
        *" debian "*|*" ubuntu "*) JCP_DISTRO=debian ;;
        *) morir "Distribución no soportada: $JCP_DISTRO_NOMBRE. Usá Debian, Ubuntu o Alpine." ;;
    esac
    if [ -d /run/systemd/system ]; then
        JCP_INIT=systemd
    elif command -v openrc-run >/dev/null 2>&1 || [ -x /sbin/openrc-run ]; then
        JCP_INIT=openrc
    else
        morir "No encuentro systemd ni OpenRC (¿es un contenedor?). Este despliegue necesita uno de los dos."
    fi
}

# ---- Servicios (systemd u OpenRC) ------------------------------------------
# Uso: svc ACCION NOMBRE   (ACCION: habilitar iniciar detener reiniciar recargar activo)
svc() {
    local accion=$1 nombre=$2
    if [ "$JCP_INIT" = systemd ]; then
        case $accion in
            habilitar) systemctl enable "$nombre" >/dev/null 2>&1 || systemctl enable "$nombre" ;;
            iniciar)   systemctl start "$nombre" ;;
            detener)   systemctl stop "$nombre" ;;
            reiniciar) systemctl restart "$nombre" ;;
            recargar)  systemctl reload-or-restart "$nombre" ;;
            activo)    systemctl is-active --quiet "$nombre" ;;
            *) morir "svc: acción desconocida $accion" ;;
        esac
    else
        case $accion in
            habilitar) rc-update add "$nombre" default >/dev/null 2>&1 || true ;;
            iniciar)   rc-service "$nombre" start ;;
            detener)   rc-service "$nombre" stop ;;
            reiniciar) rc-service "$nombre" restart ;;
            recargar)
                if rc-service "$nombre" status >/dev/null 2>&1; then
                    rc-service "$nombre" reload
                else
                    rc-service "$nombre" start
                fi ;;
            activo)    rc-service "$nombre" status >/dev/null 2>&1 ;;
            *) morir "svc: acción desconocida $accion" ;;
        esac
    fi
}

# Ejecuta un comando como el usuario de sistema jujuypass (conserva el entorno).
como_jujuypass() {
    if command -v runuser >/dev/null 2>&1; then
        runuser -u "$JCP_USUARIO" -- "$@"
    elif command -v su-exec >/dev/null 2>&1; then
        HOME="$JCP_DATOS" su-exec "$JCP_USUARIO" "$@"
    elif command -v setpriv >/dev/null 2>&1; then
        HOME="$JCP_DATOS" setpriv --reuid="$JCP_USUARIO" --regid="$JCP_USUARIO" --init-groups -- "$@"
    else
        morir "No encuentro runuser, su-exec ni setpriv para cambiar de usuario."
    fi
}

# Carga /etc/jujuy-pass/jujuy-pass.env en el entorno actual (exportando todo).
cargar_env_app() {
    [ -r "$JCP_ENV_FILE" ] || morir "No existe $JCP_ENV_FILE. ¿Corriste install.sh?"
    set -a
    # shellcheck disable=SC1090
    . "$JCP_ENV_FILE"
    set +a
}

# Ruta del archivo SQLite según el .env (sin ensuciar el entorno actual).
jcp_db_path() {
    (
        if [ -r "$JCP_ENV_FILE" ]; then
            set -a
            # shellcheck disable=SC1090
            . "$JCP_ENV_FILE"
            set +a
        fi
        printf '%s' "${JCP_DB_PATH:-$JCP_DATOS/jujuy-pass.db}"
    )
}

# Datos guardados por install.sh (dominio, email, origen del código).
cargar_conf_despliegue() {
    if [ -r "$JCP_CONF_DESPLIEGUE" ]; then
        # shellcheck disable=SC1090
        . "$JCP_CONF_DESPLIEGUE"
    fi
    return 0
}

guardar_conf_despliegue() {
    umask 077
    {
        echo "# Generado por install.sh / update.sh de Jujuy Ciudad Pass. Se puede editar."
        printf 'DOMINIO=%q\n' "${DOMINIO:-}"
        printf 'EMAIL=%q\n' "${EMAIL:-}"
        printf 'ORIGEN_TIPO=%q\n' "${ORIGEN_TIPO:-}"
        printf 'REPO_URL=%q\n' "${REPO_URL:-}"
        printf 'RAMA=%q\n' "${RAMA:-main}"
        printf 'ORIGEN_DIR=%q\n' "${ORIGEN_DIR:-}"
        echo "# Días de backups que se conservan en $JCP_BACKUPS"
        printf 'JCP_BACKUP_DIAS=%q\n' "${JCP_BACKUP_DIAS:-14}"
    } > "$JCP_CONF_DESPLIEGUE.nuevo"
    mv -f "$JCP_CONF_DESPLIEGUE.nuevo" "$JCP_CONF_DESPLIEGUE"
    umask 022
}

# ---- Salud -----------------------------------------------------------------
# salud_ok [SEGUNDOS]: espera hasta que GET /api/v1/salud responda {"ok": true}.
salud_ok() {
    local max=${1:-30} i=0 resp
    while [ "$i" -lt "$max" ]; do
        if resp=$(curl -fsS --max-time 3 "$JCP_URL_SALUD" 2>/dev/null) \
           && printf '%s' "$resp" | grep -Eq '"ok"[[:space:]]*:[[:space:]]*true'; then
            return 0
        fi
        sleep 1
        i=$((i + 1))
    done
    return 1
}

ultimas_lineas_log() {
    local n=${1:-25}
    if [ -f "$JCP_LOGS/app.log" ]; then
        echo "---- últimas $n líneas de $JCP_LOGS/app.log ----" >&2
        tail -n "$n" "$JCP_LOGS/app.log" >&2 || true
        echo "-----------------------------------------------" >&2
    fi
}

# ---- Copia de archivos de texto (sin CRLF y de forma atómica) -------------
# Reemplazar con mv (inodo nuevo) evita romper un script que se está ejecutando.
instalar_texto() {
    local src=$1 dst=$2 modo=$3 tmp
    [ -f "$src" ] || morir "Falta el archivo $src"
    mkdir -p "$(dirname "$dst")"
    tmp="$dst.nuevo.$$"
    tr -d '\r' < "$src" > "$tmp"
    chmod "$modo" "$tmp"
    mv -f "$tmp" "$dst"
}

# Instala los comandos jujuy-pass-* en /usr/local/sbin desde una carpeta deploy/.
instalar_ayudantes() {
    local src=$1 par
    instalar_texto "$src/comun.sh" "$JCP_LIB_INSTALADA/comun.sh" 644
    for par in update:update.sh backup:backup.sh restore:restore.sh estado:estado.sh \
               subir-apk:subir-apk.sh cli:cli.sh; do
        instalar_texto "$src/${par#*:}" "/usr/local/sbin/jujuy-pass-${par%%:*}" 755
    done
}

# ---- Dependencias de compilación (para paquetes pip sin "wheel") ----------
instalar_dependencias_compilacion() {
    info "Instalando herramientas de compilación (gcc, Rust, cabeceras de Python)..."
    aviso "Compilar en un Atom con 1 GB puede tardar 10-30 minutos. Es normal."
    if [ "$JCP_DISTRO" = debian ]; then
        DEBIAN_FRONTEND=noninteractive apt-get install -y -q -o DPkg::Lock::Timeout=300 \
            build-essential python3-dev libffi-dev libssl-dev pkg-config cargo rustc
    else
        apk add --no-cache build-base python3-dev libffi-dev openssl-dev pkgconf cargo rust
    fi
}

# ---- Releases del código ---------------------------------------------------
# preparar_release: copia el código (git o carpeta local) a releases/<fecha>,
# crea su venv e instala requirements. Deja la ruta en JCP_NUEVA_RELEASE.
# Variables usadas: ORIGEN_TIPO (git|local), REPO_URL, RAMA, ORIGEN_DIR.
# Si algo falla, el EXIT trap de quien llama borra la release a medio hacer.
preparar_release() {
    local ts dir version="" backend py pip
    ts=$(date +%Y%m%d-%H%M%S)
    dir="$JCP_RELEASES/$ts"
    [ -e "$dir" ] && dir="$dir-$$"
    mkdir -p "$dir"
    JCP_NUEVA_RELEASE=$dir
    JCP_RELEASE_EN_CURSO=$dir

    case "${ORIGEN_TIPO:-}" in
        git)
            [ -n "${REPO_URL:-}" ] || morir "Falta la URL del repositorio git (--repo)."
            command -v git >/dev/null 2>&1 || morir "git no está instalado."
            info "Descargando código de $REPO_URL (rama ${RAMA:-main})..."
            if [ -d "$JCP_REPO_DIR/.git" ]; then
                git -C "$JCP_REPO_DIR" remote set-url origin "$REPO_URL"
                git -C "$JCP_REPO_DIR" fetch --depth 1 origin "${RAMA:-main}"
                git -C "$JCP_REPO_DIR" checkout -q -f FETCH_HEAD
            else
                rm -rf "$JCP_REPO_DIR"
                git clone -q --depth 1 --branch "${RAMA:-main}" "$REPO_URL" "$JCP_REPO_DIR"
            fi
            git -C "$JCP_REPO_DIR" archive --format=tar HEAD | tar -x -C "$dir"
            version="git $(git -C "$JCP_REPO_DIR" rev-parse --short HEAD)"
            ;;
        local)
            [ -n "${ORIGEN_DIR:-}" ] && [ -d "$ORIGEN_DIR/backend" ] \
                || morir "La carpeta de origen '${ORIGEN_DIR:-}' no tiene backend/. Indicá la carpeta del proyecto con --origen."
            info "Copiando código desde $ORIGEN_DIR..."
            rsync -a --delete \
                --exclude '.git/' --exclude '.venv/' --exclude 'venv/' --exclude '__pycache__/' \
                --exclude '*.pyc' --exclude '.pytest_cache/' --exclude 'node_modules/' \
                --exclude 'android/' --exclude 'prototipo-original/' \
                --exclude '*.db' --exclude '*.db-wal' --exclude '*.db-shm' --exclude '*.sqlite*' \
                --exclude 'backend/.env' --exclude 'backend/data/' --exclude '*.apk' \
                "$ORIGEN_DIR"/ "$dir"/
            if [ -d "$ORIGEN_DIR/.git" ] && command -v git >/dev/null 2>&1; then
                version="git $(git -c safe.directory="$ORIGEN_DIR" -C "$ORIGEN_DIR" rev-parse --short HEAD 2>/dev/null || echo '?')"
            else
                version="copia local"
            fi
            ;;
        *) morir "Origen del código desconocido: '${ORIGEN_TIPO:-}' (debe ser git o local)." ;;
    esac

    backend="$dir/backend"
    [ -f "$backend/requirements.txt" ] || morir "Falta backend/requirements.txt en el código."
    [ -f "$backend/app/main.py" ] || morir "Falta backend/app/main.py en el código."
    [ -f "$dir/web/index.html" ] || aviso "No hay web/index.html: el panel web va a responder 404."
    printf 'release=%s\nfecha=%s\nversion=%s\n' "$(basename "$dir")" "$(date '+%Y-%m-%d %H:%M:%S')" "$version" \
        > "$dir/VERSION_DESPLIEGUE"

    # Código de root y solo lectura para el resto (el servicio no puede modificarlo).
    chown -R root:root "$dir"
    chmod -R u=rwX,go=rX "$dir"

    info "Creando entorno virtual de Python e instalando dependencias..."
    if [ "${JCP_VENV_SISTEMA:-0}" = 1 ]; then
        python3 -m venv --system-site-packages "$backend/.venv"
    else
        python3 -m venv "$backend/.venv"
    fi
    py="$backend/.venv/bin/python"
    pip="$backend/.venv/bin/pip"
    [ -x "$pip" ] || morir "El venv se creó sin pip. En Debian/Ubuntu instalá python3-venv; en Alpine, py3-pip."
    mkdir -p "$JCP_CACHE_PIP"
    export PIP_CACHE_DIR="$JCP_CACHE_PIP" PIP_DISABLE_PIP_VERSION_CHECK=1
    "$pip" install -q --upgrade pip wheel
    # --prefer-binary: si la última versión no tiene wheel para esta máquina,
    # usa una anterior que sí tenga antes de ponerse a compilar.
    if ! "$pip" install --prefer-binary -r "$backend/requirements.txt"; then
        aviso "Falló la instalación de dependencias. Probablemente algún paquete (p. ej. bcrypt) no trae wheel para esta máquina y hay que compilarlo."
        instalar_dependencias_compilacion
        "$pip" install --prefer-binary -r "$backend/requirements.txt" \
            || morir "No se pudieron instalar las dependencias de Python. Ver 'Problemas frecuentes' en docs/DESPLIEGUE.md."
    fi
    [ -x "$backend/.venv/bin/uvicorn" ] || morir "requirements.txt no instala uvicorn."
    # El servicio corre con el sistema de archivos en solo lectura: precompilamos.
    "$py" -m compileall -q "$backend/app" >/dev/null 2>&1 || true
    chmod -R u=rwX,go=rX "$backend/.venv"
    ok "Release preparada: $dir ($version)"
}

# Apunta /opt/jujuy-pass/actual a la release indicada y recuerda la anterior.
activar_release() {
    local nueva=$1 previa
    previa=$(readlink -f "$JCP_ACTUAL" 2>/dev/null || true)
    if [ -n "$previa" ] && [ "$previa" != "$nueva" ]; then
        printf '%s\n' "$previa" > "$JCP_ANTERIOR_TXT"
    fi
    ln -sfn "$nueva" "$JCP_ACTUAL"
}

# Borra releases viejas: conserva la actual, la anterior y JCP_RELEASES_EXTRA más.
limpiar_releases() {
    local actual anterior extra=0 i r
    local lista=("$JCP_RELEASES"/*)
    actual=$(readlink -f "$JCP_ACTUAL" 2>/dev/null || true)
    anterior=$(cat "$JCP_ANTERIOR_TXT" 2>/dev/null || true)
    for (( i=${#lista[@]}-1; i>=0; i-- )); do
        r=${lista[$i]}
        [ -d "$r" ] || continue
        if [ "$r" = "$actual" ] || [ "$r" = "$anterior" ]; then
            continue
        fi
        if [ "$extra" -lt "$JCP_RELEASES_EXTRA" ]; then
            extra=$((extra + 1))
            continue
        fi
        rm -rf "$r"
    done
}

# ---- Backups ---------------------------------------------------------------
# hacer_backup [MOTIVO]: copia consistente de SQLite (".backup"), verificada y
# comprimida en /var/backups/jujuy-pass. Deja la ruta en JCP_ULTIMO_BACKUP.
hacer_backup() {
    local motivo=${1:-} db ts destino tmpdir tmp chk necesario libre
    JCP_ULTIMO_BACKUP=""
    db=$(jcp_db_path)
    if [ ! -f "$db" ]; then
        aviso "No existe la base de datos ($db): no hay nada que respaldar todavía."
        return 0
    fi
    command -v sqlite3 >/dev/null 2>&1 || morir "Falta el programa sqlite3."
    mkdir -p "$JCP_BACKUPS"
    chmod 700 "$JCP_BACKUPS"

    necesario=$(( $(du -k "$db" | awk '{print $1}') * 2 + 10240 ))
    libre=$(df -Pk "$(dirname "$db")" | awk 'NR==2 {print $4}')
    [ "$libre" -gt "$necesario" ] || morir "No hay espacio suficiente en disco para el backup (libres: ${libre} KB)."

    ts=$(date +%Y%m%d-%H%M%S)
    destino="$JCP_BACKUPS/jujuy-pass-$ts${motivo:+-$motivo}.db.gz"

    # La copia la hace el usuario jujuypass: si root abriera la base en modo WAL
    # podría dejar archivos -wal/-shm de root que el servicio después no puede abrir.
    tmpdir="$(dirname "$db")/.backup-tmp"
    rm -rf "$tmpdir"
    mkdir -p "$tmpdir"
    chown "$JCP_USUARIO:$JCP_USUARIO" "$tmpdir"
    chmod 700 "$tmpdir"
    tmp="$tmpdir/copia.db"

    if ! como_jujuypass sqlite3 -bail -cmd ".timeout 15000" "$db" ".backup '$tmp'"; then
        rm -rf "$tmpdir"
        morir "sqlite3 .backup falló."
    fi
    # La copia queda como un único archivo (sin WAL) y se verifica.
    como_jujuypass sqlite3 -bail "$tmp" "PRAGMA journal_mode=DELETE;" >/dev/null
    chk=$(como_jujuypass sqlite3 "$tmp" "PRAGMA quick_check;" 2>&1 || true)
    if [ "$chk" != "ok" ]; then
        rm -rf "$tmpdir"
        morir "La copia no pasó el control de integridad: $chk"
    fi
    gzip -c "$tmp" > "$destino.parcial"
    chmod 600 "$destino.parcial"
    mv -f "$destino.parcial" "$destino"
    rm -rf "$tmpdir"
    JCP_ULTIMO_BACKUP=$destino
}

# Backup más reciente (o vacío si no hay).
ultimo_backup() {
    local f ultimo=""
    for f in "$JCP_BACKUPS"/jujuy-pass-*.db.gz; do
        [ -f "$f" ] && ultimo=$f
    done
    printf '%s' "$ultimo"
}
