package com.jujuypass.turista.ui.cupones

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import com.jujuypass.turista.R
import com.jujuypass.turista.data.Canje
import com.jujuypass.turista.data.Repositorio
import com.jujuypass.turista.dominio.Formatos
import com.jujuypass.turista.ui.comun.CargaViewModel
import com.jujuypass.turista.ui.comun.Etiqueta
import com.jujuypass.turista.ui.comun.ListaRemota
import com.jujuypass.turista.ui.comun.Tarjeta
import com.jujuypass.turista.ui.comun.Vacio
import com.jujuypass.turista.ui.comun.vm
import com.jujuypass.turista.ui.tema.EstiloCodigo
import com.jujuypass.turista.ui.tema.Paleta

class CuponesViewModel(repo: Repositorio) : CargaViewModel<List<Canje>>({
    repo.misCupones().sortedWith(compareBy<Canje> { if (it.estado == Canje.DISPONIBLE) 0 else 1 }.thenByDescending { it.creadoEn ?: "" })
})

@Composable
fun CuponesScreen(onIrBeneficios: () -> Unit) {
    val vm = vm { c, _ -> CuponesViewModel(c.repo) }
    val carga by vm.estado.collectAsStateWithLifecycle()
    var abierto by rememberSaveable { mutableStateOf<Int?>(null) }

    ListaRemota(
        carga = carga,
        onRecargar = vm::recargar,
        vacio = {
            Vacio(Icons.Default.ShoppingCart, stringResource(R.string.cupones_vacio), stringResource(R.string.cupones_vacio_detalle)) {
                TextButton(onClick = onIrBeneficios) { Text(stringResource(R.string.ver_beneficios)) }
            }
        },
    ) { lista ->
        items(lista, key = { it.id }) { c -> TarjetaCupon(c) { abierto = c.id } }
    }

    val cupon = carga.datos?.firstOrNull { it.id == abierto }
    if (cupon != null) {
        Dialog(onDismissRequest = { abierto = null }) {
            Tarjeta {
                Column(
                    Modifier.verticalScroll(rememberScrollState()).padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(cupon.beneficio.titulo, style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
                    cupon.beneficio.negocioNombre?.let { Text(it, color = Paleta.Turquesa) }
                    Spacer(Modifier.height(12.dp))
                    EtiquetaEstado(cupon.estado)
                    Spacer(Modifier.height(12.dp))
                    val activo = cupon.estado == Canje.DISPONIBLE
                    CodigoQr(cupon.codigo, Modifier.fillMaxWidth().widthIn(max = 300.dp).aspectRatio(1f).alpha(if (activo) 1f else 0.3f))
                    Spacer(Modifier.height(12.dp))
                    Text(cupon.codigo, style = EstiloCodigo, color = if (activo) Paleta.TerracotaOscuro else Paleta.TextoSuave)
                    Spacer(Modifier.height(8.dp))
                    Vencimiento(cupon)
                    Spacer(Modifier.height(8.dp))
                    Text(
                        stringResource(if (activo) R.string.cupon_instrucciones else R.string.cupon_no_disponible),
                        style = MaterialTheme.typography.bodySmall,
                        textAlign = TextAlign.Center,
                        color = Paleta.TextoSuave,
                    )
                    TextButton(onClick = { abierto = null }) { Text(stringResource(R.string.cerrar)) }
                }
            }
        }
    }
}

@Composable
private fun TarjetaCupon(c: Canje, onClick: () -> Unit) {
    val activo = c.estado == Canje.DISPONIBLE
    Tarjeta(onClick = onClick) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(c.beneficio.titulo, style = MaterialTheme.typography.titleMedium)
                    c.beneficio.negocioNombre?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = Paleta.Turquesa) }
                }
                EtiquetaEstado(c.estado)
            }
            Spacer(Modifier.height(10.dp))
            Text(c.codigo, style = EstiloCodigo, color = if (activo) Paleta.TerracotaOscuro else Paleta.TextoSuave)
            Spacer(Modifier.height(4.dp))
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Vencimiento(c)
                if (activo) Text(stringResource(R.string.ver_qr), color = Paleta.Terracota, style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}

@Composable
private fun Vencimiento(c: Canje) {
    val texto = when (c.estado) {
        Canje.USADO -> c.usadoEn?.let { stringResource(R.string.usado_el, Formatos.fechaHora(it)) }
        else -> c.venceEn?.let { stringResource(if (c.estado == Canje.VENCIDO) R.string.vencio_el else R.string.vence_el, Formatos.fecha(it)) }
    }
    if (texto != null) Text(texto, style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave)
}

@Composable
fun EtiquetaEstado(estado: String) {
    val (texto, fondo, color) = when (estado) {
        Canje.DISPONIBLE -> Triple(stringResource(R.string.estado_disponible), Paleta.TurquesaClaro, Paleta.Turquesa)
        Canje.USADO -> Triple(stringResource(R.string.estado_usado), Paleta.Arena, Paleta.TextoSuave)
        Canje.VENCIDO -> Triple(stringResource(R.string.estado_vencido), Paleta.ErrorClaro, Paleta.Error)
        Canje.ANULADO -> Triple(stringResource(R.string.estado_anulado), Paleta.ErrorClaro, Paleta.Error)
        else -> Triple(estado, Paleta.Arena, Paleta.Texto)
    }
    Etiqueta(texto, fondo, color)
}

/** QR generado localmente con ZXing (el código es personal y de un solo uso). */
@Composable
fun CodigoQr(texto: String, modifier: Modifier = Modifier) {
    val bitmap = remember(texto) { generarQr(texto, 512) }
    if (bitmap != null) {
        Image(
            bitmap.asImageBitmap(),
            contentDescription = stringResource(R.string.qr_descripcion, texto),
            modifier = modifier.background(Color.White),
            filterQuality = FilterQuality.None,
        )
    }
}

private fun generarQr(texto: String, lado: Int): Bitmap? = try {
    val hints = mapOf(EncodeHintType.MARGIN to 1, EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M)
    val m = QRCodeWriter().encode(texto, BarcodeFormat.QR_CODE, lado, lado, hints)
    val px = IntArray(m.width * m.height)
    for (y in 0 until m.height) {
        val fila = y * m.width
        for (x in 0 until m.width) px[fila + x] = if (m[x, y]) 0xFF292524.toInt() else 0xFFFFFFFF.toInt()
    }
    Bitmap.createBitmap(px, m.width, m.height, Bitmap.Config.ARGB_8888)
} catch (_: Exception) {
    null
}
