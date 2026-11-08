package com.jujuypass.turista.ui.beneficios

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.jujuypass.turista.R
import com.jujuypass.turista.data.Beneficio
import com.jujuypass.turista.data.Canje
import com.jujuypass.turista.data.Repositorio
import com.jujuypass.turista.data.Usuario
import com.jujuypass.turista.ui.comun.CargaViewModel
import com.jujuypass.turista.ui.comun.Etiqueta
import com.jujuypass.turista.ui.comun.ListaRemota
import com.jujuypass.turista.ui.comun.Tarjeta
import com.jujuypass.turista.ui.comun.Vacio
import com.jujuypass.turista.ui.comun.textoError
import com.jujuypass.turista.ui.comun.vm
import com.jujuypass.turista.ui.tema.EstiloCodigo
import com.jujuypass.turista.ui.tema.Paleta
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class EstadoCanje(
    val confirmar: Beneficio? = null,
    val canjeando: Boolean = false,
    val hecho: Canje? = null,
    val error: Throwable? = null,
)

class BeneficiosViewModel(private val repo: Repositorio) : CargaViewModel<List<Beneficio>>({ repo.beneficios() }) {
    val usuario = repo.usuario
    private val _canje = MutableStateFlow(EstadoCanje())
    val canje = _canje.asStateFlow()

    fun pedirConfirmacion(b: Beneficio) {
        _canje.value = EstadoCanje(confirmar = b)
    }

    fun cerrar() {
        if (!_canje.value.canjeando) _canje.value = EstadoCanje()
    }

    fun canjear() {
        val b = _canje.value.confirmar ?: return
        if (_canje.value.canjeando) return
        _canje.value = _canje.value.copy(canjeando = true, error = null)
        viewModelScope.launch {
            _canje.value = try {
                val c = repo.canjear(b.id)
                // Actualiza el stock mostrado; luego recarga la lista desde el servidor.
                modificar { lista -> lista.map { if (it.id == b.id && it.stockRestante != null) it.copy(stockRestante = (it.stockRestante - 1).coerceAtLeast(0)) else it } }
                recargar()
                EstadoCanje(hecho = c)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                EstadoCanje(confirmar = b, error = e)
            }
        }
    }
}

@Composable
fun BeneficiosScreen(onVerCupones: () -> Unit) {
    val vm = vm { c, _ -> BeneficiosViewModel(c.repo) }
    val carga by vm.estado.collectAsStateWithLifecycle()
    val usuario by vm.usuario.collectAsStateWithLifecycle()
    val canje by vm.canje.collectAsStateWithLifecycle()

    ListaRemota(
        carga = carga,
        onRecargar = vm::recargar,
        vacio = { Vacio(Icons.Default.ShoppingCart, stringResource(R.string.beneficios_vacio), stringResource(R.string.beneficios_vacio_detalle)) },
        cabecera = { item { Saldo(usuario) } },
    ) { lista ->
        items(lista, key = { it.id }) { b -> TarjetaBeneficio(b, usuario?.puntos ?: 0) { vm.pedirConfirmacion(b) } }
    }

    val confirmar = canje.confirmar
    if (confirmar != null) {
        AlertDialog(
            onDismissRequest = vm::cerrar,
            title = { Text(stringResource(R.string.canjear_titulo)) },
            text = {
                Column {
                    Text(stringResource(R.string.canjear_confirmar, confirmar.titulo, confirmar.puntos))
                    confirmar.negocio?.nombre?.let { Text(stringResource(R.string.en_negocio, it), color = Paleta.TextoSuave) }
                    if (confirmar.diasValidez > 0) {
                        Spacer(Modifier.height(6.dp))
                        Text(pluralStringResource(R.plurals.validez_dias, confirmar.diasValidez, confirmar.diasValidez), style = MaterialTheme.typography.bodySmall)
                    }
                    canje.error?.let {
                        Spacer(Modifier.height(8.dp))
                        Text(textoError(it), color = MaterialTheme.colorScheme.error)
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = vm::canjear, enabled = !canje.canjeando) {
                    if (canje.canjeando) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                    else Text(stringResource(if (canje.error != null) R.string.reintentar else R.string.canjear))
                }
            },
            dismissButton = { TextButton(onClick = vm::cerrar, enabled = !canje.canjeando) { Text(stringResource(R.string.cancelar)) } },
        )
    }

    val hecho = canje.hecho
    if (hecho != null) {
        AlertDialog(
            onDismissRequest = vm::cerrar,
            title = { Text(stringResource(R.string.canje_listo)) },
            text = {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    Text(hecho.beneficio.titulo.ifBlank { stringResource(R.string.tu_cupon) })
                    Spacer(Modifier.height(8.dp))
                    Text(hecho.codigo, style = EstiloCodigo, color = Paleta.TerracotaOscuro)
                    Spacer(Modifier.height(8.dp))
                    Text(stringResource(R.string.canje_listo_detalle), style = MaterialTheme.typography.bodySmall)
                }
            },
            confirmButton = { TextButton(onClick = { vm.cerrar(); onVerCupones() }) { Text(stringResource(R.string.ver_mis_cupones)) } },
            dismissButton = { TextButton(onClick = vm::cerrar) { Text(stringResource(R.string.cerrar)) } },
        )
    }
}

@Composable
private fun Saldo(u: Usuario?) {
    Surface(color = Paleta.TurquesaClaro, shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Star, null, tint = Paleta.Turquesa)
            Spacer(Modifier.width(8.dp))
            Text(stringResource(R.string.tu_saldo, u?.puntos ?: 0), style = MaterialTheme.typography.titleMedium, color = Paleta.Turquesa)
        }
    }
}

@Composable
private fun TarjetaBeneficio(b: Beneficio, misPuntos: Int, onCanjear: () -> Unit) {
    val alcanza = misPuntos >= b.puntos
    val sinStock = b.stockRestante != null && b.stockRestante <= 0
    Tarjeta {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    Text(b.titulo, style = MaterialTheme.typography.titleMedium)
                    b.negocio?.let { n ->
                        Text(n.nombre, style = MaterialTheme.typography.bodyMedium, color = Paleta.Turquesa)
                        n.direccion?.takeIf { it.isNotBlank() }?.let {
                            Text(it, style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave)
                        }
                    }
                }
                Etiqueta(
                    pluralStringResource(R.plurals.puntos_cantidad, b.puntos, b.puntos),
                    fondo = Paleta.TerracotaClaro, color = Paleta.TerracotaOscuro, icono = Icons.Default.Star,
                )
            }
            if (b.descripcion.isNotBlank()) {
                Spacer(Modifier.height(8.dp))
                Text(b.descripcion, style = MaterialTheme.typography.bodyMedium)
            }
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                if (b.diasValidez > 0) Etiqueta(pluralStringResource(R.plurals.validez_dias, b.diasValidez, b.diasValidez))
                b.stockRestante?.let { Etiqueta(pluralStringResource(R.plurals.quedan_stock, it, it)) }
            }
            Spacer(Modifier.height(12.dp))
            Button(onClick = onCanjear, enabled = alcanza && !sinStock, modifier = Modifier.fillMaxWidth()) {
                Text(
                    when {
                        sinStock -> stringResource(R.string.sin_stock)
                        alcanza -> stringResource(R.string.canjear)
                        else -> stringResource(R.string.te_faltan, b.puntos - misPuntos)
                    },
                )
            }
        }
    }
}
