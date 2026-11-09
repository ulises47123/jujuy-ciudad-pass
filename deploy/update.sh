#!/usr/bin/env bash
# =============================================================================
#  Jujuy Ciudad Pass — actualizar el código en el servidor
#  (instalado como /usr/local/sbin/jujuy-pass-update)
#
#  Uso:
#    sudo jujuy-pass-update                 trae el código del mismo origen que la última vez
#    sudo jujuy-pass-update --rama main     (git) otra rama
#    sudo jujuy-pass-update --repo URL      cambiar a un repositorio git
#    sudo jujuy-pass-update --origen DIR    copiar el código desde la carpeta DIR
#    sudo jujuy-pass-update --anterior      volver a la versión anterior (sin traer nada)
#    sudo jujuy-pass-update --sin-backup    no hacer backup antes (no recomendado)
#
#  Qué hace: backup de la base -> copia el código a una release nueva -> crea su
#  venv e instala requirements -> la activa -> reinicia el servicio -> chequea
#  GET /api/v1/salud. Si la salud falla, vuelve solo a la versión anterior.
#  Si en esta actualización cambió algo de deploy/ (nginx, servicio), además
#  corré:  sudo bash /opt/jujuy-pass/actual/deploy/install.sh
# =============================================================================
set -euo pipefail
umask 022
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

uso() { sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

# shellcheck disable=SC2329  # se usa desde "trap ... EXIT"
limpiar_release_fallida() {
    if [ -n "${JCP_RELEASE_EN_CURSO:-}" ] && [ -d "$JCP_RELEASE_EN_CURSO" ]; then
        aviso "Borrando la release incompleta $JCP_RELEASE_EN_CURSO"
        rm -rf "$JCP_RELEASE_EN_CURSO"
    fi
}

version_de() { sed -n 's/^version=//p' "$1/VERSION_DESPLIEGUE" 2>/dev/null || true; }

volver_a_anterior() {
    local actual anterior
    actual=$(readlink -f "$JCP_ACTUAL")
    anterior=$(cat "$JCP_ANTERIOR_TXT" 2>/dev/null || true)
    [ -n "$anterior" ] && [ -d "$anterior" ] && [ "$anterior" != "$actual" ] \
        || morir "No hay una versión anterior guardada a la que volver."
    info "Volviendo de $(basename "$actual") a $(basename "$anterior") ($(version_de "$anterior"))..."
    activar_release "$anterior"
    svc reiniciar "$JCP_SERVICIO"
    if salud_ok 40; then
        ok "Listo: está activa $(basename "$anterior"). (Para deshacer: sudo jujuy-pass-update --anterior)"
    else
        ultimas_lineas_log 30
        morir "La versión anterior tampoco responde a /api/v1/salud. Revisá el log."
    fi
}

main() {
    local arg_rama="" arg_repo="" arg_origen="" sin_backup=0 anterior=0 previa nueva
    while [ $# -gt 0 ]; do
        case $1 in
            --rama)       arg_rama=${2:?Falta el valor de --rama}; shift 2 ;;
            --repo)       arg_repo=${2:?Falta el valor de --repo}; shift 2 ;;
            --origen)     arg_origen=${2:?Falta el valor de --origen}; shift 2 ;;
            --sin-backup) sin_backup=1; shift ;;
            --anterior)   anterior=1; shift ;;
            -h|--ayuda|--help) uso; exit 0 ;;
            *) morir "Opción desconocida: $1 (ver --ayuda)" ;;
        esac
    done

    requerir_root
    detectar_sistema
    tomar_lock
    [ -L "$JCP_ACTUAL" ] || morir "No hay una instalación previa en $JCP_ACTUAL. Usá primero deploy/install.sh."

    if [ "$anterior" = 1 ]; then
        volver_a_anterior
        return 0
    fi

    DOMINIO="" EMAIL="" ORIGEN_TIPO="" REPO_URL="" RAMA="" ORIGEN_DIR=""
    cargar_conf_despliegue
    [ -n "$arg_rama" ] && RAMA=$arg_rama
    RAMA=${RAMA:-main}
    if [ -n "$arg_repo" ]; then
        ORIGEN_TIPO=git; REPO_URL=$arg_repo
    elif [ -n "$arg_origen" ]; then
        ORIGEN_TIPO=local; ORIGEN_DIR=$(cd "$arg_origen" && pwd)
    fi
    [ -n "$ORIGEN_TIPO" ] || morir "No sé de dónde traer el código. Usá --repo URL o --origen CARPETA."
    previa=$(readlink -f "$JCP_ACTUAL")

    # 1) Backup antes de tocar nada.
    if [ "$sin_backup" = 0 ]; then
        info "Haciendo backup de la base antes de actualizar..."
        hacer_backup preupdate
        [ -n "$JCP_ULTIMO_BACKUP" ] && ok "Backup: $JCP_ULTIMO_BACKUP"
    fi

    # 2) Release nueva (si algo falla acá, la versión en uso no se toca).
    trap limpiar_release_fallida EXIT
    preparar_release
    nueva=$JCP_NUEVA_RELEASE

    # 3) Activar y reiniciar.
    info "Activando $(basename "$nueva") y reiniciando el servicio..."
    activar_release "$nueva"
    JCP_RELEASE_EN_CURSO=""
    trap - EXIT
    svc reiniciar "$JCP_SERVICIO" || true

    # 4) Chequear salud; si falla, volver atrás.
    if salud_ok 45; then
        guardar_conf_despliegue
        instalar_ayudantes "$nueva/deploy" 2>/dev/null || aviso "No se pudieron actualizar los comandos jujuy-pass-*."
        limpiar_releases
        ok "Actualización terminada: $(basename "$nueva") ($(version_de "$nueva"))."
        echo "   Si algo anda mal:  sudo jujuy-pass-update --anterior"
        return 0
    fi

    aviso "La versión nueva NO responde a /api/v1/salud. Volviendo a la anterior..."
    ultimas_lineas_log 40
    ln -sfn "$previa" "$JCP_ACTUAL"
    svc reiniciar "$JCP_SERVICIO" || true
    rm -rf "$nueva"
    if salud_ok 40; then
        aviso "Se volvió a la versión anterior ($(basename "$previa")); el sistema está funcionando."
        if [ -n "${JCP_ULTIMO_BACKUP:-}" ]; then
            aviso "Si la versión fallida llegó a modificar la base y algo anda raro, restaurá el backup previo:"
            aviso "  sudo jujuy-pass-restore $JCP_ULTIMO_BACKUP"
        fi
        exit 1
    fi
    ultimas_lineas_log 40
    morir "ATENCIÓN: tampoco responde la versión anterior. Revisá el log y considerá restaurar el backup ${JCP_ULTIMO_BACKUP:-}."
}

main "$@"
exit 0
