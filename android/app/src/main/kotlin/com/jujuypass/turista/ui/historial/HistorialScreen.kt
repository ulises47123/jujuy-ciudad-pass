package com.jujuypass.turista.ui.historial

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jujuypass.turista.R
import com.jujuypass.turista.data.Repositorio
import com.jujuypass.turista.data.Visita
import com.jujuypass.turista.dominio.Formatos
import com.jujuypass.turista.ui.comun.CargaViewModel
import com.jujuypass.turista.ui.comun.Etiqueta
import com.jujuypass.turista.ui.comun.ListaRemota
import com.jujuypass.turista.ui.comun.Tarjeta
import com.jujuypass.turista.ui.comun.Vacio
import com.jujuypass.turista.ui.comun.vm
import com.jujuypass.turista.ui.tema.Paleta

class HistorialViewModel(repo: Repositorio) : CargaViewModel<List<Visita>>({
    repo.misVisitas().sortedByDescending { Formatos.parsearInstante(it.fecha) }
})

@Composable
fun HistorialScreen() {
    val vm = vm { c, _ -> HistorialViewModel(c.repo) }
    val carga by vm.estado.collectAsStateWithLifecycle()
    ListaRemota(
        carga = carga,
        onRecargar = vm::recargar,
        vacio = { Vacio(Icons.Default.DateRange, stringResource(R.string.historial_vacio), stringResource(R.string.historial_vacio_detalle)) },
        cabecera = {
            carga.datos?.takeIf { it.isNotEmpty() }?.let { lista ->
                item {
                    Surface(color = Paleta.TurquesaClaro, shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                        Text(
                            stringResource(R.string.historial_resumen, lista.size, lista.sumOf { it.puntos }),
                            Modifier.padding(16.dp),
                            color = Paleta.Turquesa,
                            style = MaterialTheme.typography.titleSmall,
                        )
                    }
                }
            }
        },
    ) { lista ->
        items(lista, key = { "${it.lugarId}-${it.fecha}" }) { v ->
            Tarjeta {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.CheckCircle, null, tint = Paleta.Turquesa)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(v.lugarNombre, style = MaterialTheme.typography.titleMedium)
                        Text(Formatos.fechaHora(v.fecha), style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave)
                    }
                    Etiqueta(
                        "+" + pluralStringResource(R.plurals.puntos_cantidad, v.puntos, v.puntos),
                        fondo = Paleta.TerracotaClaro, color = Paleta.TerracotaOscuro, icono = Icons.Default.Star,
                    )
                }
            }
        }
    }
}
