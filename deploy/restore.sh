#!/usr/bin/env bash
# =============================================================================
#  Jujuy Ciudad Pass — restaurar la base de datos desde un backup
#  (instalado como /usr/local/sbin/jujuy-pass-restore)
#
#  Uso:
#    sudo jujuy-pass-restore                       lista los backups disponibles
#    sudo jujuy-pass-restore ultimo                restaura el más reciente
#    sudo jujuy-pass-restore /var/backups/jujuy-pass/jujuy-pass-20261107-033000.db.gz
#    agregar --si para no pedir confirmación (¡cuidado!)
#
#  Pasos: verifica el backup -> pide confirmación -> detiene el servicio ->
#  guarda una copia de la base ACTUAL (por si te arrepentís) -> reemplaza la base
#  -> arranca el servicio -> chequea /api/v1/salud.
#  Todo lo que se cargó después de la fecha del backup se pierde.
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
    echo "Backups disponibles en $JCP_BACKUPS (del más viejo al más nuevo):"
    for f in "$JCP_BACKUPS"/jujuy-pass-*.db.gz; do
        [ -f "$f" ] || continue
        hay=1
        printf '  %s  (%s)\n' "$f" "$(du -h "$f" | cut -f1)"
    done
    [ "$hay" = 1 ] || echo "  (no hay backups)"
    echo
    echo "Para restaurar:  sudo jujuy-pass-restore RUTA_DEL_BACKUP   (o 'ultimo')"
}

main() {
    local archivo="" si=0 db dir_db tmpdir tmp chk resp seguridad
    while [ $# -gt 0 ]; do
        case $1 in
            --si) si=1; shift ;;
            -h|--ayuda|--help) sed -n '2,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; return 0 ;;
            -*) morir "Opción desconocida: $1" ;;
            *) archivo=$1; shift ;;
        esac
    done
    requerir_root
    if [ -z "$archivo" ]; then
        listar
        return 0
    fi
    detectar_sistema
    tomar_lock
    if [ "$archivo" = ultimo ]; then
        archivo=$(ultimo_backup)
        [ -n "$archivo" ] || morir "No hay backups en $JCP_BACKUPS."
    fi
    [ -f "$archivo" ] || morir "No existe el archivo $archivo"

    db=$(jcp_db_path)
    dir_db=$(dirname "$db")
    mkdir -p "$dir_db"

    # 1) Descomprimir y verificar ANTES de tocar nada.
    info "Verificando $archivo..."
    gzip -t "$archivo" || morir "El archivo está dañado (gzip)."
    tmpdir="$dir_db/.restore-tmp"
    rm -rf "$tmpdir"
    mkdir -p "$tmpdir"
    chown "$JCP_USUARIO:$JCP_USUARIO" "$tmpdir"
    chmod 700 "$tmpdir"
    tmp="$tmpdir/restaurada.db"
    gzip -dc "$archivo" > "$tmp"
    chown "$JCP_USUARIO:$JCP_USUARIO" "$tmp"
    chmod 640 "$tmp"
    chk=$(como_jujuypass sqlite3 "$tmp" "PRAGMA quick_check;" 2>&1 || true)
    if [ "$chk" != "ok" ]; then
        rm -rf "$tmpdir"
        morir "El backup no pasó el control de integridad: $chk"
    fi
    if ! como_jujuypass sqlite3 "$tmp" "SELECT name FROM sqlite_master WHERE type='table' AND name='usuarios';" | grep -q usuarios; then
        aviso "El backup no tiene la tabla 'usuarios'. ¿Seguro que es de Jujuy Ciudad Pass?"
    fi
    ok "Backup válido ($(du -h "$tmp" | cut -f1) sin comprimir)."

    # 2) Confirmación.
    echo
    echo "  Se va a REEMPLAZAR la base de datos actual:"
    echo "     $db"
    echo "  por el backup:"
    echo "     $archivo"
    echo "  Todo lo registrado después de ese backup se pierde. El servicio se detiene unos segundos."
    echo
    if [ "$si" != 1 ]; then
        if [ ! -t 0 ]; then
            rm -rf "$tmpdir"
            morir "Falta confirmación (no hay terminal). Usá --si si realmente querés hacerlo sin preguntar."
        fi
        read -r -p "  Escribí RESTAURAR (en mayúsculas) para continuar: " resp
        if [ "$resp" != "RESTAURAR" ]; then
            rm -rf "$tmpdir"
            echo "Cancelado. No se cambió nada."
            return 0
        fi
    fi

    # 3) Copia de seguridad de la base actual (con el servicio todavía andando).
    seguridad=""
    if [ -f "$db" ]; then
        info "Guardando una copia de la base actual por las dudas..."
        hacer_backup antes-de-restaurar
        seguridad=$JCP_ULTIMO_BACKUP
        [ -n "$seguridad" ] && ok "Copia de la base actual: $seguridad"
    fi

    # 4) Reemplazar.
    info "Deteniendo el servicio..."
    svc detener "$JCP_SERVICIO" || true
    # Los -wal/-shm viejos NO pueden quedar junto a la base nueva (la corromperían).
    rm -f "$db-wal" "$db-shm" "$db-journal"
    mv -f "$tmp" "$db"
    chown "$JCP_USUARIO:$JCP_USUARIO" "$db"
    chmod 640 "$db"
    rm -rf "$tmpdir"

    info "Arrancando el servicio..."
    svc iniciar "$JCP_SERVICIO" || true
    if salud_ok 40; then
        ok "Base restaurada desde $(basename "$archivo") y servicio funcionando."
    else
        ultimas_lineas_log 30
        aviso "El servicio no responde a /api/v1/salud después de restaurar."
        [ -n "$seguridad" ] && aviso "Para volver a como estaba antes:  sudo jujuy-pass-restore $seguridad"
        exit 1
    fi
}

main "$@"
exit 0
