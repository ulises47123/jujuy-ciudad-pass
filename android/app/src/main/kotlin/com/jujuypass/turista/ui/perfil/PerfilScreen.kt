package com.jujuypass.turista.ui.perfil

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.jujuypass.turista.R
import com.jujuypass.turista.data.Repositorio
import com.jujuypass.turista.dominio.Rangos
import com.jujuypass.turista.ui.auth.CampoPassword
import com.jujuypass.turista.ui.auth.Validacion
import com.jujuypass.turista.ui.comun.BandaError
import com.jujuypass.turista.ui.comun.Tarjeta
import com.jujuypass.turista.ui.comun.textoError
import com.jujuypass.turista.ui.comun.vm
import com.jujuypass.turista.ui.tema.Paleta
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class EstadoPassword(val enviando: Boolean = false, val error: Throwable? = null, val listo: Boolean = false)

class PerfilViewModel(private val repo: Repositorio) : ViewModel() {
    val usuario = repo.usuario
    private val _cargando = MutableStateFlow(false)
    val cargando = _cargando.asStateFlow()
    private val _error = MutableStateFlow<Throwable?>(null)
    val error = _error.asStateFlow()
    private val _password = MutableStateFlow(EstadoPassword())
    val password = _password.asStateFlow()
    private val _saliendo = MutableStateFlow(false)
    val saliendo = _saliendo.asStateFlow()

    init {
        refrescar()
    }

    fun refrescar() {
        if (_cargando.value) return
        _cargando.value = true
        viewModelScope.launch {
            try {
                repo.refrescarUsuario()
                _error.value = null
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _error.value = e
            } finally {
                _cargando.value = false
            }
        }
    }

    fun cambiarPassword(actual: String, nueva: String) {
        if (_password.value.enviando) return
        _password.value = EstadoPassword(enviando = true)
        viewModelScope.launch {
            _password.value = try {
                repo.cambiarPassword(actual, nueva)
                EstadoPassword(listo = true)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                EstadoPassword(error = e)
            }
        }
    }

    fun reiniciarPassword() {
        _password.value = EstadoPassword()
    }

