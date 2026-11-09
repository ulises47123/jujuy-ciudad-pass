package com.jujuypass.turista.data

import android.content.Context
import androidx.core.content.edit
import com.jujuypass.turista.BuildConfig
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.Json
import java.util.UUID

/**
 * Datos persistentes en el almacenamiento privado de la app (SharedPreferences en modo privado,
 * excluido de backups): token, dispositivo_id, usuario en caché y URL del servidor (solo debug).
 */
class SesionStore(context: Context, private val json: Json) {

    private val prefs = context.getSharedPreferences("jujuy_pass", Context.MODE_PRIVATE)

    /** UUID generado una sola vez por instalación. */
    val dispositivoId: String = prefs.getString(K_DISPOSITIVO, null) ?: UUID.randomUUID().toString().also {
        prefs.edit { putString(K_DISPOSITIVO, it) }
    }

    private val _token = MutableStateFlow(prefs.getString(K_TOKEN, null))
    val token: StateFlow<String?> = _token.asStateFlow()

    private val _usuario = MutableStateFlow(
        prefs.getString(K_USUARIO, null)?.let { runCatching { json.decodeFromString(Usuario.serializer(), it) }.getOrNull() },
    )
    val usuario: StateFlow<Usuario?> = _usuario.asStateFlow()

    /** Aviso de una sola vez para mostrar en el login ("tu sesión expiró"). */
    private val _sesionExpirada = MutableStateFlow(false)
    val sesionExpirada: StateFlow<Boolean> = _sesionExpirada.asStateFlow()

    fun guardarSesion(token: String, usuario: Usuario) {
        prefs.edit {
            putString(K_TOKEN, token)
            putString(K_USUARIO, json.encodeToString(Usuario.serializer(), usuario))
        }
        _usuario.value = usuario
        _token.value = token
        _sesionExpirada.value = false
    }

    fun actualizarUsuario(usuario: Usuario) {
        if (_token.value == null) return
        prefs.edit { putString(K_USUARIO, json.encodeToString(Usuario.serializer(), usuario)) }
        _usuario.value = usuario
    }

    fun cerrarSesion(expirada: Boolean = false) {
        prefs.edit {
            remove(K_TOKEN)
            remove(K_USUARIO)
        }
        _token.value = null
        _usuario.value = null
        if (expirada) _sesionExpirada.value = true
    }

    fun avisoExpiracionMostrado() {
        _sesionExpirada.value = false
    }

    // ---- URL del servidor ----

    /** URL efectiva. En release siempre es BuildConfig.API_URL. */
    fun urlApi(): String {
        if (!BuildConfig.DEBUG) return BuildConfig.API_URL
        return prefs.getString(K_URL, null)?.takeIf { it.isNotBlank() } ?: BuildConfig.API_URL
    }

    fun guardarUrlApi(url: String?) {
        if (!BuildConfig.DEBUG) return
        prefs.edit { if (url.isNullOrBlank()) remove(K_URL) else putString(K_URL, normalizarUrl(url)) }
    }

    // ---- Permisos ----

    var yaPidioUbicacion: Boolean
        get() = prefs.getBoolean(K_PIDIO_UBICACION, false)
        set(v) = prefs.edit { putBoolean(K_PIDIO_UBICACION, v) }

    companion object {
        private const val K_TOKEN = "token"
        private const val K_USUARIO = "usuario"
        private const val K_DISPOSITIVO = "dispositivo_id"
        private const val K_URL = "url_api"
        private const val K_PIDIO_UBICACION = "pidio_ubicacion"

        /** Asegura esquema y barra final: "192.168.1.5:8000/api/v1" -> "http://192.168.1.5:8000/api/v1/". */
        fun normalizarUrl(url: String): String {
            var u = url.trim()
            if (!u.startsWith("http://") && !u.startsWith("https://")) u = "http://$u"
            if (!u.endsWith("/")) u += "/"
            return u
        }
    }
}
