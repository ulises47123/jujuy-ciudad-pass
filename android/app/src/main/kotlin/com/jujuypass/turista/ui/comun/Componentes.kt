package com.jujuypass.turista.ui.comun

import android.content.res.Resources
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jujuypass.turista.R
import com.jujuypass.turista.data.Carga
import com.jujuypass.turista.dominio.Errores
import com.jujuypass.turista.dominio.TextosError
import com.jujuypass.turista.ui.tema.Paleta
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ---------------- Errores -> texto ----------------

class TextosErrorAndroid(private val r: Resources) : TextosError {
    override fun sinConexion() = r.getString(R.string.error_sin_conexion)
    override fun tiempo() = r.getString(R.string.error_tiempo)
    override fun inesperado() = r.getString(R.string.error_inesperado)
    override fun http(codigo: Int) = r.getString(R.string.error_http, codigo)
    override fun fueraDeRango(distancia: String, radio: String?) =
        if (radio != null) r.getString(R.string.error_fuera_de_rango_radio, distancia, radio)
        else r.getString(R.string.error_fuera_de_rango, distancia)
    override fun precision(precision: String) = r.getString(R.string.error_precision, precision)
    override fun puntosInsuficientes(tenes: Int, necesitas: Int) =
        r.getString(R.string.error_puntos_insuficientes, tenes, necesitas)
}

fun Resources.textoError(e: Throwable): String = Errores.describir(e, TextosErrorAndroid(this))

@Composable
fun textoError(e: Throwable): String = LocalResources.current.textoError(e)

// ---------------- ViewModel genérico de carga ----------------

/** Carga un recurso remoto con estados de carga/error y recarga manual. Sobrevive a la rotación. */
open class CargaViewModel<T>(private val cargador: suspend () -> T) : ViewModel() {
    private val _estado = MutableStateFlow(Carga<T>(cargando = true))
    val estado: StateFlow<Carga<T>> = _estado.asStateFlow()
    private var trabajo: Job? = null

    init {
        recargar()
    }

    fun recargar() {
        if (trabajo?.isActive == true) return
        trabajo = viewModelScope.launch {
            _estado.update { it.copy(cargando = true, error = null) }
            try {
                _estado.value = Carga(datos = cargador())
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _estado.update { it.copy(cargando = false, error = e) }
            }
        }
    }

    protected fun modificar(f: (T) -> T) {
        _estado.update { c -> c.copy(datos = c.datos?.let(f)) }
    }
}

// ---------------- Componentes de estado ----------------

@Composable
fun Cargando(modifier: Modifier = Modifier, texto: String? = null) {
    Column(
        modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator()
        if (texto != null) {
            Spacer(Modifier.height(12.dp))
            Text(texto, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
fun ErrorConReintento(error: Throwable, onReintentar: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(Icons.Default.Warning, null, tint = Paleta.TerracotaOscuro, modifier = Modifier.size(48.dp))
        Spacer(Modifier.height(12.dp))
        Text(textoError(error), textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyLarge)
        Spacer(Modifier.height(16.dp))
        Button(onClick = onReintentar) {
            Icon(Icons.Default.Refresh, null)
            Spacer(Modifier.width(8.dp))
            Text(stringResource(R.string.reintentar))
        }
    }
}

@Composable
fun Vacio(icono: ImageVector, titulo: String, detalle: String? = null, modifier: Modifier = Modifier, accion: (@Composable () -> Unit)? = null) {
    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier.size(72.dp).background(Paleta.TerracotaClaro, RoundedCornerShape(36.dp)),
            contentAlignment = Alignment.Center,
        ) { Icon(icono, null, tint = Paleta.Terracota, modifier = Modifier.size(36.dp)) }
        Spacer(Modifier.height(16.dp))
        Text(titulo, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        if (detalle != null) {
            Spacer(Modifier.height(6.dp))
            Text(detalle, style = MaterialTheme.typography.bodyMedium, color = Paleta.TextoSuave, textAlign = TextAlign.Center)
        }
        if (accion != null) {
            Spacer(Modifier.height(16.dp))
            accion()
        }
    }
}

/** Banda de error sobre datos ya cargados (falló un refresco). */
@Composable
fun BandaError(error: Throwable, onReintentar: () -> Unit) {
    Surface(color = Paleta.ErrorClaro, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(textoError(error), Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = Paleta.Error)
            OutlinedButton(onClick = onReintentar, contentPadding = PaddingValues(horizontal = 12.dp)) {
                Text(stringResource(R.string.reintentar))
            }
        }
    }
}

/**
 * Lista con pull-to-refresh y los estados de carga / error / vacío resueltos.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun <T> ListaRemota(
    carga: Carga<List<T>>,
    onRecargar: () -> Unit,
    vacio: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    cabecera: (LazyListScope.() -> Unit)? = null,
    items: LazyListScope.(List<T>) -> Unit,
) {
    val datos = carga.datos
    when {
        datos == null && carga.error != null -> ErrorConReintento(carga.error, onRecargar, modifier)
        datos == null -> Cargando(modifier)
        else -> PullToRefreshBox(
            isRefreshing = carga.cargando,
            onRefresh = onRecargar,
            modifier = modifier.fillMaxSize(),
        ) {
            if (datos.isEmpty() && carga.error == null) {
                vacio()
            } else {
                LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    if (carga.error != null) item { BandaError(carga.error, onRecargar) }
                    cabecera?.invoke(this)
                    items(datos)
                }
            }
        }
    }
}

@Composable
fun Tarjeta(modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, contenido: @Composable () -> Unit) {
    val colores = CardDefaults.cardColors(containerColor = Color.White)
    val borde = BorderStroke(1.dp, Paleta.Borde)
    if (onClick != null) {
        Card(onClick = onClick, modifier = modifier.fillMaxWidth(), colors = colores, border = borde) { contenido() }
    } else {
        Card(modifier = modifier.fillMaxWidth(), colors = colores, border = borde) { contenido() }
    }
}

@Composable
fun Etiqueta(texto: String, fondo: Color = Paleta.Arena, color: Color = Paleta.Texto, icono: ImageVector? = null) {
    Surface(color = fondo, shape = RoundedCornerShape(50)) {
        Row(Modifier.padding(horizontal = 10.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            if (icono != null) {
                Icon(icono, null, tint = color, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(4.dp))
            }
            Text(texto, style = MaterialTheme.typography.labelMedium, color = color)
        }
    }
}
