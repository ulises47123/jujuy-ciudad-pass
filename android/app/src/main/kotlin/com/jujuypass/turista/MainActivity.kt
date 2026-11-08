package com.jujuypass.turista

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.jujuypass.turista.ui.Raiz
import com.jujuypass.turista.ui.tema.TemaJujuyPass

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            TemaJujuyPass { Raiz() }
        }
    }

    override fun onResume() {
        super.onResume()
        // Al volver de Ajustes (permiso o GPS), reinicia el seguimiento si algo cambió.
        (application as JujuyPassApp).contenedor.ubicacion.revisarCambios()
    }
}
