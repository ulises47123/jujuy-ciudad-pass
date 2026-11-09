#!/usr/bin/env bash
# Compila la app.
#   tools/compilar.sh            -> APK de depuración
#   tools/compilar.sh release    -> APK release (sin firmar, con R8)
#   tools/compilar.sh test       -> tests unitarios
# Argumentos extra se pasan a Gradle, por ejemplo:
#   tools/compilar.sh debug -PjcpApiUrl=http://192.168.1.50:8000/api/v1/
set -euo pipefail
source "$(dirname "$0")/env.sh"; cd "$RAIZ"
if command -v cygpath >/dev/null 2>&1; then SDK="$(cygpath -m "$ANDROID_HOME")"; else SDK="$ANDROID_HOME"; fi
echo "sdk.dir=${SDK/:/\:}" > local.properties
MODO="${1:-debug}"; [ $# -gt 0 ] && shift
case "$MODO" in
  debug)   TAREA=":app:assembleDebug" ;;
  release) TAREA=":app:assembleRelease" ;;
  test)    TAREA=":app:testDebugUnitTest" ;;
  *) echo "Uso: $0 [debug|release|test] [argumentos de gradle]"; exit 1 ;;
esac
./gradlew --console=plain "$TAREA" "$@"
[ "$MODO" = test ] || find app/build/outputs/apk -name '*.apk'
