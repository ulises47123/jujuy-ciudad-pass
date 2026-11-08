#!/usr/bin/env bash
# =============================================================================
#  Jujuy Ciudad Pass — instalación en el servidor (Debian/Ubuntu o Alpine)
#
#  Uso (como root o con sudo, desde la carpeta del proyecto copiada al servidor):
#    sudo bash deploy/install.sh --dominio pass.ejemplo.com.ar --email yo@ejemplo.com
#  o con git:
#    sudo bash deploy/install.sh --dominio ... --email ... --repo https://github.com/x/y.git --rama main
#  o con variables:
#    sudo DOMINIO=pass.ejemplo.com.ar EMAIL=yo@ejemplo.com bash deploy/install.sh
#
#  Es idempotente: se puede volver a correr las veces que haga falta (por ejemplo
#  para aplicar cambios de esta carpeta deploy/). La segunda vez no hace falta
#  pasar dominio ni email: se guardan en /etc/jujuy-pass/despliegue.conf.
#  El código solo se despliega la primera vez; después se usa jujuy-pass-update.
#
#  Opciones:
#    --dominio D        Dominio público (registro DNS A apuntando a este servidor)
#    --email E          Email para Let's Encrypt (avisos de vencimiento)
#    --repo URL         Traer el código con git clone desde URL
#    --rama R           Rama de git (por defecto: main)
#    --origen DIR       Copiar el código desde la carpeta DIR (por defecto: la
#                       carpeta del proyecto que contiene este script)
#    --staging          Pedir un certificado de PRUEBA a Let's Encrypt (no válido
#                       en navegadores; sirve para ensayar sin gastar límites)
#    --sin-certificado  No pedir certificado todavía (p. ej. el DNS no propagó)
#    --sin-firewall     No tocar ufw
#    -h, --ayuda        Esta ayuda
#
#  Variable opcional: JCP_VENV_SISTEMA=1 crea el venv con --system-site-packages
#  (útil en 32 bits para usar el bcrypt empaquetado por la distro).
# =============================================================================

# --- Si nos llamaron con "sh install.sh" (Alpine no trae bash), relanzar con bash.
if [ -z "${BASH_VERSION:-}" ]; then
    if ! command -v bash >/dev/null 2>&1 && command -v apk >/dev/null 2>&1; then
        echo "==> Instalando bash (lo necesita este script)..."
        apk add --no-cache bash || exit 1
    fi
    exec bash "$0" "$@"
fi

set -euo pipefail
umask 022
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

DEPLOY_DIR=$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)
PROYECTO_DIR=$(dirname "$DEPLOY_DIR")
# shellcheck source=comun.sh
. "$DEPLOY_DIR/comun.sh"

uso() { sed -n '2,32p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

# ---- Argumentos --------------------------------------------------------------
ARG_DOMINIO="${JCP_DOMINIO:-${DOMINIO:-}}"
ARG_EMAIL="${JCP_EMAIL:-${EMAIL:-}}"
ARG_REPO=""
ARG_RAMA=""
ARG_ORIGEN=""
STAGING=0
SIN_CERT=0
SIN_FIREWALL=0
JCP_ES_32BITS=0
POSICIONALES=()

while [ $# -gt 0 ]; do
    case $1 in
        --dominio)         ARG_DOMINIO=${2:?Falta el valor de --dominio}; shift 2 ;;
        --dominio=*)       ARG_DOMINIO=${1#*=}; shift ;;
        --email)           ARG_EMAIL=${2:?Falta el valor de --email}; shift 2 ;;
        --email=*)         ARG_EMAIL=${1#*=}; shift ;;
        --repo)            ARG_REPO=${2:?Falta el valor de --repo}; shift 2 ;;
        --repo=*)          ARG_REPO=${1#*=}; shift ;;
        --rama)            ARG_RAMA=${2:?Falta el valor de --rama}; shift 2 ;;
        --rama=*)          ARG_RAMA=${1#*=}; shift ;;
        --origen)          ARG_ORIGEN=${2:?Falta el valor de --origen}; shift 2 ;;
        --origen=*)        ARG_ORIGEN=${1#*=}; shift ;;
        --staging)         STAGING=1; shift ;;
        --sin-certificado) SIN_CERT=1; shift ;;
        --sin-firewall)    SIN_FIREWALL=1; shift ;;
        -h|--ayuda|--help) uso; exit 0 ;;
        -*)                morir "Opción desconocida: $1 (ver --ayuda)" ;;
        *)                 POSICIONALES+=("$1"); shift ;;
    esac
