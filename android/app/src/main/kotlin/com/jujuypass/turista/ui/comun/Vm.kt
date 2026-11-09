package com.jujuypass.turista.ui.comun

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.jujuypass.turista.Contenedor
import com.jujuypass.turista.JujuyPassApp

@Composable
fun contenedor(): Contenedor = (LocalContext.current.applicationContext as JujuyPassApp).contenedor

/** Crea (o recupera tras rotar) un ViewModel con acceso al contenedor y al SavedStateHandle. */
@Composable
inline fun <reified VM : ViewModel> vm(crossinline crear: (Contenedor, SavedStateHandle) -> VM): VM {
    val c = contenedor()
    return viewModel(factory = viewModelFactory { initializer { crear(c, createSavedStateHandle()) } })
}
