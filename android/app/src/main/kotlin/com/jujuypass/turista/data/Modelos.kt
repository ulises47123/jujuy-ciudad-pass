package com.jujuypass.turista.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonPrimitive

// Objetos del contrato docs/API.md (sección 2 y 3). Campos opcionales con valor por defecto
// para tolerar respuestas parciales del backend.

@Serializable
data class Usuario(
    val id: Int = 0,
    val nombre: String = "",
    val email: String = "",
    val rol: String = "turista",
    val puntos: Int = 0,
    @SerialName("puntos_historicos") val puntosHistoricos: Int = 0,
    val rango: String? = null,
    val bloqueado: Boolean = false,
    @SerialName("creado_en") val creadoEn: String? = null,
)

@Serializable
data class Lugar(
    val id: Int,
    val nombre: String,
    val descripcion: String = "",
    val direccion: String = "",
    val categoria: String = "",
    val latitud: Double,
    val longitud: Double,
    @SerialName("radio_m") val radioM: Double = 100.0,
    val puntos: Int = 0,
    val visitado: Boolean = false,
)

@Serializable
data class NegocioResumen(
    val id: Int = 0,
    val nombre: String = "",
    val direccion: String? = null,
)

@Serializable
data class Beneficio(
    val id: Int,
    val titulo: String,
    val descripcion: String = "",
    val puntos: Int,
    @SerialName("dias_validez") val diasValidez: Int = 0,
    @SerialName("stock_restante") val stockRestante: Int? = null,
    val negocio: NegocioResumen? = null,
)

@Serializable
data class BeneficioDeCanje(
    val id: Int = 0,
    val titulo: String = "",
    @SerialName("negocio_nombre") val negocioNombre: String? = null,
)

@Serializable
data class Canje(
    val id: Int,
    val codigo: String,
    val estado: String,
    val beneficio: BeneficioDeCanje = BeneficioDeCanje(),
    val puntos: Int = 0,
    @SerialName("creado_en") val creadoEn: String? = null,
    @SerialName("vence_en") val venceEn: String? = null,
    @SerialName("usado_en") val usadoEn: String? = null,
    @SerialName("puntos_restantes") val puntosRestantes: Int? = null,
) {
    companion object {
        const val DISPONIBLE = "DISPONIBLE"
        const val USADO = "USADO"
        const val VENCIDO = "VENCIDO"
        const val ANULADO = "ANULADO"
    }
}

@Serializable
data class Visita(
    @SerialName("lugar_id") val lugarId: Int,
    @SerialName("lugar_nombre") val lugarNombre: String = "",
    val puntos: Int = 0,
    val fecha: String? = null,
)

@Serializable
data class Recomendacion(
    val id: Int,
    val titulo: String,
    val categoria: String = "",
    val descripcion: String = "",
    @SerialName("autor_nombre") val autorNombre: String = "",
    val fecha: String? = null,
)

// ---- Cuerpos de pedidos y respuestas ----

@Serializable
data class LoginPedido(
    val email: String,
    val password: String,
    val cliente: String = "app",
    @SerialName("dispositivo_id") val dispositivoId: String,
)

@Serializable
data class RegistroPedido(
    val nombre: String,
    val email: String,
    val password: String,
    val procedencia: String? = null,
    @SerialName("dispositivo_id") val dispositivoId: String,
)

@Serializable
data class SesionRespuesta(val token: String, val usuario: Usuario)

@Serializable
data class YoRespuesta(val usuario: Usuario)

@Serializable
data class CambiarPasswordPedido(val actual: String, val nueva: String)

@Serializable
data class OkRespuesta(val ok: Boolean = true)

/** Muestra GPS tal como la espera el servidor. tiempo_ms está en el reloj del dispositivo. */
@Serializable
data class MuestraGps(
    val lat: Double,
    val lon: Double,
    @SerialName("precision_m") val precisionM: Double,
    @SerialName("tiempo_ms") val tiempoMs: Long,
    val mock: Boolean,
)

@Serializable
data class IniciarVisitaPedido(
    @SerialName("lugar_id") val lugarId: Int,
    @SerialName("dispositivo_id") val dispositivoId: String,
    @SerialName("reloj_ms") val relojMs: Long,
    val muestras: List<MuestraGps>,
)

@Serializable
data class IniciarVisitaRespuesta(
    @SerialName("intento_id") val intentoId: JsonPrimitive, // número o texto: se devuelve tal cual
    val pregunta: String,
    val opciones: List<String>,
    @SerialName("expira_en_s") val expiraEnS: Int = 120,
)

@Serializable
data class ResponderPedido(
    @SerialName("intento_id") val intentoId: JsonPrimitive, // número o texto: se devuelve tal cual
    @SerialName("opcion_index") val opcionIndex: Int,
    val muestra: MuestraGps,
    @SerialName("reloj_ms") val relojMs: Long,
)

@Serializable
data class ResponderRespuesta(
    val correcta: Boolean,
    @SerialName("puntos_ganados") val puntosGanados: Int? = null,
    val puntos: Int? = null,
    @SerialName("puntos_historicos") val puntosHistoricos: Int? = null,
    val rango: String? = null,
    @SerialName("intentos_restantes") val intentosRestantes: Int? = null,
    /** Multiplicador de temporada aplicado (sección 6). */
    val multiplicador: Double? = null,
)

@Serializable
data class CanjearPedido(@SerialName("beneficio_id") val beneficioId: Int)

@Serializable
data class SaludRespuesta(val ok: Boolean = false, val version: String? = null)
