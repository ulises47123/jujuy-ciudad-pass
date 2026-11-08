package com.jujuypass.turista

import com.jujuypass.turista.data.Beneficio
import com.jujuypass.turista.data.IniciarVisitaRespuesta
import com.jujuypass.turista.data.Lugar
import com.jujuypass.turista.data.Recomendacion
import com.jujuypass.turista.data.ResponderRespuesta
import com.jujuypass.turista.data.SesionRespuesta
import com.jujuypass.turista.dominio.Codigos
import com.jujuypass.turista.dominio.Errores
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Respuestas reales del backend (backend/, seed-demo) decodificadas con los modelos de la app. */
class ContratoTest {
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true; isLenient = true }

    @Test
    fun login() {
        val r = json.decodeFromString(
            SesionRespuesta.serializer(),
            """{"token":"QNXZ","usuario":{"id":1,"nombre":"Turista Demo","email":"turista@demo.jujuypass.ar","rol":"turista","puntos":0,"puntos_historicos":0,"puntos_comunidad":0,"rango":"Novato","bloqueado":false,"creado_en":"2026-11-08T01:27:44Z","negocio":null}}""",
        )
        assertEquals("QNXZ", r.token)
        assertEquals("Novato", r.usuario.rango)
    }

    @Test
    fun lugares_con_radio_entero() {
        val l = json.decodeFromString(
            ListSerializer(Lugar.serializer()),
            """[{"id":1,"nombre":"Cabildo de Jujuy","descripcion":"x","direccion":"Plaza Belgrano","categoria":"Historia","latitud":-24.18542,"longitud":-65.29952,"radio_m":80,"puntos":50,"visitado":false}]""",
        )
        assertEquals(80.0, l[0].radioM, 0.0)
        assertFalse(l[0].visitado)
    }

    @Test
    fun beneficios_con_stock_nulo_y_numerico() {
        val b = json.decodeFromString(
            ListSerializer(Beneficio.serializer()),
            """[{"id":6,"titulo":"Cucurucho","descripcion":"x","puntos":80,"dias_validez":15,"stock_restante":100,"negocio":{"id":4,"nombre":"Heladería","direccion":"Senador Pérez 410"}},
               {"id":1,"titulo":"2x1","descripcion":"y","puntos":100,"dias_validez":30,"stock_restante":null,"negocio":{"id":1,"nombre":"Café","direccion":"Belgrano 650"}}]""",
        )
        assertEquals(100, b[0].stockRestante)
        assertNull(b[1].stockRestante)
    }

    @Test
    fun recomendaciones_y_visitas() {
        val r = json.decodeFromString(
            ListSerializer(Recomendacion.serializer()),
            """[{"id":1,"titulo":"Tamales","categoria":"Gastronomía","descripcion":"x","autor_nombre":"Vecina Demo","fecha":"2026-11-08T01:27:44Z"}]""",
        )
        assertEquals("Vecina Demo", r[0].autorNombre)
    }

    @Test
    fun iniciar_y_responder() {
        val i = json.decodeFromString(
            IniciarVisitaRespuesta.serializer(),
            """{"intento_id":1,"pregunta":"¿Qué museo?","opciones":["A","B","C"],"expira_en_s":120}""",
        )
        assertEquals(JsonPrimitive(1), i.intentoId)
        val mal = json.decodeFromString(ResponderRespuesta.serializer(), """{"correcta":false,"intentos_restantes":2}""")
        assertFalse(mal.correcta)
        assertEquals(2, mal.intentosRestantes)
        val bien = json.decodeFromString(
            ResponderRespuesta.serializer(),
            """{"correcta":true,"puntos_ganados":100,"puntos":100,"puntos_historicos":100,"rango":"Novato","multiplicador":2.0}""",
        )
        assertTrue(bien.correcta)
        assertEquals(2.0, bien.multiplicador!!, 0.0)
    }

    @Test
    fun errores_reales() {
        val fuera = Errores.desdeRespuesta(
            403,
            """{"error":{"codigo":"FUERA_DE_RANGO","mensaje":"Todavía no estás en el lugar. Acercate un poco más.","datos":{"distancia_m":334,"radio_m":80}}}""",
        )
        assertEquals(334.0, Errores.numero(fuera.datos, "distancia_m")!!, 0.0)
        val usado = Errores.desdeRespuesta(409, """{"error":{"codigo":"INTENTO_USADO","mensaje":"Este intento ya fue respondido."}}""")
        assertEquals(Codigos.INTENTO_USADO, usado.codigo)
        val pass = Errores.desdeRespuesta(400, """{"error":{"codigo":"PASSWORD_ACTUAL_INCORRECTA","mensaje":"La contraseña actual no es correcta."}}""")
        assertFalse(Errores.esSesionInvalida(pass))
        val login = Errores.desdeRespuesta(401, """{"error":{"codigo":"CREDENCIALES_INVALIDAS","mensaje":"Email o contraseña incorrectos."}}""")
        assertFalse(Errores.esSesionInvalida(login))
        val noAuth = Errores.desdeRespuesta(401, """{"error":{"codigo":"NO_AUTENTICADO","mensaje":"Tenés que iniciar sesión."}}""")
        assertTrue(Errores.esSesionInvalida(noAuth))
    }
}
