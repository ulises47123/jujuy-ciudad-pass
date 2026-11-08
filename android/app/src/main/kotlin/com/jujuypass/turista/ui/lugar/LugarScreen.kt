package com.jujuypass.turista.ui.lugar

import android.content.Intent
import android.net.Uri
import android.os.SystemClock
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jujuypass.turista.R
import com.jujuypass.turista.dominio.Formatos
import com.jujuypass.turista.ubicacion.SinSenalGps
import com.jujuypass.turista.ubicacion.UbicacionApagada
import com.jujuypass.turista.ui.comun.Cargando
import com.jujuypass.turista.ui.comun.ErrorConReintento
import com.jujuypass.turista.ui.comun.Etiqueta
import com.jujuypass.turista.ui.comun.Tarjeta
import com.jujuypass.turista.ui.comun.textoError
import com.jujuypass.turista.ui.comun.vm
import com.jujuypass.turista.ui.misiones.LugarConDistancia
import com.jujuypass.turista.ui.tema.Paleta
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LugarScreen(onVolver: () -> Unit) {
    val vm = vm { c, h -> VisitaViewModel(h, c.repo, c.ubicacion) }
    val lugar by vm.lugar.collectAsStateWithLifecycle()
    val carga by vm.cargaLugares.collectAsStateWithLifecycle()
    val estado by vm.estado.collectAsStateWithLifecycle()
    var confirmarSalida by rememberSaveable { mutableStateOf(false) }

    val enCurso = estado is EstadoVisita.Pregunta || estado is EstadoVisita.Muestreando || estado is EstadoVisita.Validando
    BackHandler(enabled = enCurso) { confirmarSalida = true }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(lugar?.lugar?.nombre ?: stringResource(R.string.lugar)) },
                navigationIcon = {
                    IconButton(onClick = { if (enCurso) confirmarSalida = true else onVolver() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.volver))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Paleta.Crema),
            )
        },
    ) { padding ->
        val l = lugar
        when {
            l != null -> Contenido(l, estado, vm, Modifier.padding(padding))
            carga.error != null && !carga.cargando -> ErrorConReintento(carga.error!!, vm::recargarLugares, Modifier.padding(padding))
            carga.cargando || carga.datos == null -> Cargando(Modifier.padding(padding))
            else -> ErrorConReintento(IllegalStateException(), vm::recargarLugares, Modifier.padding(padding))
        }
    }

    if (confirmarSalida) {
        AlertDialog(
            onDismissRequest = { confirmarSalida = false },
            title = { Text(stringResource(R.string.salir_mision_titulo)) },
            text = { Text(stringResource(R.string.salir_mision)) },
            confirmButton = { TextButton(onClick = { confirmarSalida = false; vm.reiniciar(); onVolver() }) { Text(stringResource(R.string.salir)) } },
            dismissButton = { TextButton(onClick = { confirmarSalida = false }) { Text(stringResource(R.string.quedarme)) } },
        )
    }
}

