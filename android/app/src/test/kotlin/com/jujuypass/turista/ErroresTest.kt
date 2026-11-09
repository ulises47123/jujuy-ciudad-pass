package com.jujuypass.turista

import com.jujuypass.turista.dominio.Codigos
import com.jujuypass.turista.dominio.Errores
import com.jujuypass.turista.dominio.FalloApi
import com.jujuypass.turista.dominio.TextosError
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ErroresTest {

    private val textos = object : TextosError {
        override fun sinConexion() = "SIN_RED"
        override fun tiempo() = "TIMEOUT"
        override fun inesperado() = "INESPERADO"
        override fun http(codigo: Int) = "HTTP $codigo"
        override fun fueraDeRango(distancia: String, radio: String?) =
            if (radio != null) "Estás a $distancia (radio $radio)" else "Estás a $distancia"
        override fun precision(precision: String) = "Precisión $precision"
        override fun puntosInsuficientes(tenes: Int, necesitas: Int) = "Tenés $tenes, necesitás $necesitas"
    }

    @Test
    fun parsea_formato_del_contrato() {
        val f = Errores.desdeRespuesta(
            409,
            """{"error":{"codigo":"EMAIL_EN_USO","mensaje":"Ese email ya está registrado","datos":null}}""",
        )
        assertEquals(409, f.http)
        assertEquals("EMAIL_EN_USO", f.codigo)
        assertEquals("Ese email ya está registrado", Errores.describir(f, textos))
    }

    @Test
    fun fuera_de_rango_muestra_la_distancia() {
        val f = Errores.desdeRespuesta(
            403,
            """{"error":{"codigo":"FUERA_DE_RANGO","mensaje":"No estás en el lugar","datos":{"distancia_m":347.6,"radio_m":100}}}""",
        )
        assertEquals(Codigos.FUERA_DE_RANGO, f.codigo)
        assertEquals("No estás en el lugar\nEstás a 350 m (radio 100 m)", Errores.describir(f, textos))
    }

    @Test
    fun fuera_de_rango_en_km_y_sin_radio() {
        val f = Errores.desdeRespuesta(
            403,
            """{"error":{"codigo":"FUERA_DE_RANGO","mensaje":"Lejos","datos":{"distancia_m":2540}}}""",
        )
        assertEquals("Lejos\nEstás a 2,5 km", Errores.describir(f, textos))
    }

    @Test
    fun precision_y_puntos_insuficientes() {
        val p = Errores.desdeRespuesta(422, """{"error":{"codigo":"PRECISION_INSUFICIENTE","mensaje":"GPS impreciso","datos":{"precision_m":83.2}}}""")
        assertEquals("GPS impreciso\nPrecisión 83 m", Errores.describir(p, textos))
        val q = Errores.desdeRespuesta(409, """{"error":{"codigo":"PUNTOS_INSUFICIENTES","mensaje":"No te alcanza","datos":{"puntos":40,"necesarios":100}}}""")
        assertEquals("No te alcanza\nTenés 40, necesitás 100", Errores.describir(q, textos))
    }

    @Test
    fun cuerpo_no_json_usa_codigo_por_http() {
        val f = Errores.desdeRespuesta(502, "<html>Bad gateway</html>")
        assertEquals("ERROR_INTERNO", f.codigo)
        assertNull(f.mensajeServidor)
        assertEquals("HTTP 502", Errores.describir(f, textos))
        assertEquals(Codigos.NO_AUTENTICADO, Errores.desdeRespuesta(401, "").codigo)
        assertEquals(Codigos.INTENTO_EXPIRADO, Errores.desdeRespuesta(410, null).codigo)
    }

    @Test
    fun detail_de_fastapi_como_respaldo() {
        val f = Errores.desdeRespuesta(404, """{"detail":"Not Found"}""")
        assertEquals("NO_ENCONTRADO", f.codigo)
        assertEquals("Not Found", Errores.describir(f, textos))
    }

    @Test
    fun campos_desconocidos_se_ignoran() {
        val f = Errores.desdeRespuesta(429, """{"error":{"codigo":"DEMASIADOS_INTENTOS","mensaje":"Esperá","extra":1},"otro":true}""")
        assertEquals("DEMASIADOS_INTENTOS", f.codigo)
        assertEquals("Esperá", Errores.describir(f, textos))
    }

    @Test
    fun errores_de_red() {
        assertEquals("SIN_RED", Errores.describir(FalloApi.SinConexion(), textos))
        assertEquals("TIMEOUT", Errores.describir(FalloApi.Tiempo(), textos))
        assertEquals("INESPERADO", Errores.describir(FalloApi.Inesperado("x"), textos))
        assertEquals("INESPERADO", Errores.describir(IllegalStateException(), textos))
    }

    @Test
    fun solo_401_de_sesion_invalida_la_sesion() {
        assertTrue(Errores.esSesionInvalida(Errores.desdeRespuesta(401, """{"error":{"codigo":"SESION_EXPIRADA","mensaje":"x"}}""")))
        assertFalse(Errores.esSesionInvalida(Errores.desdeRespuesta(403, """{"error":{"codigo":"UBICACION_FALSA","mensaje":"x"}}""")))
        assertFalse(Errores.esSesionInvalida(FalloApi.SinConexion()))
        assertFalse(Errores.esSesionInvalida(Errores.desdeRespuesta(401, """{"error":{"codigo":"CREDENCIALES_INVALIDAS","mensaje":"x"}}""")))
        assertTrue(Errores.esSesionInvalida(Errores.desdeRespuesta(401, "")))
    }
}
