package com.jujuypass.turista.ui

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.jujuypass.turista.R
import com.jujuypass.turista.ui.auth.BienvenidaScreen
import com.jujuypass.turista.ui.auth.LoginScreen
import com.jujuypass.turista.ui.auth.RegistroScreen
import com.jujuypass.turista.ui.auth.ServidorScreen
import com.jujuypass.turista.ui.beneficios.BeneficiosScreen
import com.jujuypass.turista.ui.comun.contenedor
import com.jujuypass.turista.ui.cupones.CuponesScreen
import com.jujuypass.turista.ui.historial.HistorialScreen
import com.jujuypass.turista.ui.lugar.LugarScreen
import com.jujuypass.turista.ui.mapa.MapaScreen
import com.jujuypass.turista.ui.misiones.MisionesScreen
import com.jujuypass.turista.ui.perfil.PerfilScreen
import com.jujuypass.turista.ui.recomendaciones.RecomendacionesScreen
import com.jujuypass.turista.ui.tema.Paleta

/** Raíz: sin token → flujo de bienvenida/login; con token → app principal. Un 401 borra el token y vuelve acá. */
@Composable
fun Raiz() {
    val sesion = contenedor().sesion
    val token by sesion.token.collectAsStateWithLifecycle()
    key(token != null) {
        if (token == null) NavegacionAuth() else NavegacionPrincipal()
    }
}

private object Rutas {
    const val BIENVENIDA = "bienvenida"
    const val LOGIN = "login"
    const val REGISTRO = "registro"
    const val SERVIDOR = "servidor"
    const val MISIONES = "misiones"
    const val MAPA = "mapa"
    const val BENEFICIOS = "beneficios"
    const val CUPONES = "cupones"
    const val PERFIL = "perfil"
    const val HISTORIAL = "historial"
    const val RECOMENDACIONES = "recomendaciones"
    const val LUGAR = "lugar/{id}"
    fun lugar(id: Int) = "lugar/$id"
}

@Composable
private fun NavegacionAuth() {
    val nav = rememberNavController()
    val sesion = contenedor().sesion
    // Si la sesión expiró, ir directo al login
    val inicio = if (sesion.sesionExpirada.value) Rutas.LOGIN else Rutas.BIENVENIDA
    NavHost(nav, startDestination = inicio) {
        composable(Rutas.BIENVENIDA) {
            BienvenidaScreen(onIngresar = { nav.navigate(Rutas.LOGIN) }, onRegistrarse = { nav.navigate(Rutas.REGISTRO) })
        }
        composable(Rutas.LOGIN) {
            LoginScreen(
                onRegistrarse = { nav.navigate(Rutas.REGISTRO) { popUpTo(Rutas.LOGIN) { inclusive = true } } },
                onServidor = { nav.navigate(Rutas.SERVIDOR) },
            )
        }
        composable(Rutas.REGISTRO) {
            RegistroScreen(onIrLogin = { nav.navigate(Rutas.LOGIN) { popUpTo(Rutas.REGISTRO) { inclusive = true } } })
        }
        composable(Rutas.SERVIDOR) { ServidorScreen(onVolver = { nav.popBackStack() }) }
    }
}

private data class Pestania(val ruta: String, @StringRes val titulo: Int, val icono: @Composable () -> Painter)

private val pestanias = listOf(
    Pestania(Rutas.MISIONES, R.string.tab_misiones) { rememberVectorPainter(Icons.Default.Place) },
    Pestania(Rutas.MAPA, R.string.tab_mapa) { rememberVectorPainter(Icons.Default.LocationOn) },
    Pestania(Rutas.BENEFICIOS, R.string.tab_beneficios) { rememberVectorPainter(Icons.Default.ShoppingCart) },
    Pestania(Rutas.CUPONES, R.string.tab_cupones) { painterResource(R.drawable.ic_cupon) },
    Pestania(Rutas.PERFIL, R.string.tab_perfil) { rememberVectorPainter(Icons.Default.Person) },
)

private fun NavHostController.irAPestania(ruta: String) {
    navigate(ruta) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NavegacionPrincipal() {
    val nav = rememberNavController()
    val entrada by nav.currentBackStackEntryAsState()
    val ruta = entrada?.destination?.route
    val esLugar = ruta == Rutas.LUGAR
    val pestania = pestanias.firstOrNull { it.ruta == ruta }
    val tituloSecundario = when (ruta) {
        Rutas.HISTORIAL -> R.string.historial
        Rutas.RECOMENDACIONES -> R.string.recomendaciones
        else -> null
    }

    Scaffold(
        topBar = {
            if (!esLugar) {
                TopAppBar(
                    title = {
                        Text(
                            stringResource(pestania?.titulo ?: tituloSecundario ?: R.string.app_name),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    },
                    navigationIcon = {
                        if (tituloSecundario != null) {
                            IconButton(onClick = { nav.popBackStack() }) {
                                Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.volver))
                            }
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = Paleta.Crema, titleContentColor = Paleta.Texto),
                )
            }
        },
        bottomBar = {
            if (!esLugar) {
                NavigationBar(containerColor = Paleta.Arena) {
                    pestanias.forEach { p ->
                        val activa = entrada?.destination?.hierarchy?.any { it.route == p.ruta } == true ||
                            (p.ruta == Rutas.PERFIL && tituloSecundario != null)
                        NavigationBarItem(
                            selected = activa,
                            onClick = { nav.irAPestania(p.ruta) },
                            icon = { Icon(p.icono(), null) },
                            label = { Text(stringResource(p.titulo), maxLines = 1) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = Paleta.TerracotaOscuro,
                                selectedTextColor = Paleta.TerracotaOscuro,
                                indicatorColor = Paleta.TerracotaClaro,
                            ),
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(
            nav,
            startDestination = Rutas.MISIONES,
            modifier = Modifier.padding(if (esLugar) PaddingValues(0.dp) else padding),
        ) {
            composable(Rutas.MISIONES) { MisionesScreen(onAbrirLugar = { nav.navigate(Rutas.lugar(it)) }) }
            composable(Rutas.MAPA) { MapaScreen(onAbrirLugar = { nav.navigate(Rutas.lugar(it)) }) }
            composable(Rutas.BENEFICIOS) { BeneficiosScreen(onVerCupones = { nav.irAPestania(Rutas.CUPONES) }) }
            composable(Rutas.CUPONES) { CuponesScreen(onIrBeneficios = { nav.irAPestania(Rutas.BENEFICIOS) }) }
            composable(Rutas.PERFIL) {
                PerfilScreen(
                    onHistorial = { nav.navigate(Rutas.HISTORIAL) },
                    onRecomendaciones = { nav.navigate(Rutas.RECOMENDACIONES) },
                )
            }
            composable(Rutas.HISTORIAL) { HistorialScreen() }
            composable(Rutas.RECOMENDACIONES) { RecomendacionesScreen() }
            composable(Rutas.LUGAR, arguments = listOf(navArgument("id") { type = NavType.IntType })) {
                LugarScreen(onVolver = { nav.popBackStack() })
            }
        }
    }
}
