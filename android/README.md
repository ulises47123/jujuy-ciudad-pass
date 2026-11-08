# Jujuy Pass — app Android para turistas

App nativa (Kotlin + Jetpack Compose + Material 3) para los turistas de Jujuy Ciudad Pass.
El contrato con el backend está en `../docs/API.md`.

- `applicationId`: `com.jujuypass.turista` · minSdk 26 · targetSdk 35 · compileSdk 37
- AGP 9.3.0 · Kotlin 2.4.10 · Gradle 9.6.1 · Compose BOM 2026.06.01
- Red: OkHttp 5 + kotlinx.serialization · Mapa: osmdroid (OpenStreetMap) · QR: ZXing
- Ubicación: FusedLocationProvider (Google Play Services) o `LocationManager` (GPS) si no hay Play Services

## Compilar

No hace falta Android Studio. El JDK y el Android SDK se toman de `../../app-mando-facil/.tools`
(ver `tools/env.sh`). Desde la carpeta `android/` en Git Bash:

```bash
tools/compilar.sh            # APK debug   -> app/build/outputs/apk/debug/JujuyPass-debug.apk
tools/compilar.sh release    # APK release sin firmar, con R8 -> app/build/outputs/apk/release/JujuyPass-release-unsigned.apk
tools/compilar.sh test       # tests unitarios (testDebugUnitTest)
```

La APK release sale **sin firmar**: para instalarla hay que firmarla (`apksigner`) con la clave de producción.

## URL del servidor

La URL base sale de la propiedad de Gradle `jcpApiUrl` (tiene que terminar en `/api/v1/`).
Por defecto es `https://jujuypass.example/api/v1/` (placeholder). Para cambiarla al compilar:

```bash
tools/compilar.sh release -PjcpApiUrl=https://mi-dominio.com.ar/api/v1/
```

o editando `jcpApiUrl` en `gradle.properties`.

## Probar contra la PC en la red local (solo debug)

1. Levantar el backend escuchando en todas las interfaces:
   `uvicorn app.main:app --host 0.0.0.0 --port 8000` (ver `docs/API.md`, sección 5).
2. Averiguar la IP de la PC en la LAN (`ipconfig`), por ejemplo `192.168.1.50`. Permitir el puerto 8000 en el firewall de Windows.
3. En la app debug, en la pantalla de login, **mantener apretado el logo**: se abre la pantalla "Servidor (debug)".
4. Escribir `http://192.168.1.50:8000/api/v1/`, tocar **Probar conexión** (llama a `GET /salud`) y **Guardar**.

También se puede compilar la debug ya apuntando a la PC: `tools/compilar.sh debug -PjcpApiUrl=http://192.168.1.50:8000/api/v1/`.

El tráfico `http://` sin cifrar solo está permitido en debug (`src/debug/res/xml/network_security_config.xml`).
En release solo se permite HTTPS y la pantalla de servidor no existe.

## Notas

- El token (Bearer) y el `dispositivo_id` (UUID generado una vez) se guardan en las preferencias privadas
  de la app, excluidas de los backups.
- Un 401 en cualquier pedido autenticado borra la sesión y vuelve al login.
- "Estoy aquí" toma 4 muestras GPS de alta precisión (una cada ~2 s), marca las ubicaciones falsas (`isMock` /
  `isFromMockProvider`) y manda `POST /visitas/iniciar` con `reloj_ms`. Los `tiempo_ms` de las muestras se
  expresan en el reloj del teléfono (no en la hora GPS) para que el servidor pueda corregir el desfase con `reloj_ms`.
