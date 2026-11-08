package com.jujuypass.turista.ui.misiones

import android.location.Location
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jujuypass.turista.data.Carga
import com.jujuypass.turista.data.Lugar
import com.jujuypass.turista.data.Repositorio
import com.jujuypass.turista.dominio.Geo
import com.jujuypass.turista.ubicacion.ProveedorUbicacion
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class LugarConDistancia(val lugar: Lugar, val distanciaM: Double?) {
    val adentro: Boolean get() = distanciaM != null && distanciaM <= lugar.radioM
}

/** Lugares + mi ubicación en vivo. Lo usan Misiones, Mapa y el Detalle. */
class LugaresViewModel(private val repo: Repositorio, ubicacion: ProveedorUbicacion) : ViewModel() {

    val miUbicacion: StateFlow<Location?> = ubicacion.enVivo
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val lista: StateFlow<Carga<List<LugarConDistancia>>> = combine(repo.lugares, miUbicacion) { carga, yo ->
        Carga(
            datos = carga.datos?.let { ordenar(it, yo) },
            cargando = carga.cargando,
            error = carga.error,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), Carga(cargando = true))

    val usuario = repo.usuario

    init {
        val actual = repo.lugares.value
        if (actual.datos == null && !actual.cargando) recargar()
    }

    fun recargar() {
        viewModelScope.launch {
            repo.refrescarLugares()
            runCatching { repo.refrescarUsuario() }
        }
    }

    companion object {
        fun ordenar(lugares: List<Lugar>, yo: Location?): List<LugarConDistancia> =
            lugares.map { l ->
                LugarConDistancia(l, yo?.let { Geo.distanciaM(it.latitude, it.longitude, l.latitud, l.longitud) })
            }.sortedWith(compareBy<LugarConDistancia> { it.lugar.visitado }.thenBy { it.distanciaM ?: Double.MAX_VALUE }.thenBy { it.lugar.nombre })
    }
}