@Composable
private fun Contenido(l: LugarConDistancia, estado: EstadoVisita, vm: VisitaViewModel, modifier: Modifier) {
    val ctx = LocalContext.current
    val solicitud = rememberSolicitudUbicacion { vm.iniciar() }
    Column(
        modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Etiqueta(
                pluralStringResource(R.plurals.puntos_cantidad, l.lugar.puntos, l.lugar.puntos),
                fondo = Paleta.TerracotaClaro, color = Paleta.TerracotaOscuro, icono = Icons.Default.Star,
            )
            if (l.lugar.categoria.isNotBlank()) Etiqueta(l.lugar.categoria)
            if (l.lugar.visitado) {
                Etiqueta(stringResource(R.string.visitado), fondo = Paleta.TurquesaClaro, color = Paleta.Turquesa, icono = Icons.Default.CheckCircle)
            }
        }
        if (l.lugar.direccion.isNotBlank()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Place, null, tint = Paleta.TextoSuave, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text(l.lugar.direccion, style = MaterialTheme.typography.bodyMedium, color = Paleta.TextoSuave)
            }
        }
        if (l.lugar.descripcion.isNotBlank()) {
            Text(l.lugar.descripcion, style = MaterialTheme.typography.bodyLarge)
        }
        Surface(color = Paleta.Arena, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp)) {
                val d = l.distanciaM
                Text(
                    when {
                        d == null -> stringResource(R.string.distancia_desconocida)
                        l.adentro -> stringResource(R.string.dentro_del_radio)
                        else -> stringResource(R.string.estas_a, Formatos.distancia(d))
                    },
                    style = MaterialTheme.typography.titleSmall,
                )
                Text(
                    stringResource(R.string.radio_lugar, Formatos.metrosEnteros(l.lugar.radioM)),
                    style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave,
                )
                TextButton(
                    onClick = {
                        val nombre = Uri.encode(l.lugar.nombre)
                        val uri = Uri.parse("geo:${l.lugar.latitud},${l.lugar.longitud}?q=${l.lugar.latitud},${l.lugar.longitud}($nombre)")
                        runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                    },
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp),
                ) { Text(stringResource(R.string.como_llegar)) }
            }
        }

        SeccionVisita(l, estado, vm, onEstoyAqui = solicitud.solicitar)
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun SeccionVisita(l: LugarConDistancia, estado: EstadoVisita, vm: VisitaViewModel, onEstoyAqui: () -> Unit) {
    when (estado) {
        EstadoVisita.Inicial -> {
            if (l.lugar.visitado) {
                Aviso(Icons.Default.CheckCircle, stringResource(R.string.ya_visitaste), Paleta.TurquesaClaro, Paleta.Turquesa)
            } else {
                Text(stringResource(R.string.como_funciona), style = MaterialTheme.typography.bodyMedium, color = Paleta.TextoSuave)
                Button(onClick = onEstoyAqui, modifier = Modifier.fillMaxWidth().height(56.dp)) {
                    Icon(Icons.Default.LocationOn, null)
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.estoy_aqui), style = MaterialTheme.typography.titleMedium)
                }
            }
        }
        is EstadoVisita.Muestreando -> Tarjeta {
            Column(Modifier.padding(16.dp)) {
                Text(
                    if (estado.obtenidas == 0) stringResource(R.string.buscando_gps)
                    else stringResource(R.string.tomando_muestras, estado.obtenidas, estado.total),
                    style = MaterialTheme.typography.titleSmall,
                )
                Spacer(Modifier.height(10.dp))
                if (estado.obtenidas == 0) {
                    LinearProgressIndicator(Modifier.fillMaxWidth())
                } else {
                    LinearProgressIndicator(progress = { estado.obtenidas / estado.total.toFloat() }, modifier = Modifier.fillMaxWidth())
                }
                Spacer(Modifier.height(8.dp))
                Text(stringResource(R.string.quedate_quieto), style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave)
            }
        }
        EstadoVisita.Validando -> Tarjeta {
            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 3.dp)
                Spacer(Modifier.width(12.dp))
                Text(stringResource(R.string.validando_ubicacion))
            }
        }
        is EstadoVisita.Pregunta -> Trivia(estado, vm)
        is EstadoVisita.Resultado -> ResultadoVisita(estado, onOtraVez = { vm.reiniciar(); onEstoyAqui() })
        EstadoVisita.Expirado -> {
            Aviso(Icons.Default.Warning, stringResource(R.string.tiempo_agotado), Paleta.TerracotaClaro, Paleta.TerracotaOscuro)
            Button(onClick = { vm.reiniciar(); onEstoyAqui() }, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.intentar_de_nuevo))
            }
        }
        is EstadoVisita.Error -> {
            Aviso(Icons.Default.Warning, textoErrorVisita(estado.error), Paleta.ErrorClaro, Paleta.Error)
            if (!l.lugar.visitado) {
                Button(onClick = { vm.reiniciar(); onEstoyAqui() }, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.reintentar))
                }
            }
        }
    }
}