done
# También se acepta: install.sh DOMINIO EMAIL
[ -z "$ARG_DOMINIO" ] && [ ${#POSICIONALES[@]} -ge 1 ] && ARG_DOMINIO=${POSICIONALES[0]}
[ -z "$ARG_EMAIL" ] && [ ${#POSICIONALES[@]} -ge 2 ] && ARG_EMAIL=${POSICIONALES[1]}

# ---- Configuración final (argumentos > despliegue.conf guardado > valores por defecto)
resolver_configuracion() {
    DOMINIO="" EMAIL="" ORIGEN_TIPO="" REPO_URL="" RAMA="" ORIGEN_DIR=""
    cargar_conf_despliegue
    [ -n "$ARG_DOMINIO" ] && DOMINIO=$ARG_DOMINIO
    [ -n "$ARG_EMAIL" ] && EMAIL=$ARG_EMAIL
    [ -n "$ARG_RAMA" ] && RAMA=$ARG_RAMA
    RAMA=${RAMA:-main}
    if [ -n "$ARG_REPO" ]; then
        ORIGEN_TIPO=git; REPO_URL=$ARG_REPO
    elif [ -n "$ARG_ORIGEN" ]; then
        ORIGEN_TIPO=local; ORIGEN_DIR=$(cd "$ARG_ORIGEN" && pwd)
    elif [ -z "$ORIGEN_TIPO" ]; then
        ORIGEN_TIPO=local; ORIGEN_DIR=$PROYECTO_DIR
    fi
    # Nunca recordar como origen una carpeta de releases.
    case "$ORIGEN_DIR" in "$JCP_BASE"/*) [ "$ORIGEN_TIPO" = local ] && ORIGEN_DIR="" ;; esac

    DOMINIO=$(printf '%s' "$DOMINIO" | tr '[:upper:]' '[:lower:]')
    [ -n "$DOMINIO" ] || morir "Falta el dominio. Ejemplo: --dominio pass.ejemplo.com.ar"
    printf '%s' "$DOMINIO" | grep -Eq '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$' \
        || morir "El dominio '$DOMINIO' no parece válido (no pongas http:// ni barras)."
    [ -n "$EMAIL" ] || morir "Falta el email para Let's Encrypt. Ejemplo: --email yo@ejemplo.com"
    printf '%s' "$EMAIL" | grep -Eq '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' \
        || morir "El email '$EMAIL' no parece válido."
}

# ---- Pasos -------------------------------------------------------------------
paso_arquitectura() {
    local arq mem_mb
    arq=$(uname -m)
    case "$arq" in
        x86_64|amd64) ok "Arquitectura $arq (64 bits)." ;;
        i?86)
            JCP_ES_32BITS=1
            aviso "Sistema de 32 bits ($arq). Algunos paquetes de Python (bcrypt, pydantic-core) pueden no traer"
            aviso "versión precompilada y habrá que compilarlos (gcc + Rust): tarda y usa mucha memoria."
            if grep -qw lm /proc/cpuinfo 2>/dev/null; then
                aviso "¡Este procesador SÍ es de 64 bits! Conviene reinstalar el servidor con una imagen de 64 bits (amd64)."
            fi ;;
        *) aviso "Arquitectura $arq no probada. Se intenta igual." ;;
    esac
    mem_mb=$(awk '/^MemTotal:/ {print int($2/1024)}' /proc/meminfo)
    info "Sistema: $JCP_DISTRO_NOMBRE · init: $JCP_INIT · RAM: ${mem_mb} MB"
}

paso_swap() {
    local archivo=/swapfile libre_kb
    if awk 'NR > 1 {hay = 1} END {exit !hay}' /proc/swaps; then
        ok "Ya hay memoria swap activa."
    else
        libre_kb=$(df -Pk / | awk 'NR==2 {print $4}')
        if [ "$libre_kb" -lt $((3 * 1024 * 1024)) ]; then
            aviso "Menos de 3 GB libres en disco: no creo swap. Con 1 GB de RAM es recomendable tenerla."
        else
            info "Creando 1 GB de swap en $archivo (ayuda mucho con 1 GB de RAM)..."
            if [ ! -f "$archivo" ]; then
                dd if=/dev/zero of="$archivo" bs=1M count=1024 2>/dev/null
                chmod 600 "$archivo"
                mkswap "$archivo" >/dev/null
            fi
            if swapon "$archivo" 2>/dev/null; then
                grep -q "^${archivo}[[:space:]]" /etc/fstab || echo "$archivo none swap sw 0 0" >> /etc/fstab
                [ "$JCP_INIT" = openrc ] && { rc-update add swap boot >/dev/null 2>&1 || true; }
                ok "Swap de 1 GB activa."
            else
                aviso "No se pudo activar la swap (algunos VPS tipo contenedor no lo permiten). Sigo sin swap."
                rm -f "$archivo"
            fi
        fi
    fi
    # Usar la swap solo cuando haga falta.
    echo "vm.swappiness=10" > /etc/sysctl.d/90-jujuy-pass.conf
    sysctl -q -w vm.swappiness=10 2>/dev/null || true
}

# Alpine: certbot está en el repositorio "community", que a veces viene comentado.
habilitar_repo_community() {
    local f=/etc/apk/repositories linea_main
    grep -Eq '^[[:space:]]*[^#[:space:]].*/community[[:space:]]*$' "$f" && return 0
    sed -i -E 's|^#[[:space:]]*(https?://.*/community)[[:space:]]*$|\1|' "$f"
    if ! grep -Eq '^[[:space:]]*[^#[:space:]].*/community[[:space:]]*$' "$f"; then
        linea_main=$(grep -E '^[[:space:]]*[^#[:space:]].*/main[[:space:]]*$' "$f" | head -n 1 || true)
        if [ -n "$linea_main" ]; then
            printf '%s\n' "${linea_main%/main*}/community" >> "$f"
        fi
    fi
    info "Repositorio community de Alpine habilitado (para certbot)."
}

paso_paquetes() {
    info "Instalando paquetes del sistema..."
    if [ "$JCP_DISTRO" = debian ]; then
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -q -o DPkg::Lock::Timeout=300
        apt-get install -y -q -o DPkg::Lock::Timeout=300 --no-install-recommends \
            python3 python3-venv nginx certbot sqlite3 logrotate cron rsync curl \
            ca-certificates git openssl tar gzip
        if [ "$JCP_VENV_SISTEMA" = 1 ]; then
            apt-get install -y -q -o DPkg::Lock::Timeout=300 python3-bcrypt || true
        fi
    else
        habilitar_repo_community
        apk update -q
        apk add --no-cache bash python3 nginx certbot sqlite logrotate rsync curl \
            ca-certificates git openssl tar gzip su-exec tzdata
        if [ "$JCP_VENV_SISTEMA" = 1 ]; then
            apk add --no-cache py3-bcrypt || true
        fi
    fi
    python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' \
        || aviso "Python $(python3 -V 2>&1) es viejo; el backend necesita 3.9 o más (mejor 3.11+)."
    ok "Paquetes instalados ($(python3 -V 2>&1), $(nginx -v 2>&1 | sed 's/.*: //'))."
}

paso_hora() {
    # El anti-trampa compara relojes: el servidor tiene que tener la hora bien.
    if [ "$JCP_INIT" = systemd ]; then
        if ! command -v chronyd >/dev/null 2>&1 && ! command -v ntpd >/dev/null 2>&1 \
           && ! systemctl cat systemd-timesyncd.service >/dev/null 2>&1; then
            apt-get install -y -q -o DPkg::Lock::Timeout=300 systemd-timesyncd >/dev/null 2>&1 || true
        fi
        timedatectl set-ntp true >/dev/null 2>&1 || aviso "No pude activar la sincronización de hora (NTP). Revisala con: timedatectl"
    else
        command -v chronyd >/dev/null 2>&1 || apk add --no-cache chrony >/dev/null 2>&1 || true
        if command -v chronyd >/dev/null 2>&1; then
            svc habilitar chronyd
            rc-service chronyd start >/dev/null 2>&1 || aviso "No pude iniciar chronyd (sincronización de hora)."
        fi
    fi
}

paso_usuario_y_carpetas() {
    if ! id "$JCP_USUARIO" >/dev/null 2>&1; then
        info "Creando usuario de sistema $JCP_USUARIO..."
        if [ "$JCP_DISTRO" = debian ]; then
            useradd --system --user-group --home-dir "$JCP_DATOS" --no-create-home \
                --shell /usr/sbin/nologin "$JCP_USUARIO"
        else
            grep -q "^$JCP_USUARIO:" /etc/group || addgroup -S "$JCP_USUARIO"
            adduser -S -D -H -h "$JCP_DATOS" -s /sbin/nologin -G "$JCP_USUARIO" "$JCP_USUARIO"
        fi
    fi
    install -d -m 755 -o root -g root "$JCP_BASE" "$JCP_RELEASES"
    install -d -m 750 -o "$JCP_USUARIO" -g "$JCP_USUARIO" "$JCP_DATOS" "$JCP_LOGS"
    install -d -m 750 -o root -g "$JCP_USUARIO" "$JCP_ETC"
    install -d -m 700 -o root -g root "$JCP_BACKUPS"
    install -d -m 755 -o root -g root "$JCP_DESCARGAS" "$JCP_ACME_WEBROOT"
    install -d -m 700 -o root -g root "$JCP_CACHE_PIP"
    # El servicio escribe acá (systemd/OpenRC abren el archivo antes de bajar privilegios).
    [ -f "$JCP_LOGS/app.log" ] || touch "$JCP_LOGS/app.log"
    chown "$JCP_USUARIO:$JCP_USUARIO" "$JCP_LOGS/app.log"
    chmod 640 "$JCP_LOGS/app.log"
    ok "Usuario y carpetas listos."
}

asegurar_variable() {  # asegurar_variable CLAVE VALOR
    local clave=$1 valor=$2 actual
    if ! grep -Eq "^[[:space:]]*$clave=" "$JCP_ENV_FILE"; then
        printf '%s=%s\n' "$clave" "$valor" >> "$JCP_ENV_FILE"
    else
        actual=$(grep -E "^[[:space:]]*$clave=" "$JCP_ENV_FILE" | tail -n 1 | cut -d= -f2-)
        [ "$actual" = "$valor" ] || aviso "$JCP_ENV_FILE tiene $clave=$actual (lo recomendado en producción es $valor)."
    fi
}

paso_env() {
    if [ ! -f "$JCP_ENV_FILE" ]; then
        info "Creando $JCP_ENV_FILE..."
        cat > "$JCP_ENV_FILE" <<EOF
# =====================================================================
#  Jujuy Ciudad Pass — configuración de PRODUCCIÓN
#  Formato: CLAVE=valor (sin espacios alrededor del "=" y sin comillas).
#  Después de cambiar algo:  sudo systemctl restart jujuy-pass
#                       (Alpine: sudo rc-service jujuy-pass restart)
# =====================================================================
JCP_ENTORNO=prod
JCP_DB_PATH=$JCP_DATOS/jujuy-pass.db
JCP_COOKIE_SECURE=1
JCP_SERVIR_WEB=0
JCP_LOG_LEVEL=INFO

# --- Opcionales (valores por defecto del backend; descomentar para cambiar) ---
# Costo de bcrypt (12 = seguro pero lento en un Atom viejo: ~0,5-1 s por login)
#JCP_BCRYPT_ROUNDS=12
# Anti-trampa
#JCP_PRECISION_MAX_M=50
#JCP_VELOCIDAD_MAX_KMH=200
#JCP_MUESTRA_ANTIGUEDAD_MAX_S=60
# Límites de intentos
#JCP_LOGIN_MAX_FALLOS=5
#JCP_LOGIN_VENTANA_S=900
EOF
    fi
    asegurar_variable JCP_ENTORNO prod
    asegurar_variable JCP_DB_PATH "$JCP_DATOS/jujuy-pass.db"
    asegurar_variable JCP_COOKIE_SECURE 1
    asegurar_variable JCP_SERVIR_WEB 0
    # Normalizar fin de línea por si se editó desde Windows.
    sed -i 's/\r$//' "$JCP_ENV_FILE"
    chown root:"$JCP_USUARIO" "$JCP_ENV_FILE"
    chmod 640 "$JCP_ENV_FILE"
    ok "Variables de entorno en $JCP_ENV_FILE (permisos 640)."
}

# shellcheck disable=SC2329  # se usa desde "trap ... EXIT"
limpiar_release_fallida() {
    if [ -n "${JCP_RELEASE_EN_CURSO:-}" ] && [ -d "$JCP_RELEASE_EN_CURSO" ]; then
        aviso "Borrando la release incompleta $JCP_RELEASE_EN_CURSO"
        rm -rf "$JCP_RELEASE_EN_CURSO"
    fi
}

paso_codigo() {
    if [ -L "$JCP_ACTUAL" ] && [ -x "$JCP_ACTUAL/backend/.venv/bin/uvicorn" ]; then
        ok "El código ya está desplegado ($(readlink -f "$JCP_ACTUAL")). Para traer código nuevo usá: sudo jujuy-pass-update"
        return 0
    fi
    [ "$JCP_ES_32BITS" = 1 ] && instalar_dependencias_compilacion
    trap limpiar_release_fallida EXIT
    preparar_release
    activar_release "$JCP_NUEVA_RELEASE"
    JCP_RELEASE_EN_CURSO=""
    trap - EXIT
}

paso_servicio() {
    info "Instalando el servicio $JCP_SERVICIO ($JCP_INIT)..."
    if [ "$JCP_INIT" = systemd ]; then
        instalar_texto "$DEPLOY_DIR/jujuy-pass.service" "/etc/systemd/system/$JCP_SERVICIO.service" 644
        systemctl daemon-reload
    else
        instalar_texto "$DEPLOY_DIR/openrc/jujuy-pass" "/etc/init.d/$JCP_SERVICIO" 755
        if [ ! -f "/etc/conf.d/$JCP_SERVICIO" ]; then
            instalar_texto "$DEPLOY_DIR/openrc/jujuy-pass.confd" "/etc/conf.d/$JCP_SERVICIO" 644
        fi
    fi
    svc habilitar "$JCP_SERVICIO"
    svc reiniciar "$JCP_SERVICIO" || true
    if salud_ok 40; then
        ok "La API responde en $JCP_URL_SALUD"
        SALUD_API=1
    else
        aviso "La API no respondió a /api/v1/salud. Sigo con nginx; revisá el log:"
        ultimas_lineas_log 30
        SALUD_API=0
    fi
}

paso_mantenimiento() {
    info "Configurando logrotate, backups diarios y comandos jujuy-pass-*..."
    instalar_ayudantes "$DEPLOY_DIR"
    instalar_texto "$DEPLOY_DIR/logrotate/jujuy-pass" /etc/logrotate.d/jujuy-pass 644
    [ -f "$JCP_LOGS/backup.log" ] || : > "$JCP_LOGS/backup.log"
    chmod 640 "$JCP_LOGS/backup.log"

    if [ "$JCP_DISTRO" = debian ]; then
        cat > /etc/cron.d/jujuy-pass <<'EOF'
# Jujuy Ciudad Pass: backup diario de la base de datos (03:30, hora del servidor)
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
30 3 * * * root /usr/local/sbin/jujuy-pass-backup --cron >> /var/log/jujuy-pass/backup.log 2>&1
EOF
        chmod 644 /etc/cron.d/jujuy-pass
        svc habilitar cron
        svc iniciar cron 2>/dev/null || true
    else
        # Alpine: crond de busybox ejecuta /etc/periodic/daily a las 02:00.
        mkdir -p /etc/periodic/daily
        cat > /etc/periodic/daily/jujuy-pass-backup <<'EOF'
#!/bin/sh
# Jujuy Ciudad Pass: backup diario de la base de datos
/usr/local/sbin/jujuy-pass-backup --cron >> /var/log/jujuy-pass/backup.log 2>&1
EOF
        chmod 755 /etc/periodic/daily/jujuy-pass-backup
        svc habilitar crond
        rc-service crond start >/dev/null 2>&1 || true
    fi

    if [ "$JCP_INIT" = systemd ]; then
        # Que el journal no llene un disco chico.
        mkdir -p /etc/systemd/journald.conf.d
        printf '[Journal]\nSystemMaxUse=100M\n' > /etc/systemd/journald.conf.d/jujuy-pass.conf
        systemctl restart systemd-journald 2>/dev/null || true
    fi
    ok "Mantenimiento configurado."
}

paso_firewall() {
    [ "$SIN_FIREWALL" = 1 ] && { info "Firewall: omitido (--sin-firewall)."; return 0; }
    if ! command -v ufw >/dev/null 2>&1; then
        aviso "ufw no está instalado: no configuro firewall. Verificá en el panel del proveedor que solo estén abiertos 22, 80 y 443."
        return 0
    fi
    local puertos p
    # Si SSH escucha en otro puerto, también se abre (para no quedarte afuera).
    puertos=$( { echo 22; sshd -T 2>/dev/null | awk '$1 == "port" {print $2}'; } | sort -u | tr '\n' ' ' || true)
    for p in $puertos; do
        ufw allow "$p/tcp" >/dev/null
    done
    ufw allow 80/tcp >/dev/null
    ufw allow 443/tcp >/dev/null
    ufw --force enable >/dev/null
    ok "Firewall ufw activo: abiertos SSH (${puertos% }), 80 y 443."
}

# ---- nginx ---------------------------------------------------------------------
dir_conf_nginx() {
    if [ -d /etc/nginx/http.d ]; then echo /etc/nginx/http.d; else echo /etc/nginx/conf.d; fi
}

version_nginx_ge() {  # version_nginx_ge 1.25.1
    local v
    v=$(nginx -v 2>&1 | sed -n 's#.*nginx/\([0-9.]*\).*#\1#p')
    awk -v a="$v" -v b="$1" 'BEGIN {
        split(a, x, "."); split(b, y, ".");
        for (i = 1; i <= 3; i++) { if (x[i] + 0 > y[i] + 0) exit 0; if (x[i] + 0 < y[i] + 0) exit 1 }
        exit 0 }'
}

# Ajusta una configuración generada a esta máquina (IPv6, sintaxis de http2).
adaptar_conf_nginx() {
    local archivo=$1
    if [ ! -e /proc/net/if_inet6 ]; then
        sed -i '/listen[[:space:]]*\[::\]/d' "$archivo"
    fi
    if version_nginx_ge 1.25.1; then
        sed -i -E 's/^([[:space:]]*listen[[:space:]].*443[[:space:]]+ssl)[[:space:]]+http2;/\1;/' "$archivo"
        sed -i -E 's/^([[:space:]]*)# JCP_HTTP2_ON$/\1http2 on;/' "$archivo"
    fi
}

ajustar_nginx_conf() {
    local f=/etc/nginx/nginx.conf
    [ -f "$f.orig-jujuy-pass" ] || cp -p "$f" "$f.orig-jujuy-pass"
    # Poca RAM: un solo proceso de nginx alcanza y sobra para este tráfico.
    sed -i -E 's/^([[:space:]]*)worker_processes[[:space:]]+[^;]+;/\1worker_processes 1;/' "$f"
    sed -i -E 's/^([[:space:]]*)worker_connections[[:space:]]+[^;]+;/\1worker_connections 512;/' "$f"
    grep -Eq '^[[:space:]]*worker_processes' "$f" || sed -i '1i worker_processes 1;' "$f"
    # Desactivar el sitio de ejemplo de la distro.
    rm -f /etc/nginx/sites-enabled/default
    if [ -f /etc/nginx/http.d/default.conf ]; then
        mv -f /etc/nginx/http.d/default.conf /etc/nginx/http.d/default.conf.desactivado
    fi
}

# instalar_conf_nginx ARCHIVO_GENERADO: lo copia, prueba con nginx -t y recarga.
# Si nginx -t falla, vuelve a la configuración anterior.
instalar_conf_nginx() {
    local generado=$1 destino respaldo
    destino="$(dir_conf_nginx)/jujuy-pass.conf"
    respaldo="$destino.anterior"
    [ -f "$destino" ] && cp -p "$destino" "$respaldo"
    install -m 644 "$generado" "$destino"
    if ! nginx -t 2>/tmp/jujuy-pass-nginx-t.log; then
        cat /tmp/jujuy-pass-nginx-t.log >&2
        if [ -f "$respaldo" ]; then mv -f "$respaldo" "$destino"; else rm -f "$destino"; fi
        morir "La configuración de nginx tiene errores (se restauró la anterior)."
    fi
    rm -f "$respaldo" /tmp/jujuy-pass-nginx-t.log
    svc habilitar nginx
    svc recargar nginx
}

conf_nginx_provisoria() {  # solo HTTP, para que Let's Encrypt valide el dominio
    local tmp=$1
    cat > "$tmp" <<EOF
# Jujuy Ciudad Pass — configuración PROVISORIA (solo HTTP, mientras se obtiene el certificado).
# install.sh la reemplaza por la definitiva en cuanto existe el certificado.
server {
    listen 80;
    listen [::]:80;
    server_name $DOMINIO;
    server_tokens off;
    location ^~ /.well-known/acme-challenge/ {
        root $JCP_ACME_WEBROOT;
        default_type text/plain;
    }
    location / {
        default_type text/plain;
        return 503 "Jujuy Ciudad Pass: instalacion en curso.\n";
    }
}
EOF
    adaptar_conf_nginx "$tmp"
}

conf_nginx_definitiva() {
    local tmp=$1
    tr -d '\r' < "$DEPLOY_DIR/nginx/jujuy-pass.conf" | sed "s/__DOMINIO__/$DOMINIO/g" > "$tmp"
    adaptar_conf_nginx "$tmp"
}

comprobar_dns() {
    local ips ip_publica
    ips=$(getent hosts "$DOMINIO" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ' || true)
    ip_publica=$(curl -4 -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)
    if [ -z "$ips" ]; then
        aviso "El dominio $DOMINIO todavía no resuelve a ninguna IP. Let's Encrypt va a fallar hasta que el DNS esté listo."
    elif [ -n "$ip_publica" ] && ! printf ' %s ' "$ips" | grep -q " $ip_publica "; then
        aviso "$DOMINIO apunta a: $ips pero la IP pública de este servidor parece ser $ip_publica."
    else
        ok "DNS: $DOMINIO -> $ips"
    fi
}

paso_nginx_y_certificado() {
    local live="/etc/letsencrypt/live/$DOMINIO/fullchain.pem" tmp renov
    local -a extra=()
    tmp=$(mktemp)
    ajustar_nginx_conf

    renov="/etc/letsencrypt/renewal/$DOMINIO.conf"
    if [ -f "$live" ] && [ "$STAGING" = 0 ] && [ -f "$renov" ] && grep -q 'acme-staging' "$renov"; then
        info "Hay un certificado de PRUEBA (staging): se reemplaza por uno real."
        extra=(--force-renewal)
    elif [ -f "$live" ] && [ "$STAGING" = 0 ]; then
        ok "Ya existe certificado para $DOMINIO."
    fi

    if [ ! -f "$live" ] || [ ${#extra[@]} -gt 0 ]; then
        if [ "$SIN_CERT" = 1 ]; then
            conf_nginx_provisoria "$tmp"
            instalar_conf_nginx "$tmp"
            rm -f "$tmp"
            aviso "Sin certificado (--sin-certificado): el sitio NO funciona todavía."
            aviso "Cuando el DNS apunte a este servidor, corré de nuevo: sudo bash $DEPLOY_DIR/install.sh"
            return 0
        fi
        # Si todavía no hay certificado, nginx arranca con la configuración provisoria.
        if [ ! -f "$live" ]; then
            conf_nginx_provisoria "$tmp"
            instalar_conf_nginx "$tmp"
        fi
        comprobar_dns
        [ "$STAGING" = 1 ] && extra+=(--staging)
        info "Pidiendo certificado a Let's Encrypt para $DOMINIO..."
        if ! certbot certonly --webroot -w "$JCP_ACME_WEBROOT" -d "$DOMINIO" \
                --email "$EMAIL" --agree-tos --no-eff-email --non-interactive \
                --keep-until-expiring ${extra[@]+"${extra[@]}"}; then
            rm -f "$tmp"
            morir "certbot no pudo obtener el certificado. Revisá que $DOMINIO apunte a la IP de este servidor y que el puerto 80 esté abierto (ver docs/DESPLIEGUE.md, 'Problemas frecuentes'). Después corré de nuevo install.sh."
        fi
        ok "Certificado obtenido."
    fi

    conf_nginx_definitiva "$tmp"
    instalar_conf_nginx "$tmp"
    rm -f "$tmp"
    ok "nginx configurado: https://$DOMINIO/"
    paso_renovacion
}

paso_renovacion() {
    # Después de cada renovación, recargar nginx para que use el certificado nuevo.
    mkdir -p /etc/letsencrypt/renewal-hooks/deploy
    cat > /etc/letsencrypt/renewal-hooks/deploy/jujuy-pass-recargar-nginx <<'EOF'
#!/bin/sh
# Jujuy Ciudad Pass: recargar nginx al renovar el certificado.
nginx -t -q || exit 1
if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
    systemctl reload nginx
else
    rc-service nginx reload
fi
EOF
    chmod 755 /etc/letsencrypt/renewal-hooks/deploy/jujuy-pass-recargar-nginx

    if [ "$JCP_INIT" = systemd ] && systemctl cat certbot.timer >/dev/null 2>&1; then
        systemctl enable --now certbot.timer >/dev/null 2>&1 || true
        ok "Renovación automática: certbot.timer (systemd)."
    elif [ "$JCP_DISTRO" = debian ]; then
        if [ ! -f /etc/cron.d/certbot ]; then
            echo "17 3,15 * * * root certbot renew -q" > /etc/cron.d/jujuy-pass-certbot
            chmod 644 /etc/cron.d/jujuy-pass-certbot
        fi
        ok "Renovación automática: cron."
    else
        mkdir -p /etc/periodic/daily
        cat > /etc/periodic/daily/jujuy-pass-certbot <<'EOF'
#!/bin/sh
# Jujuy Ciudad Pass: renovar certificados de Let's Encrypt (solo renueva si faltan < 30 días)
certbot renew -q
EOF
        chmod 755 /etc/periodic/daily/jujuy-pass-certbot
        ok "Renovación automática: /etc/periodic/daily (crond)."
    fi
}

resumen() {
    local salud_https="no verificada"
    if curl -fsS --max-time 8 --resolve "$DOMINIO:443:127.0.0.1" "https://$DOMINIO/api/v1/salud" >/dev/null 2>&1; then
        salud_https="OK"
    fi
    echo
    echo "=================================================================="
    echo " Jujuy Ciudad Pass instalado"
    echo "=================================================================="
    echo " Sitio:         https://$DOMINIO/"
    echo " APK:           https://$DOMINIO/descargas/jujuy-pass.apk"
    echo " API local:     $([ "${SALUD_API:-0}" = 1 ] && echo OK || echo 'NO RESPONDE (ver log)')"
    echo " API por HTTPS: $salud_https"
    echo
    echo " Próximos pasos:"
    echo "  1) Crear el primer administrador:"
    echo "       sudo jujuy-pass-cli crear-admin --email admin@ejemplo.com --nombre \"Nombre Apellido\""
    echo "  2) Subir la APK de turistas:"
    echo "       sudo jujuy-pass-subir-apk /ruta/a/jujuy-pass.apk"
    echo "  3) Ver el estado cuando quieras:"
    echo "       sudo jujuy-pass-estado"
    echo
    echo " Guía completa: $PROYECTO_DIR/docs/DESPLIEGUE.md"
    echo "=================================================================="
}

main() {
    requerir_root
    detectar_sistema
    tomar_lock
    resolver_configuracion
    JCP_VENV_SISTEMA=${JCP_VENV_SISTEMA:-0}

    info "Instalando Jujuy Ciudad Pass para https://$DOMINIO/"
    paso_arquitectura
    paso_swap
    paso_paquetes
    paso_hora
    paso_usuario_y_carpetas
    guardar_conf_despliegue
    paso_env
    paso_firewall
    paso_codigo
    paso_servicio
    paso_mantenimiento
    paso_nginx_y_certificado
    resumen
}

main "$@"
exit 0
