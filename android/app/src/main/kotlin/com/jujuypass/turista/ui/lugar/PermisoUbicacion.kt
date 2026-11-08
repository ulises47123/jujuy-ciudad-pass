package com.jujuypass.turista.ui.lugar

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.LocalActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.core.app.ActivityCompat
import com.google.android.gms.common.api.ResolvableApiException
import com.jujuypass.turista.R
import com.jujuypass.turista.ui.comun.contenedor
import kotlinx.coroutines.launch

private const val NINGUNO = 0
private const val EXPLICACION = 1
private const val DENEGADO = 2
private const val DENEGADO_SIEMPRE = 3
private const val SOLO_APROXIMADA = 4
private const val UBICACION_APAGADA = 5

@Stable
class SolicitudUbicacion(val solicitar: () -> Unit)

/**
 * Maneja todo el camino hasta tener ubicación precisa y el GPS prendido:
 * explicación previa → pedido de permiso → rechazo / "no volver a preguntar" (abrir Ajustes)
 * → solo aproximada → ubicación apagada (diálogo de Google o Ajustes).
 * Cuando todo está listo llama a [alEstarListo].
 */
@Composable
fun rememberSolicitudUbicacion(alEstarListo: () -> Unit): SolicitudUbicacion {
    val c = contenedor()
    val ubic = c.ubicacion
    val contexto = LocalContext.current
    val actividad = LocalActivity.current
    val alcance = rememberCoroutineScope()
    val listo by rememberUpdatedState(alEstarListo)
    var dialogo by rememberSaveable { mutableIntStateOf(NINGUNO) }

    val lanzadorAjustesGps = rememberLauncherForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { r ->
        ubic.notificarCambioPermiso()
        if (r.resultCode == Activity.RESULT_OK || ubic.ubicacionActivada()) listo() else dialogo = UBICACION_APAGADA
    }

    fun verificarGps() {
        alcance.launch {
            val problema = ubic.verificarAjustesAltaPrecision()
            when {
                problema is ResolvableApiException -> try {
                    lanzadorAjustesGps.launch(IntentSenderRequest.Builder(problema.resolution).build())
                } catch (_: Exception) {
                    dialogo = UBICACION_APAGADA
                }
                !ubic.ubicacionActivada() -> dialogo = UBICACION_APAGADA
                !ubic.tienePlayServices && !ubic.gpsActivado() -> dialogo = UBICACION_APAGADA
                else -> listo()
            }
        }
    }

    val lanzadorPermiso = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { r ->
        c.sesion.yaPidioUbicacion = true
        ubic.notificarCambioPermiso()
        val fina = r[Manifest.permission.ACCESS_FINE_LOCATION] == true || ubic.permisoPreciso()
        val gruesa = r[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        val puedePreguntar = actividad != null &&
            ActivityCompat.shouldShowRequestPermissionRationale(actividad, Manifest.permission.ACCESS_FINE_LOCATION)
        dialogo = when {
            fina -> NINGUNO.also { verificarGps() }
            gruesa -> if (puedePreguntar) SOLO_APROXIMADA else DENEGADO_SIEMPRE
            puedePreguntar -> DENEGADO
            else -> DENEGADO_SIEMPRE
        }
    }

    fun pedirPermiso() {
        lanzadorPermiso.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
    }

    fun abrirAjustesApp() {
        contexto.startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", contexto.packageName, null))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }

    fun abrirAjustesUbicacion() {
        try {
            contexto.startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Exception) {
            abrirAjustesApp()
        }
    }

    val cerrar = { dialogo = NINGUNO }
    when (dialogo) {
        EXPLICACION -> Dialogo(
            titulo = stringResource(R.string.permiso_titulo),
            texto = stringResource(R.string.permiso_explicacion),
            confirmar = stringResource(R.string.continuar),
            onConfirmar = { dialogo = NINGUNO; pedirPermiso() },
            onCerrar = cerrar,
        )
        DENEGADO -> Dialogo(
            titulo = stringResource(R.string.permiso_denegado_titulo),
            texto = stringResource(R.string.permiso_denegado),
            confirmar = stringResource(R.string.reintentar),
            onConfirmar = { dialogo = NINGUNO; pedirPermiso() },
            onCerrar = cerrar,
        )
        SOLO_APROXIMADA -> Dialogo(
            titulo = stringResource(R.string.permiso_precisa_titulo),
            texto = stringResource(R.string.permiso_precisa),
            confirmar = stringResource(R.string.reintentar),
            onConfirmar = { dialogo = NINGUNO; pedirPermiso() },
            onCerrar = cerrar,
        )
        DENEGADO_SIEMPRE -> Dialogo(
            titulo = stringResource(R.string.permiso_denegado_titulo),
            texto = stringResource(R.string.permiso_denegado_siempre),
            confirmar = stringResource(R.string.abrir_ajustes),
            onConfirmar = { dialogo = NINGUNO; abrirAjustesApp() },
            onCerrar = cerrar,
        )
        UBICACION_APAGADA -> Dialogo(
            titulo = stringResource(R.string.gps_apagado_titulo),
            texto = stringResource(R.string.gps_apagado),
            confirmar = stringResource(R.string.activar_ubicacion),
            onConfirmar = { dialogo = NINGUNO; abrirAjustesUbicacion() },
            onCerrar = cerrar,
        )
    }

    return remember(ubic) {
        SolicitudUbicacion {
            when {
                ubic.permisoPreciso() -> verificarGps()
                else -> {
                    val puedePreguntar = actividad != null &&
                        ActivityCompat.shouldShowRequestPermissionRationale(actividad, Manifest.permission.ACCESS_FINE_LOCATION)
                    // Si ya lo pidió antes y el sistema no deja volver a preguntar: "no volver a preguntar".
                    dialogo = if (c.sesion.yaPidioUbicacion && !puedePreguntar) DENEGADO_SIEMPRE else EXPLICACION
                }
            }
        }
    }
}

@Composable
private fun Dialogo(titulo: String, texto: String, confirmar: String, onConfirmar: () -> Unit, onCerrar: () -> Unit) {
    AlertDialog(
        onDismissRequest = onCerrar,
        title = { Text(titulo) },
        text = { Text(texto) },
        confirmButton = { TextButton(onClick = onConfirmar) { Text(confirmar) } },
        dismissButton = { TextButton(onClick = onCerrar) { Text(stringResource(R.string.cancelar)) } },
    )
}
