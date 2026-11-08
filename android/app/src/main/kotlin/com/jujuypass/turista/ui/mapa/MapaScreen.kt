package com.jujuypass.turista.ui.mapa

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jujuypass.turista.R
import com.jujuypass.turista.dominio.Formatos
import com.jujuypass.turista.ui.comun.BandaError
import com.jujuypass.turista.ui.comun.Tarjeta
import com.jujuypass.turista.ui.comun.contenedor
import com.jujuypass.turista.ui.comun.vm
import com.jujuypass.turista.ui.lugar.rememberSolicitudUbicacion
import com.jujuypass.turista.ui.misiones.LugaresViewModel
import com.jujuypass.turista.ui.tema.Paleta
import org.osmdroid.events.MapEventsReceiver
import org.osmdroid.events.MapListener
import org.osmdroid.events.ScrollEvent
import org.osmdroid.events.ZoomEvent
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.CustomZoomButtonsController
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.FolderOverlay
import org.osmdroid.views.overlay.MapEventsOverlay
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polygon

private val CENTRO_JUJUY = GeoPoint(-24.1858, -65.2995)

@Composable
fun MapaScreen(onAbrirLugar: (Int) -> Unit) {
    val vm = vm { c, _ -> LugaresViewModel(c.repo, c.ubicacion) }
    val lista by vm.lista.collectAsStateWithLifecycle()
    val yo by vm.miUbicacion.collectAsStateWithLifecycle()
    val ubic = contenedor().ubicacion
    val ctx = LocalContext.current

    var seleccionado by rememberSaveable { mutableStateOf<Int?>(null) }
    // Cámara guardada para sobrevivir a la rotación: lat, lon, zoom
    var camara by rememberSaveable { mutableStateOf(doubleArrayOf(CENTRO_JUJUY.latitude, CENTRO_JUJUY.longitude, 15.0)) }
    var centrarAlLlegar by remember { mutableStateOf(false) }

    val capaLugares = remember { FolderOverlay() }
    val capaYo = remember { FolderOverlay() }
    val mapa = remember {
        MapView(ctx).apply {
            setTileSource(TileSourceFactory.MAPNIK)
            setMultiTouchControls(true)
            zoomController.setVisibility(CustomZoomButtonsController.Visibility.NEVER)
            minZoomLevel = 4.0
            maxZoomLevel = 19.0
            isTilesScaledToDpi = true
            controller.setZoom(camara[2])
            controller.setCenter(GeoPoint(camara[0], camara[1]))
            overlays.add(
                MapEventsOverlay(object : MapEventsReceiver {
                    override fun singleTapConfirmedHelper(p: GeoPoint?): Boolean {
                        seleccionado = null
                        return false
                    }
                    override fun longPressHelper(p: GeoPoint?): Boolean = false
                }),
            )
            overlays.add(capaLugares)
            overlays.add(capaYo)
            addMapListener(object : MapListener {
                override fun onScroll(event: ScrollEvent?): Boolean {
                    guardar(this@apply) { camara = it }
                    return false
                }
                override fun onZoom(event: ZoomEvent?): Boolean {
                    guardar(this@apply) { camara = it }
                    return false
                }
            })
        }
    }

    val ciclo = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(ciclo) {
        val obs = LifecycleEventObserver { _, e ->
            when (e) {
                Lifecycle.Event.ON_RESUME -> mapa.onResume()
                Lifecycle.Event.ON_PAUSE -> mapa.onPause()
                else -> {}
            }
        }
        ciclo.addObserver(obs)
        onDispose {
            ciclo.removeObserver(obs)
            mapa.onDetach()
        }
    }

    // Lugares: círculo del radio + marcador
    val lugares = lista.datos
    LaunchedEffect(lugares?.map { it.lugar }) {
        capaLugares.items.toList().forEach { capaLugares.remove(it) }
        val pin = ContextCompat.getDrawable(ctx, R.drawable.pin_lugar)
        val pinVisitado = ContextCompat.getDrawable(ctx, R.drawable.pin_visitado)
        lugares.orEmpty().forEach { l ->
            val centro = GeoPoint(l.lugar.latitud, l.lugar.longitud)
            val visitado = l.lugar.visitado
            capaLugares.add(
                Polygon(mapa).apply {
                    points = Polygon.pointsAsCircle(centro, l.lugar.radioM)
                    fillPaint.color = if (visitado) 0x330F766E else 0x33C25E2E
                    outlinePaint.color = if (visitado) 0xFF0F766E.toInt() else 0xFFC25E2E.toInt()
                    outlinePaint.strokeWidth = 3f
                    infoWindow = null
                    setOnClickListener { _, _, _ -> false }
                },
            )
            capaLugares.add(
                Marker(mapa).apply {
                    position = centro
                    title = l.lugar.nombre
                    icon = if (visitado) pinVisitado else pin
                    setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                    infoWindow = null
                    setOnMarkerClickListener { _, _ ->
                        seleccionado = l.lugar.id
                        true
                    }
                },
            )
        }
        mapa.invalidate()
    }

    // Mi posición: círculo de precisión + punto azul
    LaunchedEffect(yo) {
        capaYo.items.toList().forEach { capaYo.remove(it) }
        val y = yo ?: return@LaunchedEffect mapa.invalidate()
        val p = GeoPoint(y.latitude, y.longitude)
        if (y.hasAccuracy() && y.accuracy > 0) {
            capaYo.add(
                Polygon(mapa).apply {
                    points = Polygon.pointsAsCircle(p, y.accuracy.toDouble())
                    fillPaint.color = 0x221D4ED8
                    outlinePaint.color = 0x661D4ED8
                    outlinePaint.strokeWidth = 2f
                    infoWindow = null
                    setOnClickListener { _, _, _ -> false }
                },
            )
        }
        capaYo.add(
            Marker(mapa).apply {
                position = p
                icon = ContextCompat.getDrawable(ctx, R.drawable.punto_yo)
                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                infoWindow = null
                setOnMarkerClickListener { _, _ -> true }
            },
        )
        if (centrarAlLlegar) {
            centrarAlLlegar = false
            mapa.controller.animateTo(p, 17.0, 600L)
        }
        mapa.invalidate()
    }

    val solicitud = rememberSolicitudUbicacion {
        ubic.notificarCambioPermiso()
        centrarAlLlegar = true
    }

    Box(Modifier.fillMaxSize()) {
        AndroidView(factory = { mapa }, modifier = Modifier.fillMaxSize())

        // Atribución obligatoria de OpenStreetMap
        Surface(
            color = androidx.compose.ui.graphics.Color.White.copy(alpha = 0.8f),
            modifier = Modifier.align(Alignment.BottomStart).padding(4.dp),
        ) {
            Text(stringResource(R.string.osm_atribucion), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal = 4.dp))
        }

        Column(Modifier.align(Alignment.TopCenter).fillMaxWidth().padding(12.dp)) {
            if (lista.cargando && lugares == null) {
                Surface(shape = MaterialTheme.shapes.medium, color = Paleta.Crema) {
                    Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(Modifier.width(18.dp).height(18.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(8.dp))
                        Text(stringResource(R.string.cargando_lugares))
                    }
                }
            }
            lista.error?.let { BandaError(it, vm::recargar) }
        }

        Column(Modifier.align(Alignment.BottomEnd).padding(16.dp), horizontalAlignment = Alignment.End) {
            SmallFloatingActionButton(onClick = vm::recargar, containerColor = Paleta.Crema) {
                Icon(Icons.Default.Refresh, stringResource(R.string.recargar))
            }
            Spacer(Modifier.height(12.dp))
            FloatingActionButton(
                onClick = {
                    val y = yo
                    if (y != null) {
                        mapa.controller.animateTo(GeoPoint(y.latitude, y.longitude), 17.0, 600L)
                    } else {
                        solicitud.solicitar()
                    }
                },
                containerColor = Paleta.Turquesa,
                contentColor = Paleta.Crema,
            ) { Icon(Icons.Default.LocationOn, stringResource(R.string.mi_ubicacion)) }
            Spacer(Modifier.height(if (seleccionado != null) 150.dp else 8.dp))
        }

        val sel = lugares?.firstOrNull { it.lugar.id == seleccionado }
        if (sel != null) {
            Box(Modifier.align(Alignment.BottomCenter).padding(12.dp)) {
                Tarjeta {
                    Column(Modifier.padding(16.dp)) {
                        Text(sel.lugar.nombre, style = MaterialTheme.typography.titleMedium)
                        val partes = buildList {
                            add(stringResource(R.string.puntos_abrev, sel.lugar.puntos))
                            sel.distanciaM?.let { add(stringResource(R.string.a_distancia, Formatos.distancia(it))) }
                            if (sel.lugar.visitado) add(stringResource(R.string.visitado))
                        }
                        Text(partes.joinToString(" · "), style = MaterialTheme.typography.bodyMedium, color = Paleta.TextoSuave)
                        Spacer(Modifier.height(10.dp))
                        Button(onClick = { onAbrirLugar(sel.lugar.id) }, modifier = Modifier.fillMaxWidth()) {
                            Text(stringResource(R.string.ver_detalle))
                        }
                    }
                }
            }
        }
    }
}

private inline fun guardar(m: MapView, set: (DoubleArray) -> Unit) {
    val c = m.mapCenter
    set(doubleArrayOf(c.latitude, c.longitude, m.zoomLevelDouble))
}
