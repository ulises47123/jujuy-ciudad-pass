package com.jujuypass.turista.ui.misiones

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jujuypass.turista.R
import com.jujuypass.turista.data.Usuario
import com.jujuypass.turista.dominio.Formatos
import com.jujuypass.turista.ui.comun.Etiqueta
import com.jujuypass.turista.ui.comun.ListaRemota
import com.jujuypass.turista.ui.comun.Tarjeta
import com.jujuypass.turista.ui.comun.Vacio
import com.jujuypass.turista.ui.comun.contenedor
import com.jujuypass.turista.ui.comun.vm
import com.jujuypass.turista.ui.lugar.rememberSolicitudUbicacion
import com.jujuypass.turista.ui.tema.Paleta

@Composable
fun MisionesScreen(onAbrirLugar: (Int) -> Unit) {
    val vm = vm { c, _ -> LugaresViewModel(c.repo, c.ubicacion) }
    val lista by vm.lista.collectAsStateWithLifecycle()
    val usuario by vm.usuario.collectAsStateWithLifecycle()

    ListaRemota(
        carga = lista,
        onRecargar = vm::recargar,
        vacio = {
            Vacio(Icons.Default.Place, stringResource(R.string.misiones_vacio), stringResource(R.string.misiones_vacio_detalle))
        },
        cabecera = {
            item { ResumenUsuario(usuario, lista.datos?.count { it.lugar.visitado } ?: 0, lista.datos?.size ?: 0) }
            item { AvisoPermisoUbicacion() }
        },
    ) { datos ->
        items(datos, key = { it.lugar.id }) { l -> TarjetaLugar(l, onClick = { onAbrirLugar(l.lugar.id) }) }
    }
}

@Composable
private fun ResumenUsuario(usuario: Usuario?, visitados: Int, total: Int) {
    Surface(color = Paleta.Terracota, shape = RoundedCornerShape(20.dp), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(18.dp)) {
            Text(
                stringResource(R.string.hola_nombre, usuario?.nombre?.substringBefore(' ') ?: ""),
                style = MaterialTheme.typography.titleLarge,
                color = Paleta.Crema,
            )
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Star, null, tint = Paleta.Crema)
                Spacer(Modifier.width(6.dp))
                Text(
                    stringResource(R.string.puntos_y_rango, usuario?.puntos ?: 0, usuario?.rango ?: ""),
                    color = Paleta.Crema,
                    style = MaterialTheme.typography.bodyLarge,
                )
            }
            if (total > 0) {
                Spacer(Modifier.height(4.dp))
                Text(stringResource(R.string.misiones_progreso, visitados, total), color = Paleta.TerracotaClaro)
            }
        }
    }
}

/** Si no hay permiso de ubicación, ofrece activarlo para ver distancias en vivo. */
@Composable
fun AvisoPermisoUbicacion() {
    val ubic = contenedor().ubicacion
    var permiso by remember { mutableStateOf(ubic.permisoAlguno()) }
    LifecycleResumeEffect(Unit) {
        permiso = ubic.permisoAlguno()
        ubic.revisarCambios()
        onPauseOrDispose { }
    }
    val solicitud = rememberSolicitudUbicacion { permiso = true; ubic.notificarCambioPermiso() }
    if (!permiso) {
        Surface(color = Paleta.TurquesaClaro, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth()) {
            Row(Modifier.padding(start = 14.dp, end = 4.dp, top = 6.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.LocationOn, null, tint = Paleta.Turquesa)
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.aviso_permiso_distancias), Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                TextButton(onClick = solicitud.solicitar) { Text(stringResource(R.string.activar)) }
            }
        }
    }
}

@Composable
private fun TarjetaLugar(l: LugarConDistancia, onClick: () -> Unit) {
    Tarjeta(onClick = onClick) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    Text(l.lugar.nombre, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    if (l.lugar.direccion.isNotBlank()) {
                        Text(
                            l.lugar.direccion,
                            style = MaterialTheme.typography.bodySmall,
                            color = Paleta.TextoSuave,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                Spacer(Modifier.width(8.dp))
                Etiqueta(
                    pluralStringResource(R.plurals.puntos_cantidad, l.lugar.puntos, l.lugar.puntos),
                    fondo = Paleta.TerracotaClaro,
                    color = Paleta.TerracotaOscuro,
                    icono = Icons.Default.Star,
                )
            }
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                if (l.lugar.categoria.isNotBlank()) Etiqueta(l.lugar.categoria)
                when {
                    l.lugar.visitado -> Etiqueta(
                        stringResource(R.string.visitado),
                        fondo = Paleta.TurquesaClaro,
                        color = Paleta.Turquesa,
                        icono = Icons.Default.CheckCircle,
                    )
                    l.adentro -> Etiqueta(
                        stringResource(R.string.estas_aca),
                        fondo = Paleta.Turquesa,
                        color = Paleta.Crema,
                        icono = Icons.Default.LocationOn,
                    )
                    l.distanciaM != null -> Etiqueta(
                        stringResource(R.string.a_distancia, Formatos.distancia(l.distanciaM)),
                        icono = Icons.Default.LocationOn,
                    )
                }
            }
        }
    }
}
