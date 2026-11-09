#!/usr/bin/env bash
# =============================================================================
#  Jujuy Ciudad Pass — backup de la base de datos SQLite
#  (instalado como /usr/local/sbin/jujuy-pass-backup; cron lo corre una vez por día)
#
#  Uso:
#    sudo jujuy-pass-backup              backup ahora
#    sudo jujuy-pass-backup --listar     ver los backups guardados
#
#  Hace una copia consistente con "sqlite3 .backup" (sirve con el servicio
#  andando), la verifica (PRAGMA quick_check), la comprime con gzip y la guarda
#  en /var/backups/jujuy-pass/. Borra los backups de más de 14 días
#  (cambiable con JCP_BACKUP_DIAS en /etc/jujuy-pass/despliegue.conf).
# =============================================================================
set -euo pipefail
umask 077
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

listar() {
    local f hay=0
    echo "Backups en $JCP_BACKUPS (del más viejo al más nuevo):"
    for f in "$JCP_BACKUPS"/jujuy-pass-*.db.gz; do
        [ -f "$f" ] || continue
        hay=1
        printf '  %-60s %8s\n' "$(basename "$f")" "$(du -h "$f" | cut -f1)"
    done
    [ "$hay" = 1 ] || echo "  (no hay backups todavía)"
}

main() {
    local cron=0 borrados
    case "${1:-}" in
        --listar) requerir_root; listar; return 0 ;;
        --cron)   cron=1 ;;
        -h|--ayuda|--help) sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; return 0 ;;
        "") ;;
        *) morir "Opción desconocida: $1" ;;
    esac
    requerir_root
    [ "$cron" = 1 ] && echo "---- $(date '+%Y-%m-%d %H:%M:%S') backup diario ----"
    tomar_lock /run/jujuy-pass-backup.lock

    cargar_conf_despliegue   # puede definir JCP_BACKUP_DIAS
    case "$JCP_BACKUP_DIAS" in ''|*[!0-9]*|0) JCP_BACKUP_DIAS=14 ;; esac

    hacer_backup ""
    if [ -n "$JCP_ULTIMO_BACKUP" ]; then
        ok "Backup creado: $JCP_ULTIMO_BACKUP ($(du -h "$JCP_ULTIMO_BACKUP" | cut -f1))"
    fi

    # Conservar los últimos JCP_BACKUP_DIAS días.
    borrados=$(find "$JCP_BACKUPS" -maxdepth 1 -type f -name 'jujuy-pass-*.db.gz' \
        -mtime +"$((JCP_BACKUP_DIAS - 1))" -print -exec rm -f {} \; | wc -l)
    if [ "$borrados" -gt 0 ]; then
        info "Se borraron $borrados backups de más de $JCP_BACKUP_DIAS días."
    fi
    # Restos de backups interrumpidos.
    find "$JCP_BACKUPS" -maxdepth 1 -type f -name '*.parcial' -mmin +60 -exec rm -f {} \; || true
}

main "$@"
exit 0