    fun cerrarSesion() {
        if (_saliendo.value) return
        _saliendo.value = true
        viewModelScope.launch { repo.logout() }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PerfilScreen(onHistorial: () -> Unit, onRecomendaciones: () -> Unit) {
    val vm = vm { c, _ -> PerfilViewModel(c.repo) }
    val usuario by vm.usuario.collectAsStateWithLifecycle()
    val cargando by vm.cargando.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    val saliendo by vm.saliendo.collectAsStateWithLifecycle()
    var dialogoPassword by rememberSaveable { mutableStateOf(false) }
    var confirmarSalir by rememberSaveable { mutableStateOf(false) }

    PullToRefreshBox(isRefreshing = cargando, onRefresh = vm::refrescar, modifier = Modifier.fillMaxSize()) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            error?.let { BandaError(it, vm::refrescar) }
            val u = usuario
            Surface(color = Paleta.Terracota, shape = RoundedCornerShape(20.dp), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(20.dp)) {
                    Text(u?.nombre ?: "", style = MaterialTheme.typography.titleLarge, color = Paleta.Crema)
                    Text(u?.email ?: "", style = MaterialTheme.typography.bodyMedium, color = Paleta.TerracotaClaro)
                    Spacer(Modifier.height(16.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Star, null, tint = Paleta.Crema, modifier = Modifier.size(28.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(stringResource(R.string.puntos_disponibles, u?.puntos ?: 0), style = MaterialTheme.typography.headlineSmall, color = Paleta.Crema)
                    }
                    Text(stringResource(R.string.puntos_historicos, u?.puntosHistoricos ?: 0), color = Paleta.TerracotaClaro)
                }
            }
            val prog = Rangos.progreso(u?.puntosHistoricos ?: 0)
            Tarjeta {
                Column(Modifier.padding(16.dp)) {
                    Text(stringResource(R.string.tu_rango), style = MaterialTheme.typography.labelLarge, color = Paleta.TextoSuave)
                    Text(u?.rango ?: prog.rango, style = MaterialTheme.typography.titleLarge, color = Paleta.Turquesa)
                    Spacer(Modifier.height(10.dp))
                    LinearProgressIndicator(
                        progress = { prog.fraccion },
                        modifier = Modifier.fillMaxWidth(),
                        color = Paleta.Turquesa,
                        trackColor = Paleta.TurquesaClaro,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        if (prog.siguiente != null) stringResource(R.string.rango_siguiente, prog.faltan, prog.siguiente)
                        else stringResource(R.string.rango_maximo),
                        style = MaterialTheme.typography.bodySmall,
                        color = Paleta.TextoSuave,
                    )
                }
            }
            Tarjeta {
                Column {
                    Opcion(Icons.Default.DateRange, stringResource(R.string.historial), onClick = onHistorial)
                    HorizontalDivider(color = Paleta.Borde)
                    Opcion(Icons.Default.Favorite, stringResource(R.string.recomendaciones), onClick = onRecomendaciones)
                    HorizontalDivider(color = Paleta.Borde)
                    Opcion(Icons.Default.Lock, stringResource(R.string.cambiar_password)) { vm.reiniciarPassword(); dialogoPassword = true }
                    HorizontalDivider(color = Paleta.Borde)
                    Opcion(Icons.AutoMirrored.Filled.ExitToApp, stringResource(R.string.cerrar_sesion), color = Paleta.Error) { confirmarSalir = true }
                }
            }
        }
    }

    if (dialogoPassword) DialogoPassword(vm) { dialogoPassword = false }

    if (confirmarSalir) {
        AlertDialog(
            onDismissRequest = { confirmarSalir = false },
            title = { Text(stringResource(R.string.cerrar_sesion)) },
            text = { Text(stringResource(R.string.cerrar_sesion_confirmar)) },
            confirmButton = {
                TextButton(onClick = vm::cerrarSesion, enabled = !saliendo) {
                    if (saliendo) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Text(stringResource(R.string.salir))
                }
            },
            dismissButton = { TextButton(onClick = { confirmarSalir = false }) { Text(stringResource(R.string.cancelar)) } },
        )
    }
}

@Composable
private fun Opcion(icono: ImageVector, texto: String, color: Color = Paleta.Texto, onClick: () -> Unit) {
    TextButton(onClick = onClick, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(0.dp)) {
        Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icono, null, tint = color)
            Spacer(Modifier.width(14.dp))
            Text(texto, color = color, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = Paleta.TextoSuave)
        }
    }
}

@Composable
private fun DialogoPassword(vm: PerfilViewModel, onCerrar: () -> Unit) {
    val estado by vm.password.collectAsStateWithLifecycle()
    var actual by rememberSaveable { mutableStateOf("") }
    var nueva by rememberSaveable { mutableStateOf("") }
    var repetir by rememberSaveable { mutableStateOf("") }
    var errorLocal by rememberSaveable { mutableStateOf<Int?>(null) }

    AlertDialog(
        onDismissRequest = { if (!estado.enviando) onCerrar() },
        title = { Text(stringResource(R.string.cambiar_password)) },
        text = {
            if (estado.listo) {
                Text(stringResource(R.string.password_cambiada))
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    CampoPassword(actual, { actual = it }, stringResource(R.string.campo_password_actual))
                    CampoPassword(nueva, { nueva = it }, stringResource(R.string.campo_password_nueva))
                    CampoPassword(repetir, { repetir = it }, stringResource(R.string.campo_password_repetir))
                    val msg = errorLocal?.let { stringResource(it) } ?: estado.error?.let { textoError(it) }
                    if (msg != null) Text(msg, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            if (estado.listo) {
                TextButton(onClick = onCerrar) { Text(stringResource(R.string.cerrar)) }
            } else {
                TextButton(
                    enabled = !estado.enviando,
                    onClick = {
                        errorLocal = when {
                            actual.isEmpty() -> R.string.validacion_password_vacia
                            !Validacion.passwordValida(nueva) -> R.string.validacion_password_corta
                            nueva != repetir -> R.string.validacion_password_distinta
                            else -> null
                        }
                        if (errorLocal == null) vm.cambiarPassword(actual, nueva)
                    },
                ) {
                    if (estado.enviando) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Text(stringResource(R.string.guardar))
                }
            }
        },
        dismissButton = {
            if (!estado.listo) TextButton(onClick = onCerrar, enabled = !estado.enviando) { Text(stringResource(R.string.cancelar)) }
        },
    )
}
