package com.jujuypass.turista.ubicacion

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.Looper
import android.os.SystemClock
import androidx.core.content.ContextCompat
import androidx.core.location.LocationListenerCompat
import androidx.core.location.LocationManagerCompat
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.LocationSettingsRequest
import com.google.android.gms.location.Priority
import com.jujuypass.turista.data.MuestraGps
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.shareIn
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

/** No se pudieron juntar las muestras a tiempo (sin señal GPS). */
class SinSenalGps(val obtenidas: Int) : Exception("Sin señal GPS ($obtenidas muestras)")

/** La ubicación del teléfono está apagada. */
class UbicacionApagada : Exception("Ubicación apagada")

/**
 * Ubicación con FusedLocationProvider (Google Play Services) o, si no está disponible,
 * con LocationManager (GPS_PROVIDER). Marca las ubicaciones falsas (mock).
 */
class ProveedorUbicacion(private val context: Context, alcance: CoroutineScope) {

    private val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager

    val tienePlayServices: Boolean by lazy {
        try {
            GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS
        } catch (_: Throwable) {
            false
        }
    }

    fun permisoPreciso(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    fun permisoAlguno(): Boolean = permisoPreciso() ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    fun ubicacionActivada(): Boolean = LocationManagerCompat.isLocationEnabled(lm)

    fun gpsActivado(): Boolean = try {
        lm.isProviderEnabled(LocationManager.GPS_PROVIDER)
    } catch (_: Exception) {
        false
    }

    // ---------- Ubicación en vivo (para distancias y el mapa) ----------

    private val permisoCambio = MutableStateFlow(0)
    private var ultimoEstado: Pair<Boolean, Boolean>? = null

    /** Llamar después de que el usuario concede/niega el permiso o activa la ubicación. */
    fun notificarCambioPermiso() {
        ultimoEstado = permisoAlguno() to ubicacionActivada()
        permisoCambio.value++
    }

    /** Al volver a la app (por ejemplo desde Ajustes): reinicia el seguimiento solo si algo cambió. */
    fun revisarCambios() {
        val actual = permisoAlguno() to ubicacionActivada()
        if (actual != ultimoEstado) notificarCambioPermiso()
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    val enVivo: SharedFlow<Location> = permisoCambio
        .flatMapLatest {
            if (permisoAlguno()) {
                actualizaciones(intervaloMs = 4_000, alta = false).catch { /* proveedor caído: sin ubicación */ }
            } else {
                emptyFlow()
            }
        }
        .shareIn(alcance, SharingStarted.WhileSubscribed(5_000), replay = 1)

    /** Flujo de ubicaciones. Requiere permiso; si no lo hay, el flujo termina con SecurityException. */
    @SuppressLint("MissingPermission")
    fun actualizaciones(intervaloMs: Long, alta: Boolean): Flow<Location> = callbackFlow {
        if (!permisoAlguno()) throw SecurityException("Sin permiso de ubicación")
        if (tienePlayServices) {
            val cliente = LocationServices.getFusedLocationProviderClient(context)
            val pedido = LocationRequest.Builder(
                if (alta) Priority.PRIORITY_HIGH_ACCURACY else Priority.PRIORITY_BALANCED_POWER_ACCURACY,
                intervaloMs,
            )
                .setMinUpdateIntervalMillis(intervaloMs / 2)
                .setWaitForAccurateLocation(false)
                .setMaxUpdateDelayMillis(0)
                .build()
            val callback = object : LocationCallback() {
                override fun onLocationResult(r: LocationResult) {
                    r.locations.forEach { trySend(it) }
                }
            }
            cliente.requestLocationUpdates(pedido, callback, Looper.getMainLooper())
                .addOnFailureListener { close(it) }
            awaitClose { cliente.removeLocationUpdates(callback) }
        } else {
            val listener = LocationListenerCompat { trySend(it) }
            // Para muestrear se usa solo GPS; para la vista en vivo también la red si está.
            val proveedores = buildList {
                if (gpsActivado()) add(LocationManager.GPS_PROVIDER)
                if (!alta && runCatching { lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) }.getOrDefault(false)) {
                    add(LocationManager.NETWORK_PROVIDER)
                }
            }
            if (proveedores.isEmpty()) {
                close(UbicacionApagada())
            } else {
                for (p in proveedores) lm.requestLocationUpdates(p, intervaloMs, 0f, listener, Looper.getMainLooper())
            }
            awaitClose { lm.removeUpdates(listener) }
        }
    }

    // ---------- Muestreo para "Estoy aquí" ----------

    /**
     * Toma [objetivo] muestras con prioridad alta (una cada ~2 s: 6 a 8 s en total para 4).
     * [alProgreso] recibe la cantidad de muestras aceptadas. Lanza [SinSenalGps] si no alcanza a tiempo.
     */
    suspend fun tomarMuestras(
        objetivo: Int = 4,
        timeoutMs: Long = 45_000,
        esperaPrecisionMs: Long = 15_000,
        alProgreso: (Int) -> Unit = {},
    ): List<MuestraGps> {
        val colector = ColectorMuestras(objetivo = objetivo)
        val inicio = SystemClock.elapsedRealtime()
        withTimeoutOrNull(timeoutMs) {
            actualizaciones(intervaloMs = 1_000, alta = true).first { loc ->
                // Los primeros segundos solo se aceptan lecturas precisas (el GPS suele arrancar impreciso).
                val exigir = SystemClock.elapsedRealtime() - inicio < esperaPrecisionMs
                if (colector.ofrecer(aLectura(loc), exigirPrecision = exigir)) alProgreso(colector.cantidad)
                colector.completo
            }
        } ?: throw SinSenalGps(colector.cantidad)
        return colector.muestras
    }

    /** Una sola muestra fresca (para /visitas/responder). */
    suspend fun tomarUnaMuestra(timeoutMs: Long = 25_000): MuestraGps =
        tomarMuestras(objetivo = 1, timeoutMs = timeoutMs, esperaPrecisionMs = 10_000).first()

    // ---------- Configuración del GPS (diálogo de Google) ----------

    /**
     * Si hay Play Services, consulta si la configuración alcanza para alta precisión.
     * Devuelve la excepción (resoluble con el diálogo del sistema) o null si está bien / no aplica.
     */
    suspend fun verificarAjustesAltaPrecision(): Exception? {
        if (!tienePlayServices) return null
        val pedido = LocationSettingsRequest.Builder()
            .addLocationRequest(LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1_000).build())
            .setAlwaysShow(true)
            .build()
        return suspendCancellableCoroutine { cont ->
            LocationServices.getSettingsClient(context).checkLocationSettings(pedido)
                .addOnSuccessListener { if (cont.isActive) cont.resume(null) }
                .addOnFailureListener { if (cont.isActive) cont.resume(it) }
        }
    }

    companion object {
        fun esFalsa(loc: Location): Boolean =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                loc.isMock
            } else {
                @Suppress("DEPRECATION")
                loc.isFromMockProvider
            }

        fun aLectura(loc: Location): Lectura {
            val ahoraMs = System.currentTimeMillis()
            val ahoraNs = SystemClock.elapsedRealtimeNanos()
            val tiempo = ColectorMuestras.tiempoEnRelojDispositivo(ahoraMs, ahoraNs, loc.elapsedRealtimeNanos)
            return Lectura(
                lat = loc.latitude,
                lon = loc.longitude,
                precisionM = if (loc.hasAccuracy()) loc.accuracy.toDouble() else null,
                tiempoMs = tiempo,
                edadMs = ahoraMs - tiempo,
                mock = esFalsa(loc),
            )
        }
    }
}
