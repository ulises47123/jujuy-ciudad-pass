package com.jujuypass.turista.data

import com.jujuypass.turista.dominio.Rangos
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.builtins.ListSerializer

/** Estado genérico de una carga remota. Conserva los datos anteriores si falla un refresco. */
data class Carga<T>(
    val datos: T? = null,
    val cargando: Boolean = false,
    val error: Throwable? = null,
) {
    val vacioSinError: Boolean get() = datos == null && !cargando && error == null
}

/**
 * Acceso a la API para el turista. Mantiene en memoria los lugares (compartidos por Misiones,
 * Mapa y Detalle) y el usuario actual.
 */
class Repositorio(
    private val api: ApiCliente,
    private val sesion: SesionStore,
) {
    val usuario: StateFlow<Usuario?> get() = sesion.usuario

    private val _lugares = MutableStateFlow(Carga<List<Lugar>>())
    val lugares: StateFlow<Carga<List<Lugar>>> = _lugares.asStateFlow()
    private val mutexLugares = Mutex()

    // ---------- Auth ----------

    suspend fun login(email: String, password: String) {
        val r = api.post(
            "auth/login",
            LoginPedido(email.trim(), password, "app", sesion.dispositivoId),
            LoginPedido.serializer(),
            SesionRespuesta.serializer(),
            autenticado = false,
        )
        limpiarCaches()
        sesion.guardarSesion(r.token, r.usuario)
    }

    suspend fun registrar(nombre: String, email: String, password: String, procedencia: String?) {
        val r = api.post(
            "auth/registro",
            RegistroPedido(nombre.trim(), email.trim(), password, procedencia?.trim()?.ifBlank { null }, sesion.dispositivoId),
            RegistroPedido.serializer(),
            SesionRespuesta.serializer(),
            autenticado = false,
        )
        limpiarCaches()
        sesion.guardarSesion(r.token, r.usuario)
    }

    suspend fun refrescarUsuario(): Usuario {
        val u = api.get("auth/yo", YoRespuesta.serializer()).usuario
        sesion.actualizarUsuario(u)
        return u
    }

    suspend fun cambiarPassword(actual: String, nueva: String) {
        api.post("auth/cambiar-password", CambiarPasswordPedido(actual, nueva), CambiarPasswordPedido.serializer(), OkRespuesta.serializer())
    }

    /** Cierra la sesión en el servidor si se puede; localmente siempre. */
    suspend fun logout() {
        try {
            api.post<Unit, OkRespuesta>("auth/logout", null, null, OkRespuesta.serializer())
        } catch (_: Exception) {
            // Sin red o token ya inválido: igual cerramos localmente.
        } finally {
            limpiarCaches()
            sesion.cerrarSesion()
        }
    }

    private fun limpiarCaches() {
        _lugares.value = Carga()
    }

    // ---------- Lugares y visitas ----------

    suspend fun refrescarLugares() = mutexLugares.withLock {
        _lugares.update { it.copy(cargando = true, error = null) }
        try {
            val lista = api.get("lugares", ListSerializer(Lugar.serializer()))
            _lugares.value = Carga(datos = lista)
        } catch (e: Exception) {
            _lugares.update { it.copy(cargando = false, error = e) }
        }
    }

    suspend fun iniciarVisita(lugarId: Int, muestras: List<MuestraGps>, relojMs: Long): IniciarVisitaRespuesta =
        api.post(
            "visitas/iniciar",
            IniciarVisitaPedido(lugarId, sesion.dispositivoId, relojMs, muestras),
            IniciarVisitaPedido.serializer(),
            IniciarVisitaRespuesta.serializer(),
        )

    suspend fun responder(pedido: ResponderPedido, lugarId: Int): ResponderRespuesta {
        val r = api.post("visitas/responder", pedido, ResponderPedido.serializer(), ResponderRespuesta.serializer())
        if (r.correcta) {
            marcarVisitado(lugarId)
            sesion.usuario.value?.let { u ->
                val hist = r.puntosHistoricos ?: (u.puntosHistoricos + (r.puntosGanados ?: 0))
                sesion.actualizarUsuario(
                    u.copy(
                        puntos = r.puntos ?: (u.puntos + (r.puntosGanados ?: 0)),
                        puntosHistoricos = hist,
                        rango = r.rango ?: Rangos.rangoDe(hist),
                    ),
                )
            }
        }
        return r
    }

    /** Marca el lugar como visitado en la caché (por ejemplo tras YA_VISITADO o una respuesta correcta). */
    fun marcarVisitado(lugarId: Int) {
        _lugares.update { c -> c.copy(datos = c.datos?.map { if (it.id == lugarId) it.copy(visitado = true) else it }) }
    }

    suspend fun misVisitas(): List<Visita> = api.get("visitas/mias", ListSerializer(Visita.serializer()))

    // ---------- Beneficios y cupones ----------

    suspend fun beneficios(): List<Beneficio> = api.get("beneficios", ListSerializer(Beneficio.serializer()))

    suspend fun canjear(beneficioId: Int): Canje {
        val c = api.post("canjes", CanjearPedido(beneficioId), CanjearPedido.serializer(), Canje.serializer())
        val u = sesion.usuario.value
        if (u != null) sesion.actualizarUsuario(u.copy(puntos = c.puntosRestantes ?: (u.puntos - c.puntos).coerceAtLeast(0)))
        return c
    }

    suspend fun misCupones(): List<Canje> = api.get("canjes/mios", ListSerializer(Canje.serializer()))

    suspend fun recomendaciones(): List<Recomendacion> =
        api.get("recomendaciones", ListSerializer(Recomendacion.serializer()))

    suspend fun probarServidor(url: String): SaludRespuesta = api.probarSalud(url)
}
