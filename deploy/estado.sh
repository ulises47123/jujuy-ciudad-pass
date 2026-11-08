#!/usr/bin/env bash
# =============================================================================
#  Jujuy Ciudad Pass — estado del servidor de un vistazo
#  (instalado como /usr/local/sbin/jujuy-pass-estado)
#
#  Uso:  sudo jujuy-pass-estado
#  Muestra: servicio, salud de la API (local y por HTTPS), versión desplegada,
#  certificado, memoria, disco, base de datos, último backup y errores recientes.
# =============================================================================
set -uo pipefail
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

_dir=$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)
if [ -f "$_dir/comun.sh" ]; then
    # shellcheck source=comun.sh
    . "$_dir/comun.sh"
elif [ -f /usr/local/lib/jujuy-pass/comun.sh ]; then
    # shellcheck source=/dev/null
    . /usr/local/lib/jujuy-pass/comun.sh
else
    echo "No encuentro comun.sh (¿corriste install.sh?)" >&2
    exit 1
fi

fila() { printf '%s%-20s%s %s\n' "$_C_B" "$1" "$_C_0" "$2"; }
bien() { printf '%sOK%s %s' "$_C_V" "$_C_0" "$*"; }
mal()  { printf '%sATENCIÓN%s %s' "$_C_R" "$_C_0" "$*"; }

main() {
    requerir_root
    detectar_sistema
    DOMINIO=""
    cargar_conf_despliegue

    local pid rss mem_txt reinicio resp salud_https cert fin db ult edad_h total release ver
    echo "=== Jujuy Ciudad Pass — $(hostname) — $(date '+%Y-%m-%d %H:%M:%S %Z') ==="
    echo

    # --- Servicio ---
    pid=$(pgrep -f 'app.main:app' 2>/dev/null | head -n 1 || true)
    rss=""
    if [ -n "$pid" ] && [ -r "/proc/$pid/status" ]; then
        rss=$(awk '/^VmRSS:/ {printf "%d MB", $2/1024}' "/proc/$pid/status")
    fi
    mem_txt="PID ${pid:-?}, RAM ${rss:-?}"
    if [ "$JCP_INIT" = systemd ]; then
        reinicio="systemctl restart $JCP_SERVICIO"
    else
        reinicio="rc-service $JCP_SERVICIO restart"
    fi
    if svc activo "$JCP_SERVICIO"; then
        fila "Servicio API" "$(bien "activo ($mem_txt)")"
    else
        fila "Servicio API" "$(mal "DETENIDO — probá: sudo $reinicio  y mirá: sudo tail -n 50 $JCP_LOGS/app.log")"
    fi
    if svc activo nginx; then fila "nginx" "$(bien activo)"; else fila "nginx" "$(mal DETENIDO)"; fi

    # --- Salud ---
    if resp=$(curl -fsS --max-time 5 "$JCP_URL_SALUD" 2>/dev/null) && printf '%s' "$resp" | grep -Eq '"ok"[[:space:]]*:[[:space:]]*true'; then
        fila "Salud (local)" "$(bien "$resp")"
    else
        fila "Salud (local)" "$(mal "no responde $JCP_URL_SALUD")"
    fi
    if [ -n "$DOMINIO" ]; then
        if curl -fsS --max-time 8 --resolve "$DOMINIO:443:127.0.0.1" "https://$DOMINIO/api/v1/salud" >/dev/null 2>&1; then
            salud_https=$(bien "https://$DOMINIO/api/v1/salud")
        else
            salud_https=$(mal "falla https://$DOMINIO/api/v1/salud (nginx o certificado)")
        fi
        fila "Salud (HTTPS)" "$salud_https"
    fi

    # --- Versión ---
    release=$(readlink -f "$JCP_ACTUAL" 2>/dev/null || true)
    if [ -n "$release" ] && [ -f "$release/VERSION_DESPLIEGUE" ]; then
        ver=$(sed -n 's/^version=//p' "$release/VERSION_DESPLIEGUE")
        fila "Versión" "$(basename "$release") ($ver)"
    else
        fila "Versión" "$(mal "no hay código desplegado en $JCP_ACTUAL")"
    fi

    # --- Certificado ---
    cert="/etc/letsencrypt/live/$DOMINIO/fullchain.pem"
    if [ -n "$DOMINIO" ] && [ -f "$cert" ] && command -v openssl >/dev/null 2>&1; then
        fin=$(openssl x509 -enddate -noout -in "$cert" | cut -d= -f2)
        if openssl x509 -checkend $((14 * 86400)) -noout -in "$cert" >/dev/null; then
            fila "Certificado HTTPS" "$(bien "vence $fin")"
        else
            fila "Certificado HTTPS" "$(mal "vence $fin (menos de 14 días: ¿falla la renovación? probá: sudo certbot renew)")"
        fi
    else
        fila "Certificado HTTPS" "$(mal "no encontrado para '${DOMINIO:-?}'")"
    fi

    # --- Base de datos y backups ---
    db=$(jcp_db_path)
    if [ -f "$db" ]; then
        fila "Base de datos" "$db ($(du -h "$db" | cut -f1); WAL: $(du -h "$db-wal" 2>/dev/null | cut -f1 || echo 0))"
    else
        fila "Base de datos" "$(mal "no existe $db")"
    fi
    ult=$(ultimo_backup)
    total=$(find "$JCP_BACKUPS" -maxdepth 1 -name 'jujuy-pass-*.db.gz' 2>/dev/null | wc -l)
    if [ -n "$ult" ]; then
        edad_h=$(( ( $(date +%s) - $(stat -c %Y "$ult") ) / 3600 ))
        if [ "$edad_h" -le 26 ]; then
            fila "Último backup" "$(bien "$(basename "$ult") (hace ${edad_h} h, $(du -h "$ult" | cut -f1)); total: $total")"
        else
            fila "Último backup" "$(mal "$(basename "$ult") es de hace ${edad_h} h: ¿anda el cron? Ver $JCP_LOGS/backup.log")"
        fi
    else
        fila "Último backup" "$(mal "no hay backups en $JCP_BACKUPS")"
    fi

    # --- Memoria y disco ---
    echo
    echo "--- Memoria (MB) ---"
    free -m 2>/dev/null || cat /proc/meminfo
    echo
    echo "--- Disco ---"
    df -h / "$JCP_DATOS" "$JCP_BACKUPS" 2>/dev/null | awk 'NR == 1 || !visto[$0]++'

    # --- Errores recientes ---
    echo
    echo "--- Últimas líneas con error en $JCP_LOGS/app.log ---"
    if [ -f "$JCP_LOGS/app.log" ]; then
        grep -Ei 'error|traceback|exception|critical' "$JCP_LOGS/app.log" | tail -n 5 || echo "(ninguna)"
    else
        echo "(no hay log todavía)"
    fi
}

main "$@"
