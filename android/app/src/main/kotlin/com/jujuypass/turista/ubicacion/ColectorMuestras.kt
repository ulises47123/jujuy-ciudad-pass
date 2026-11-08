package com.jujuypass.turista.ubicacion

import com.jujuypass.turista.data.MuestraGps

/** Una lectura de ubicación ya convertida (independiente de Android, para poder testearla). */
data class Lectura(
    val lat: Double,
    val lon: Double,
    /** Precisión horizontal en metros, o null si el proveedor no la informa. */
    val precisionM: Double?,
    /** Momento de la lectura en el reloj del dispositivo (ms desde epoch). */
    val tiempoMs: Long,
    /** Antigüedad de la lectura al recibirla (ms). */
    val edadMs: Long,
    val mock: Boolean,
)

/**
 * Política de muestreo para "Estoy aquí". Acepta lecturas que:
 *  - sean frescas (edad <= [edadMaxMs], descarta ubicaciones viejas en caché),
 *  - estén separadas al menos [separacionMinMs] de la anterior aceptada (tiempo_ms creciente).
 * Termina cuando hay [objetivo] muestras y entre la primera y la última pasaron >= [duracionMinMs].
 * El servidor exige 3 a 10 muestras crecientes con >= 5 s entre la primera y la última.
 */
class ColectorMuestras(
    val objetivo: Int = 4,
    private val separacionMinMs: Long = 2_000,
    private val duracionMinMs: Long = 5_000,
    private val edadMaxMs: Long = 10_000,
    private val precisionDesconocidaM: Double = 999.0,
    /** Precisión exigida mientras el GPS "calienta" (el servidor rechaza si la mediana supera 50 m). */
    private val precisionMaxM: Double = 40.0,
) {
    private val lista = mutableListOf<MuestraGps>()
    val muestras: List<MuestraGps> get() = lista.toList()
    val cantidad: Int get() = lista.size

    val completo: Boolean
        get() = lista.size >= objetivo &&
            (objetivo < 2 || lista.last().tiempoMs - lista.first().tiempoMs >= duracionMinMs)

    /**
     * Devuelve true si la lectura se aceptó como nueva muestra.
     * Con [exigirPrecision] se descartan lecturas con precisión peor que [precisionMaxM] o desconocida;
     * pasado un rato se llama con false para no quedarse esperando indefinidamente.
     */
    fun ofrecer(l: Lectura, exigirPrecision: Boolean = false): Boolean {
        if (completo) return false
        if (l.edadMs > edadMaxMs) return false
        if (exigirPrecision && (l.precisionM == null || l.precisionM > precisionMaxM)) return false
        if (l.lat.isNaN() || l.lon.isNaN() || (l.lat == 0.0 && l.lon == 0.0)) return false
        val ultima = lista.lastOrNull()
        if (ultima != null && l.tiempoMs - ultima.tiempoMs < separacionMinMs) return false
        lista += MuestraGps(
            lat = l.lat,
            lon = l.lon,
            precisionM = l.precisionM?.takeIf { it > 0 && !it.isNaN() } ?: precisionDesconocidaM,
            tiempoMs = l.tiempoMs,
            mock = l.mock,
        )
        return true
    }

    val algunaFalsa: Boolean get() = lista.any { it.mock }

    companion object {
        /**
         * Pasa el instante de una lectura al reloj del dispositivo usando el reloj monotónico,
         * así queda en la misma base que reloj_ms (la hora GPS puede diferir del reloj del teléfono).
         */
        fun tiempoEnRelojDispositivo(ahoraMs: Long, ahoraElapsedNs: Long, lecturaElapsedNs: Long): Long {
            val edadMs = ((ahoraElapsedNs - lecturaElapsedNs) / 1_000_000).coerceAtLeast(0)
            return ahoraMs - edadMs
        }
    }
}
