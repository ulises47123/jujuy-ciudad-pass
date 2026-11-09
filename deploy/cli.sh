#!/usr/bin/env bash
# =============================================================================
#  Jujuy Ciudad Pass — ejecutar la CLI del backend (python -m app.cli) en producción
#  (instalado como /usr/local/sbin/jujuy-pass-cli)
#
#  Uso:
#    sudo jujuy-pass-cli crear-admin --email admin@ejemplo.com --nombre "Ana Pérez"
#    sudo jujuy-pass-cli --help
#
#  Carga /etc/jujuy-pass/jujuy-pass.env y corre la CLI como el usuario jujuypass
#  (así la base de datos sigue perteneciendo al servicio).
# =============================================================================
set -euo pipefail
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

main() {
    requerir_root
    local backend="$JCP_ACTUAL/backend"
    [ -x "$backend/.venv/bin/python" ] || morir "No hay código desplegado en $JCP_ACTUAL."
    cargar_env_app
    export HOME="$JCP_DATOS" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
    cd "$backend"
    como_jujuypass "$backend/.venv/bin/python" -m app.cli "$@"
}

main "$@"
