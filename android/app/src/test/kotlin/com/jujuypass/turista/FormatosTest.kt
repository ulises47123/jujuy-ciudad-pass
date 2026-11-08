package com.jujuypass.turista

import com.jujuypass.turista.data.SesionStore
import com.jujuypass.turista.dominio.Formatos
import com.jujuypass.turista.dominio.Geo
import com.jujuypass.turista.dominio.Rangos
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneId

class FormatosTest {

    @Test
    fun distancias_cortas_en_metros() {
        assertEquals("0 m", Formatos.distancia(0.0))
        assertEquals("35 m", Formatos.distancia(35.4))
        assertEquals("99 m", Formatos.distancia(99.2))
        assertEquals("850 m", Formatos.distancia(847.0))
        assertEquals("990 m", Formatos.distancia(994.0))
    }

    @Test
    fun distancias_en_km_con_coma_decimal() {
        assertEquals("1,0 km", Formatos.distancia(996.0))
        assertEquals("1,2 km", Formatos.distancia(1_249.0))
        assertEquals("9,9 km", Formatos.distancia(9_940.0))
        assertEquals("10 km", Formatos.distancia(9_960.0))
        assertEquals("123 km", Formatos.distancia(123_400.0))
    }

    @Test
    fun distancia_invalida() {
        assertEquals("—", Formatos.distancia(Double.NaN))
        assertEquals("—", Formatos.distancia(-5.0))
    }

    @Test
    fun metros_enteros_con_separador_de_miles() {
        assertEquals("100 m", Formatos.metrosEnteros(100.0))
        assertEquals("1.250 m", Formatos.metrosEnteros(1_249.6))
    }

    @Test
    fun fechas_iso_utc_a_hora_argentina() {
        val ar = ZoneId.of("America/Argentina/Jujuy")
        assertEquals("07/11/2026 12:04", Formatos.fechaHora("2026-11-07T15:04:05Z", ar))
        assertEquals("07/11/2026", Formatos.fecha("2026-11-07T15:04:05Z", ar))
        // Con offset y sin zona (se asume UTC)
        assertEquals("07/11/2026 12:04", Formatos.fechaHora("2026-11-07T15:04:05+00:00", ar))
        assertEquals("07/11/2026 12:04", Formatos.fechaHora("2026-11-07T15:04:05", ar))
        assertNull(Formatos.parsearInstante("cualquier cosa"))
        assertEquals("", Formatos.fecha(null, ar))
    }

    @Test
    fun multiplicador_de_temporada() {
        assertEquals("x2", Formatos.multiplicador(2.0))
        assertEquals("x1,5", Formatos.multiplicador(1.5))
    }

    @Test
    fun cuenta_regresiva() {
        assertEquals("2:00", Formatos.cuentaRegresiva(120))
        assertEquals("0:09", Formatos.cuentaRegresiva(9))
        assertEquals("0:00", Formatos.cuentaRegresiva(-3))
    }

    @Test
    fun rangos_segun_puntos_historicos() {
        assertEquals(Rangos.NOVATO, Rangos.rangoDe(0))
        assertEquals(Rangos.NOVATO, Rangos.rangoDe(149))
        assertEquals(Rangos.EXPLORADOR, Rangos.rangoDe(150))
        assertEquals(Rangos.EXPLORADOR, Rangos.rangoDe(299))
        assertEquals(Rangos.MAESTRO, Rangos.rangoDe(300))

        val p = Rangos.progreso(270)
        assertEquals(Rangos.EXPLORADOR, p.rango)
        assertEquals(Rangos.MAESTRO, p.siguiente)
        assertEquals(30, p.faltan)
        assertEquals(0.8f, p.fraccion, 0.001f)

        val max = Rangos.progreso(1_000)
        assertNull(max.siguiente)
        assertEquals(0, max.faltan)
    }

    @Test
    fun haversine_aproximada() {
        // Cabildo de Jujuy -> ~111 m al norte (0.001° de latitud)
        val d = Geo.distanciaM(-24.18567, -65.30012, -24.18467, -65.30012)
        assertEquals(111.2, d, 0.5)
        assertEquals(0.0, Geo.distanciaM(-24.0, -65.0, -24.0, -65.0), 1e-9)
    }

    @Test
    fun normalizar_url_del_servidor() {
        assertEquals("http://192.168.1.5:8000/api/v1/", SesionStore.normalizarUrl(" 192.168.1.5:8000/api/v1 "))
        assertEquals("https://x.com/api/v1/", SesionStore.normalizarUrl("https://x.com/api/v1/"))
        assertTrue(SesionStore.normalizarUrl("http://a/api/v1").endsWith("/"))
    }
}
