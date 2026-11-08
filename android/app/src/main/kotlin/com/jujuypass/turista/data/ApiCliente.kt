package com.jujuypass.turista.data

import com.jujuypass.turista.BuildConfig
import com.jujuypass.turista.dominio.Errores
import com.jujuypass.turista.dominio.FalloApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.io.InterruptedIOException
import java.net.SocketTimeoutException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Cliente HTTP de la API v1. Todas las llamadas son suspend y no bloquean el hilo principal
 * (OkHttp encola la llamada en su propio pool). Errores -> [FalloApi].
 * Un 401 en una petición autenticada cierra la sesión local (la UI vuelve al login).
 */
class ApiCliente(
    private val sesion: SesionStore,
    val json: Json,
) {
    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(20, TimeUnit.SECONDS)
        .callTimeout(30, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .addInterceptor { cadena ->
            cadena.proceed(
                cadena.request().newBuilder()
                    .header("User-Agent", "JujuyPass/${BuildConfig.VERSION_NAME} (Android)")
                    .header("Accept", "application/json")
                    .build(),
            )
        }
        .build()

    private val tipoJson = "application/json; charset=utf-8".toMediaType()

    private fun url(ruta: String, base: String = sesion.urlApi()): HttpUrl {
        val b = base.toHttpUrlOrNull() ?: throw FalloApi.Inesperado("URL del servidor inválida: $base")
        return b.resolve(ruta.trimStart('/')) ?: throw FalloApi.Inesperado("Ruta inválida: $ruta")
    }

    suspend fun <T> get(ruta: String, respuesta: KSerializer<T>, autenticado: Boolean = true): T =
        ejecutar(Request.Builder().url(url(ruta)).get(), respuesta, autenticado)

    suspend fun <B, T> post(
        ruta: String,
        cuerpo: B?,
        serCuerpo: KSerializer<B>?,
        respuesta: KSerializer<T>,
        autenticado: Boolean = true,
    ): T {
        val texto = if (cuerpo != null && serCuerpo != null) json.encodeToString(serCuerpo, cuerpo) else "{}"
        return ejecutar(Request.Builder().url(url(ruta)).post(texto.toRequestBody(tipoJson)), respuesta, autenticado)
    }

    /** GET /salud contra una URL arbitraria (pantalla de servidor en debug). */
    suspend fun probarSalud(base: String): SaludRespuesta =
        ejecutar(Request.Builder().url(url("salud", base)).get(), SaludRespuesta.serializer(), autenticado = false)

    private suspend fun <T> ejecutar(
        builder: Request.Builder,
        respuesta: KSerializer<T>,
        autenticado: Boolean,
    ): T {
        val token = if (autenticado) sesion.token.value else null
        if (token != null) builder.header("Authorization", "Bearer $token")
        val pedido = builder.build()

        val (codigo, texto) = try {
            http.newCall(pedido).esperar().use { r -> r.code to withContext(Dispatchers.IO) { r.body.string() } }
        } catch (e: SocketTimeoutException) {
            throw FalloApi.Tiempo()
        } catch (e: InterruptedIOException) {
            // callTimeout de OkHttp
            throw FalloApi.Tiempo()
        } catch (e: IOException) {
            throw FalloApi.SinConexion(e)
        }

        if (codigo !in 200..299) {
            val fallo = Errores.desdeRespuesta(codigo, texto)
            if (token != null && Errores.esSesionInvalida(fallo) && sesion.token.value == token) {
                sesion.cerrarSesion(expirada = true)
            }
            throw fallo
        }
        return try {
            json.decodeFromString(respuesta, texto.ifBlank { "{}" })
        } catch (e: Exception) {
            throw FalloApi.Inesperado("Respuesta inválida del servidor: ${e.message}")
        }
    }

    private suspend fun Call.esperar(): Response = suspendCancellableCoroutine { cont ->
        enqueue(object : Callback {
            override fun onResponse(call: Call, response: Response) {
                if (cont.isActive) cont.resume(response) else response.close()
            }
            override fun onFailure(call: Call, e: IOException) {
                if (!cont.isCancelled) cont.resumeWithException(e)
            }
        })
        cont.invokeOnCancellation { runCatching { cancel() } }
    }
}
