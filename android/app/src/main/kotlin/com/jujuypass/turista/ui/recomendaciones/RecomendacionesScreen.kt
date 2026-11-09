package com.jujuypass.turista.ui.recomendaciones

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jujuypass.turista.R
import com.jujuypass.turista.data.Recomendacion
import com.jujuypass.turista.data.Repositorio
import com.jujuypass.turista.dominio.Formatos
import com.jujuypass.turista.ui.comun.CargaViewModel
import com.jujuypass.turista.ui.comun.Etiqueta
import com.jujuypass.turista.ui.comun.ListaRemota
import com.jujuypass.turista.ui.comun.Tarjeta
import com.jujuypass.turista.ui.comun.Vacio
import com.jujuypass.turista.ui.comun.vm
import com.jujuypass.turista.ui.tema.Paleta

class RecomendacionesViewModel(repo: Repositorio) : CargaViewModel<List<Recomendacion>>({ repo.recomendaciones() })

@Composable
fun RecomendacionesScreen() {
    val vm = vm { c, _ -> RecomendacionesViewModel(c.repo) }
    val carga by vm.estado.collectAsStateWithLifecycle()
    ListaRemota(
        carga = carga,
        onRecargar = vm::recargar,
        vacio = { Vacio(Icons.Default.Favorite, stringResource(R.string.recomendaciones_vacio), stringResource(R.string.recomendaciones_vacio_detalle)) },
        cabecera = {
            item {
                Text(stringResource(R.string.recomendaciones_intro), style = MaterialTheme.typography.bodyMedium, color = Paleta.TextoSuave)
            }
        },
    ) { lista ->
        items(lista, key = { it.id }) { r ->
            Tarjeta {
                Column(Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (r.categoria.isNotBlank()) Etiqueta(r.categoria, Paleta.TurquesaClaro, Paleta.Turquesa)
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(r.titulo, style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(4.dp))
                    Text(r.descripcion, style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(8.dp))
                    val pie = listOfNotNull(
                        r.autorNombre.takeIf { it.isNotBlank() }?.let { stringResource(R.string.recomendado_por, it) },
                        r.fecha?.let { Formatos.fecha(it) },
                    ).joinToString(" · ")
                    if (pie.isNotBlank()) Text(pie, style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave)
                }
            }
        }
    }
}
