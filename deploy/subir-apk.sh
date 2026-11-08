#!/usr/bin/env bash
# =============================================================================
#  Jujuy Ciudad Pass — publicar la APK de turistas
#  (instalado como /usr/local/sbin/jujuy-pass-subir-apk)
#
#  Uso:  sudo jujuy-pass-subir-apk /root/app-release.apk
#
#  La copia a /var/www/jujuy-pass/descargas/jujuy-pass.apk (servida en
#  https://DOMINIO/descargas/jujuy-pass.apk), guarda la versión anterior como
#  jujuy-pass-anterior.apk y publica el SHA-256 en jujuy-pass.apk.sha256.
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

main() {
    local origen=${1:-} destino="$JCP_DESCARGAS/jujuy-pass.apk" tam firma
    [ -n "$origen" ] || morir "Uso: sudo jujuy-pass-subir-apk RUTA/AL/ARCHIVO.apk"
    requerir_root
    [ -f "$origen" ] || morir "No existe $origen"
    # Una APK es un ZIP: empieza con "PK".
    firma=$(head -c 2 "$origen")
    [ "$firma" = "PK" ] || morir "$origen no parece una APK (no es un archivo ZIP)."
    tam=$(wc -c < "$origen")
    [ "$tam" -gt 100000 ] || morir "$origen es demasiado chico ($tam bytes) para ser la APK."

    mkdir -p "$JCP_DESCARGAS"
    chmod 755 "$JCP_DESCARGAS"
    [ -f "$destino" ] && cp -p "$destino" "$JCP_DESCARGAS/jujuy-pass-anterior.apk"
    cp "$origen" "$destino.nuevo"
    chmod 644 "$destino.nuevo"
    mv -f "$destino.nuevo" "$destino"
    (cd "$JCP_DESCARGAS" && sha256sum jujuy-pass.apk > jujuy-pass.apk.sha256)
    chmod 644 "$JCP_DESCARGAS"/*

    DOMINIO=""
    cargar_conf_despliegue
    ok "APK publicada ($(du -h "$destino" | cut -f1))."
    echo "   Descarga: https://${DOMINIO:-TU-DOMINIO}/descargas/jujuy-pass.apk"
    echo "   SHA-256:  $(cut -d' ' -f1 "$JCP_DESCARGAS/jujuy-pass.apk.sha256")"
}

main "$@"
exit 0
