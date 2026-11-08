package com.jujuypass.turista.dominio

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull

/** Error de cualquier operación contra la API, ya clasificado. */
sealed class FalloApi(mensaje: String) : Exception(mensaje) {
    /** El servidor respondió con el formato {error:{codigo,mensaje,datos}} (o algo parecido). */
    class Servidor(
        val http: Int,
        val codigo: String,
        val mensajeServidor: String?,
        val datos: JsonObject?,
    ) : FalloApi("$http $codigo")

    /** No hay red / no se pudo conectar / se cortó la conexión. */
    class SinConexion(causa: Throwable? = null) : FalloApi("sin conexión") {
        init { causa?.let { initCause(it) } }
    }

    /** El servidor tardó demasiado. */
    class Tiempo : FalloApi("timeout")

    /** Respuesta que no pudimos interpretar. */
    class Inesperado(val detalle: String) : FalloApi(detalle)
}

/** Códigos de error del contrato (sección 1 y 3). */
object Codigos {
    const val NO_AUTENTICADO = "NO_AUTENTICADO"
    const val SESION_EXPIRADA = "SESION_EXPIRADA"
    const val CREDENCIALES_INVALIDAS = "CREDENCIALES_INVALIDAS"
    const val FUERA_DE_RANGO = "FUERA_DE_RANGO"
    const val PRECISION_INSUFICIENTE = "PRECISION_INSUFICIENTE"
    const val PUNTOS_INSUFICIENTES = "PUNTOS_INSUFICIENTES"
    const val INTENTO_EXPIRADO = "INTENTO_EXPIRADO"
    const val YA_VISITADO = "YA_VISITADO"
    const val INTENTO_USADO = "INTENTO_USADO"
    const val MUESTRAS_INVALIDAS = "MUESTRAS_INVALIDAS"
    const val NO_ENCONTRADO = "NO_ENCONTRADO"
    const val ROL_NO_PERMITIDO_EN_CLIENTE = "ROL_NO_PERMITIDO_EN_CLIENTE"
}

/** Textos que dependen de recursos de Android; se inyectan para poder testear sin Android. */
interface TextosError {
    fun sinConexion(): String
    fun tiempo(): String
    fun inesperado(): String
    fun http(codigo: Int): String
    /** Línea extra para FUERA_DE_RANGO. [distancia] y [radio] ya formateados. */
    fun fueraDeRango(distancia: String, radio: String?): String
    fun precision(precision: String): String
    fun puntosInsuficientes(tenes: Int, necesitas: Int): String
}

object Errores {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    @Serializable
    private data class Envoltorio(val error: Cuerpo? = null, val detail: JsonElement? = null)

    @Serializable
    private data class Cuerpo(
        val codigo: String? = null,
        val mensaje: String? = null,
        val datos: JsonElement? = null,
    )

    /** Convierte una respuesta HTTP no exitosa en [FalloApi.Servidor]. Nunca lanza. */
    fun desdeRespuesta(http: Int, cuerpo: String?): FalloApi.Servidor {
        val parseado = try {
            if (cuerpo.isNullOrBlank()) null else json.decodeFromString(Envoltorio.serializer(), cuerpo)
        } catch (_: Exception) {
            null
        }
        val e = parseado?.error
        val codigo = e?.codigo?.takeIf { it.isNotBlank() } ?: codigoPorDefecto(http)
        val mensaje = e?.mensaje?.takeIf { it.isNotBlank() }
            ?: (parseado?.detail as? JsonPrimitive)?.takeIf { it.isString }?.content
        return FalloApi.Servidor(http, codigo, mensaje, e?.datos as? JsonObject)
    }

    fun codigoPorDefecto(http: Int): String = when (http) {
        401 -> Codigos.NO_AUTENTICADO
        403 -> "PROHIBIDO"
        404 -> "NO_ENCONTRADO"
        409 -> "CONFLICTO"
        410 -> Codigos.INTENTO_EXPIRADO
        422 -> "DATOS_INVALIDOS"
        429 -> "DEMASIADOS_INTENTOS"
        in 500..599 -> "ERROR_INTERNO"
        else -> "HTTP_$http"
    }

    /**
     * ¿Este error implica que la sesión ya no sirve y hay que volver al login?
     * Cualquier 401 (NO_AUTENTICADO / SESION_EXPIRADA) salvo CREDENCIALES_INVALIDAS, que es un login fallido
     * y no una sesión inválida. (La contraseña actual incorrecta da 400 PASSWORD_ACTUAL_INCORRECTA.)
     */
    fun esSesionInvalida(f: FalloApi): Boolean =
        f is FalloApi.Servidor && f.http == 401 && f.codigo != Codigos.CREDENCIALES_INVALIDAS

    fun numero(datos: JsonObject?, clave: String): Double? =
        (datos?.get(clave) as? JsonPrimitive)?.doubleOrNull

    fun entero(datos: JsonObject?, clave: String): Int? =
        (datos?.get(clave) as? JsonPrimitive)?.let { it.intOrNull ?: it.doubleOrNull?.toInt() }

    /** Texto para mostrarle al usuario: siempre prioriza el "mensaje" del servidor. */
    fun describir(f: Throwable, t: TextosError): String = when (f) {
        is FalloApi.SinConexion -> t.sinConexion()
        is FalloApi.Tiempo -> t.tiempo()
        is FalloApi.Inesperado -> t.inesperado()
        is FalloApi.Servidor -> {
            val base = f.mensajeServidor ?: t.http(f.http)
            val extra = when (f.codigo) {
                Codigos.FUERA_DE_RANGO -> numero(f.datos, "distancia_m")?.let { d ->
                    t.fueraDeRango(
                        Formatos.distancia(d),
                        numero(f.datos, "radio_m")?.let { Formatos.metrosEnteros(it) },
                    )
                }
                Codigos.PRECISION_INSUFICIENTE -> numero(f.datos, "precision_m")?.let {
                    t.precision(Formatos.metrosEnteros(it))
                }
                Codigos.PUNTOS_INSUFICIENTES -> {
                    val p = entero(f.datos, "puntos")
                    val n = entero(f.datos, "necesarios")
                    if (p != null && n != null) t.puntosInsuficientes(p, n) else null
                }
                else -> null
            }
            if (extra == null || base.contains(extra)) base else "$base\n$extra"
        }
        else -> t.inesperado()
    }
}
