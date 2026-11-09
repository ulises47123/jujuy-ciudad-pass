package com.jujuypass.turista

import android.app.Application
import com.jujuypass.turista.data.ApiCliente
import com.jujuypass.turista.data.Repositorio
import com.jujuypass.turista.data.SesionStore
import com.jujuypass.turista.ubicacion.ProveedorUbicacion
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.serialization.json.Json
import org.osmdroid.config.Configuration
import java.io.File

/** Dependencias de la app (inyección manual, sin frameworks). */
class Contenedor(app: Application) {
    val alcance = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = true
        isLenient = true
    }
    val sesion = SesionStore(app, json)
    val api = ApiCliente(sesion, json)
    val repo = Repositorio(api, sesion)
    val ubicacion = ProveedorUbicacion(app, alcance)
}

class JujuyPassApp : Application() {
    lateinit var contenedor: Contenedor
        private set

    override fun onCreate() {
        super.onCreate()
        contenedor = Contenedor(this)
        configurarOsmdroid()
    }

    private fun configurarOsmdroid() {
        val conf = Configuration.getInstance()
        conf.userAgentValue = "JujuyPass/1.0"
        // Todo en almacenamiento privado: no hace falta permiso de almacenamiento.
        conf.osmdroidBasePath = File(filesDir, "osmdroid").apply { mkdirs() }
        conf.osmdroidTileCache = File(cacheDir, "osmdroid/tiles").apply { mkdirs() }
        conf.tileFileSystemCacheMaxBytes = 60L * 1024 * 1024
        conf.tileFileSystemCacheTrimBytes = 45L * 1024 * 1024
    }
}
