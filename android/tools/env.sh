#!/usr/bin/env bash
# Variables del entorno de compilación. Uso: source tools/env.sh
# Reutiliza el JDK y el Android SDK que están en ../../app-mando-facil/.tools (relativo a android/).
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HERRAMIENTAS="$(cd "$RAIZ/../../app-mando-facil/.tools" && pwd)"
export JAVA_HOME="$HERRAMIENTAS/jdk"
export ANDROID_HOME="$HERRAMIENTAS/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
