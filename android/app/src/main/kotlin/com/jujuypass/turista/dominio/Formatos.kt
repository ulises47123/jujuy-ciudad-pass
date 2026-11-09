package com.jujuypass.turista.dominio

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt
import kotlin.math.roundToLong

/** Funciones puras de formateo (sin dependencias de Android, se testean en JVM). */
object Formatos {

    private val localeAr: Locale = Locale.forLanguageTag("es-AR")

    /**
     * Distancia legible: "35 m", "850 m", "1,2 km", "12 km".
     * Por debajo de 1 km se redondea a metros (a decenas desde 100 m); desde 10 km sin decimales.
     */
    fun distancia(metros: Double): String {
        if (metros.isNaN() || metros < 0) return "—"
        return when {
            metros < 100 -> "${metros.roundToInt()} m"
            metros < 995 -> "${(metros / 10).roundToLong() * 10} m"
            metros < 9_950 -> {
                val km = (metros / 100).roundToLong() / 10.0
                String.format(localeAr, "%.1f km", km)
            }
            else -> "${(metros / 1000).roundToLong()} km"
        }
    }

    /** Metros enteros con separador de miles: "1.250 m". */
    fun metrosEnteros(metros: Double): String =
        String.format(localeAr, "%,d m", metros.roundToLong())

    private val formatoFecha = DateTimeFormatter.ofPattern("dd/MM/yyyy", localeAr)
    private val formatoFechaHora = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm", localeAr)

    /** Parsea ISO-8601 ("2026-11-07T15:04:05Z" u offsets). Devuelve null si no se puede. */
    fun parsearInstante(iso: String?): Instant? {
        if (iso.isNullOrBlank()) return null
        return try {
            Instant.parse(iso)
        } catch (_: Exception) {
            try {
                java.time.OffsetDateTime.parse(iso).toInstant()
            } catch (_: Exception) {
                try {
                    // Sin zona: se asume UTC (el contrato dice que las fechas van en UTC)
                    java.time.LocalDateTime.parse(iso).atZone(java.time.ZoneOffset.UTC).toInstant()
                } catch (_: Exception) {
                    null
                }
            }
        }
    }

    fun fecha(iso: String?, zona: ZoneId = ZoneId.systemDefault()): String =
        parsearInstante(iso)?.atZone(zona)?.format(formatoFecha) ?: (iso ?: "")

    fun fechaHora(iso: String?, zona: ZoneId = ZoneId.systemDefault()): String =
        parsearInstante(iso)?.atZone(zona)?.format(formatoFechaHora) ?: (iso ?: "")

    /** Multiplicador de temporada: 2.0 -> "x2", 1.5 -> "x1,5". */
    fun multiplicador(m: Double): String =
        if (m == Math.floor(m)) "x${m.toLong()}" else "x" + String.format(localeAr, "%.1f", m)

    /** Cuenta regresiva "m:ss". */
    fun cuentaRegresiva(segundos: Long): String {
        val s = segundos.coerceAtLeast(0)
        return "%d:%02d".format(s / 60, s % 60)
    }
}

/** Rangos del turista según puntos_historicos (sección 2 del contrato). */
object Rangos {
    const val NOVATO = "Novato"
    const val EXPLORADOR = "Explorador"
    const val MAESTRO = "Maestro Andino"

    data class Progreso(
        val rango: String,
        val siguiente: String?,
        /** Puntos que faltan para el siguiente rango (0 si ya está en el máximo). */
        val faltan: Int,
        /** Avance dentro del rango actual, 0..1. */
        val fraccion: Float,
    )

    fun rangoDe(puntosHistoricos: Int): String = when {
        puntosHistoricos < 150 -> NOVATO
        puntosHistoricos < 300 -> EXPLORADOR
        else -> MAESTRO
    }

    fun progreso(puntosHistoricos: Int): Progreso {
        val p = puntosHistoricos.coerceAtLeast(0)
        return when {
            p < 150 -> Progreso(NOVATO, EXPLORADOR, 150 - p, p / 150f)
            p < 300 -> Progreso(EXPLORADOR, MAESTRO, 300 - p, (p - 150) / 150f)
            else -> Progreso(MAESTRO, null, 0, 1f)
        }
    }
}
