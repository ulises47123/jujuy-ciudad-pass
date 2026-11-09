package com.jujuypass.turista.ui.lugar

import android.location.Location
import android.os.SystemClock
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jujuypass.turista.data.Repositorio
import com.jujuypass.turista.data.ResponderPedido
import com.jujuypass.turista.dominio.Codigos
import com.jujuypass.turista.dominio.FalloApi
import com.jujuypass.turista.ubicacion.ProveedorUbicacion
import com.jujuypass.turista.ui.misiones.LugarConDistancia
import com.jujuypass.turista.ui.misiones.LugaresViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive

sealed interface EstadoVisita {
    data object Inicial : EstadoVisita
    data class Muestreando(val obtenidas: Int, val total: Int) : EstadoVisita
    data object Validando : EstadoVisita
    data class Pregunta(
        val intentoId: JsonPrimitive,
        val texto: String,
        val opciones: List<String>,
        /** Vencimiento en el reloj monotónico (SystemClock.elapsedRealtime). */
        val venceElapsedMs: Long,
        val elegida: Int? = null,
        val respondiendo: Boolean = false,
        val error: Throwable? = null,
    ) : EstadoVisita
    data class Resultado(
        val correcta: Boolean,
        val puntosGanados: Int?,
        val puntos: Int?,
        val rango: String?,
        val intentosRestantes: Int?,
        val multiplicador: Double? = null,
    ) : EstadoVisita
    data object Expirado : EstadoVisita
    data class Error(val error: Throwable) : EstadoVisita
}

class VisitaViewModel(
    estadoGuardado: SavedStateHandle,
    private val repo: Repositorio,
    private val ubicacion: ProveedorUbicacion,
) : ViewModel() {

    val lugarId: Int = checkNotNull(estadoGuardado.get<Int>("id")) { "Falta el id del lugar" }

    private val yo: StateFlow<Location?> = ubicacion.enVivo
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val lugar: StateFlow<LugarConDistancia?> = combine(repo.lugares, yo) { c, y ->
        c.datos?.firstOrNull { it.id == lugarId }?.let { LugaresViewModel.ordenar(listOf(it), y).first() }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val cargaLugares = repo.lugares

    private val _estado = MutableStateFlow<EstadoVisita>(EstadoVisita.Inicial)
    val estado: StateFlow<EstadoVisita> = _estado.asStateFlow()

    private var trabajo: Job? = null

    init {
        if (repo.lugares.value.datos == null && !repo.lugares.value.cargando) recargarLugares()
    }

    fun recargarLugares() {
        viewModelScope.launch { repo.refrescarLugares() }
    }

    /** Paso 1: muestras GPS → POST /visitas/iniciar. Se llama con permiso y GPS ya verificados. */
    fun iniciar() {
        if (trabajo?.isActive == true) return
        trabajo = viewModelScope.launch {
            val total = 4
            _estado.value = EstadoVisita.Muestreando(0, total)
            try {
                val muestras = ubicacion.tomarMuestras(objetivo = total) { n ->
                    _estado.value = EstadoVisita.Muestreando(n, total)
                }
                _estado.value = EstadoVisita.Validando
                val r = repo.iniciarVisita(lugarId, muestras, System.currentTimeMillis())
                _estado.value = EstadoVisita.Pregunta(
                    intentoId = r.intentoId,
                    texto = r.pregunta,
                    opciones = r.opciones,
                    venceElapsedMs = SystemClock.elapsedRealtime() + r.expiraEnS.coerceAtLeast(1) * 1000L,
                )
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (e is FalloApi.Servidor && e.codigo == Codigos.YA_VISITADO) repo.marcarVisitado(lugarId)
                // Lugar desactivado o sin preguntas: refrescar la lista
                if (e is FalloApi.Servidor && e.codigo == Codigos.NO_ENCONTRADO) launch { repo.refrescarLugares() }
                _estado.value = EstadoVisita.Error(e)
            }
        }
    }

    /** Paso 2: muestra nueva → POST /visitas/responder. */
    fun responder(opcion: Int) {
        val p = _estado.value as? EstadoVisita.Pregunta ?: return
        if (p.respondiendo || trabajo?.isActive == true) return
        if (SystemClock.elapsedRealtime() >= p.venceElapsedMs) {
            _estado.value = EstadoVisita.Expirado
            return
        }
        _estado.value = p.copy(elegida = opcion, respondiendo = true, error = null)
        trabajo = viewModelScope.launch {
            try {
                val muestra = ubicacion.tomarUnaMuestra()
                val r = repo.responder(
                    ResponderPedido(p.intentoId, opcion, muestra, System.currentTimeMillis()),
                    lugarId,
                )
                _estado.value = EstadoVisita.Resultado(
                    r.correcta, r.puntosGanados, r.puntos, r.rango, r.intentosRestantes, r.multiplicador,
                )
                // Refrescar en segundo plano (lugares visitados, puntos, rango)
                launch { repo.refrescarLugares() }
                launch { runCatching { repo.refrescarUsuario() } }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                when {
                    e is FalloApi.Servidor && e.codigo == Codigos.INTENTO_EXPIRADO -> _estado.value = EstadoVisita.Expirado
                    e is FalloApi.Servidor && e.codigo == Codigos.YA_VISITADO -> {
                        repo.marcarVisitado(lugarId)
                        _estado.value = EstadoVisita.Error(e)
                    }
                    // Errores que no cierran el intento (sin señal, fuera de rango, precisión, sin red):
                    // se puede volver a responder mientras no venza (docs/API.md sección 6).
                    esReintentable(e) ->
                        _estado.update { (it as? EstadoVisita.Pregunta)?.copy(respondiendo = false, error = e) ?: EstadoVisita.Error(e) }
                    // INTENTO_USADO, UBICACION_FALSA (anula el intento), NO_ENCONTRADO, DATOS_INVALIDOS, 429...
                    else -> _estado.value = EstadoVisita.Error(e)
                }
            }
        }
    }

    private fun esReintentable(e: Exception): Boolean = when (e) {
        is FalloApi.Servidor -> e.codigo in setOf(
            Codigos.FUERA_DE_RANGO,
            Codigos.PRECISION_INSUFICIENTE,
            Codigos.MUESTRAS_INVALIDAS,
            "ERROR_INTERNO",
        )
        else -> true // sin conexión, timeout, sin señal GPS, GPS apagado
    }

    fun tiempoAgotado() {
        val p = _estado.value as? EstadoVisita.Pregunta ?: return
        if (!p.respondiendo) _estado.value = EstadoVisita.Expirado
    }

    fun reiniciar() {
        trabajo?.cancel()
        _estado.value = EstadoVisita.Inicial
    }
}
