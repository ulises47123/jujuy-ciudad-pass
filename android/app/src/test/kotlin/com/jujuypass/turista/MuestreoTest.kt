package com.jujuypass.turista

import com.jujuypass.turista.data.IniciarVisitaPedido
import com.jujuypass.turista.data.IniciarVisitaRespuesta
import com.jujuypass.turista.data.MuestraGps
import com.jujuypass.turista.data.ResponderPedido
import com.jujuypass.turista.ubicacion.ColectorMuestras
import com.jujuypass.turista.ubicacion.Lectura
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MuestreoTest {

    private fun lectura(t: Long, edad: Long = 0, mock: Boolean = false, precision: Double? = 8.0) =
        Lectura(lat = -24.18567, lon = -65.30012, precisionM = precision, tiempoMs = t, edadMs = edad, mock = mock)

    @Test
    fun junta_cuatro_muestras_separadas_al_menos_dos_segundos() {
        val c = ColectorMuestras(objetivo = 4)
        val t0 = 1_762_527_835_000L
        // Llegan lecturas cada 1 s: solo se aceptan cada 2 s
        val aceptadas = (0..6).map { c.ofrecer(lectura(t0 + it * 1_000L)) }
        assertEquals(listOf(true, false, true, false, true, false, true), aceptadas)
        assertTrue(c.completo)
        val m = c.muestras
        assertEquals(4, m.size)
        assertTrue(m.zipWithNext().all { (a, b) -> b.tiempoMs > a.tiempoMs })
        assertTrue(m.last().tiempoMs - m.first().tiempoMs >= 5_000)
        // Una vez completo no acepta más
        assertFalse(c.ofrecer(lectura(t0 + 10_000)))
    }

    @Test
    fun descarta_lecturas_viejas_de_cache() {
        val c = ColectorMuestras()
        assertFalse(c.ofrecer(lectura(1_000, edad = 60_000)))
        assertEquals(0, c.cantidad)
        assertTrue(c.ofrecer(lectura(70_000, edad = 500)))
    }

    @Test
    fun descarta_coordenadas_invalidas() {
        val c = ColectorMuestras()
        assertFalse(c.ofrecer(Lectura(0.0, 0.0, 5.0, 1_000, 0, false)))
        assertFalse(c.ofrecer(Lectura(Double.NaN, -65.0, 5.0, 1_000, 0, false)))
    }

    @Test
    fun exige_duracion_minima_aunque_tenga_la_cantidad() {
        val c = ColectorMuestras(objetivo = 3, separacionMinMs = 1_000, duracionMinMs = 5_000)
        c.ofrecer(lectura(0)); c.ofrecer(lectura(1_000)); c.ofrecer(lectura(2_000))
        assertEquals(3, c.cantidad)
        assertFalse(c.completo)
        assertTrue(c.ofrecer(lectura(5_000)))
        assertTrue(c.completo)
    }

    @Test
    fun conserva_la_marca_mock_y_precision_desconocida() {
        val c = ColectorMuestras(objetivo = 2)
        c.ofrecer(lectura(0, mock = true, precision = null))
        c.ofrecer(lectura(6_000))
        assertTrue(c.algunaFalsa)
        assertEquals(999.0, c.muestras.first().precisionM, 0.0)
        assertTrue(c.muestras.first().mock)
    }

    @Test
    fun exige_precision_mientras_el_gps_calienta() {
        val c = ColectorMuestras(objetivo = 2, precisionMaxM = 40.0)
        assertFalse(c.ofrecer(lectura(0, precision = 120.0), exigirPrecision = true))
        assertFalse(c.ofrecer(lectura(1_000, precision = null), exigirPrecision = true))
        assertTrue(c.ofrecer(lectura(2_000, precision = 12.0), exigirPrecision = true))
        // Pasado el tiempo de espera se acepta aunque sea imprecisa (el servidor decide)
        assertTrue(c.ofrecer(lectura(8_000, precision = 120.0), exigirPrecision = false))
        assertTrue(c.completo)
    }

    @Test
    fun una_sola_muestra_para_responder() {
        val c = ColectorMuestras(objetivo = 1)
        assertTrue(c.ofrecer(lectura(1_000)))
        assertTrue(c.completo)
    }

    @Test
    fun tiempo_en_reloj_del_dispositivo() {
        // La lectura se tomó 1,5 s antes de "ahora" según el reloj monotónico
        val t = ColectorMuestras.tiempoEnRelojDispositivo(
            ahoraMs = 1_762_527_845_000L,
            ahoraElapsedNs = 10_000_000_000L,
            lecturaElapsedNs = 8_500_000_000L,
        )
        assertEquals(1_762_527_843_500L, t)
    }

    @Test
    fun json_de_iniciar_visita_respeta_el_contrato() {
        val json = Json { explicitNulls = false }
        val pedido = IniciarVisitaPedido(
            lugarId = 1,
            dispositivoId = "uuid",
            relojMs = 1_762_527_845_000L,
            muestras = listOf(MuestraGps(-24.18567, -65.30012, 12.5, 1_762_527_835_000L, false)),
        )
        val o = json.parseToJsonElement(json.encodeToString(IniciarVisitaPedido.serializer(), pedido)).jsonObject
        assertEquals(setOf("lugar_id", "dispositivo_id", "reloj_ms", "muestras"), o.keys)
        val m = o["muestras"]!!.jsonArray[0].jsonObject
        assertEquals(setOf("lat", "lon", "precision_m", "tiempo_ms", "mock"), m.keys)
        assertEquals(1_762_527_835_000L, m["tiempo_ms"]!!.jsonPrimitive.long)
    }

    @Test
    fun intento_id_numerico_o_texto_se_devuelve_igual() {
        val json = Json { ignoreUnknownKeys = true }
        val num = json.decodeFromString(IniciarVisitaRespuesta.serializer(), """{"intento_id":42,"pregunta":"¿?","opciones":["a","b"],"expira_en_s":120}""")
        val txt = json.decodeFromString(IniciarVisitaRespuesta.serializer(), """{"intento_id":"ab-12","pregunta":"¿?","opciones":["a"],"expira_en_s":90}""")
        val muestra = MuestraGps(-24.0, -65.0, 5.0, 1L, false)
        val a = json.parseToJsonElement(json.encodeToString(ResponderPedido.serializer(), ResponderPedido(num.intentoId, 1, muestra, 2L))).jsonObject
        val b = json.parseToJsonElement(json.encodeToString(ResponderPedido.serializer(), ResponderPedido(txt.intentoId, 0, muestra, 2L))).jsonObject
        assertEquals(JsonPrimitive(42), a["intento_id"])
        assertEquals(JsonPrimitive("ab-12"), b["intento_id"])
        assertEquals(setOf("intento_id", "opcion_index", "muestra", "reloj_ms"), a.keys)
    }
}