@Composable
private fun Trivia(p: EstadoVisita.Pregunta, vm: VisitaViewModel) {
    var restanteMs by remember(p.venceElapsedMs) { mutableLongStateOf(p.venceElapsedMs - SystemClock.elapsedRealtime()) }
    LaunchedEffect(p.venceElapsedMs) {
        while (true) {
            restanteMs = p.venceElapsedMs - SystemClock.elapsedRealtime()
            if (restanteMs <= 0) {
                vm.tiempoAgotado()
                break
            }
            delay(250)
        }
    }
    val segundos = (restanteMs.coerceAtLeast(0) + 999) / 1000
    Tarjeta {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.trivia_titulo), style = MaterialTheme.typography.labelLarge, color = Paleta.Turquesa, modifier = Modifier.weight(1f))
                Etiqueta(
                    stringResource(R.string.te_quedan, Formatos.cuentaRegresiva(segundos)),
                    fondo = if (segundos <= 20) Paleta.ErrorClaro else Paleta.TurquesaClaro,
                    color = if (segundos <= 20) Paleta.Error else Paleta.Turquesa,
                )
            }
            Spacer(Modifier.height(12.dp))
            Text(p.texto, style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(16.dp))
            p.opciones.forEachIndexed { i, opcion ->
                val elegida = p.elegida == i
                OutlinedButton(
                    onClick = { vm.responder(i) },
                    enabled = !p.respondiendo && segundos > 0,
                    border = BorderStroke(if (elegida) 2.dp else 1.dp, if (elegida) Paleta.Terracota else Paleta.Borde),
                    colors = ButtonDefaults.outlinedButtonColors(
                        containerColor = if (elegida) Paleta.TerracotaClaro else Color.White,
                        contentColor = Paleta.Texto,
                    ),
                    modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(vertical = 4.dp),
                ) {
                    Text(opcion, Modifier.weight(1f), textAlign = TextAlign.Start)
                    if (elegida && p.respondiendo) {
                        CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                    }
                }
            }
            if (p.respondiendo) {
                Spacer(Modifier.height(8.dp))
                Text(stringResource(R.string.verificando_respuesta), style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave)
            }
            p.error?.let {
                Spacer(Modifier.height(8.dp))
                Text(textoErrorVisita(it), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
                Text(stringResource(R.string.toca_para_reintentar), style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave)
            }
        }
    }
}

@Composable
private fun ResultadoVisita(r: EstadoVisita.Resultado, onOtraVez: () -> Unit) {
    if (r.correcta) {
        Surface(color = Paleta.TurquesaClaro, shape = RoundedCornerShape(18.dp), modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(Icons.Default.CheckCircle, null, tint = Paleta.Turquesa, modifier = Modifier.size(56.dp))
                Spacer(Modifier.height(8.dp))
                Text(stringResource(R.string.correcto), style = MaterialTheme.typography.headlineSmall, color = Paleta.Turquesa)
                r.puntosGanados?.let {
                    Text(stringResource(R.string.ganaste_puntos, it), style = MaterialTheme.typography.titleLarge)
                }
                r.multiplicador?.takeIf { it > 1.0 }?.let {
                    Text(
                        stringResource(R.string.bonus_temporada, Formatos.multiplicador(it)),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Paleta.TerracotaOscuro,
                    )
                }
                Spacer(Modifier.height(6.dp))
                if (r.puntos != null) {
                    Text(stringResource(R.string.puntos_y_rango, r.puntos, r.rango ?: ""), style = MaterialTheme.typography.bodyLarge)
                }
            }
        }
    } else {
        Surface(color = Paleta.TerracotaClaro, shape = RoundedCornerShape(18.dp), modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(stringResource(R.string.incorrecto), style = MaterialTheme.typography.headlineSmall, color = Paleta.TerracotaOscuro)
                Spacer(Modifier.height(6.dp))
                val quedan = r.intentosRestantes
                Text(
                    when {
                        quedan == null -> stringResource(R.string.incorrecto_detalle)
                        quedan <= 0 -> stringResource(R.string.sin_intentos)
                        else -> pluralStringResource(R.plurals.intentos_restantes, quedan, quedan)
                    },
                    textAlign = TextAlign.Center,
                )
            }
        }
        if ((r.intentosRestantes ?: 1) > 0) {
            Button(onClick = onOtraVez, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.intentar_de_nuevo)) }
        }
    }
}

@Composable
private fun Aviso(icono: androidx.compose.ui.graphics.vector.ImageVector, texto: String, fondo: Color, color: Color) {
    Surface(color = fondo, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icono, null, tint = color)
            Spacer(Modifier.width(10.dp))
            Text(texto, color = color, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun textoErrorVisita(e: Throwable): String = when (e) {
    is SinSenalGps -> stringResource(R.string.error_sin_senal)
    is UbicacionApagada -> stringResource(R.string.gps_apagado)
    is SecurityException -> stringResource(R.string.permiso_denegado)
    else -> textoError(e)
}
