package com.jujuypass.turista.ui.auth

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.jujuypass.turista.BuildConfig
import com.jujuypass.turista.R
import com.jujuypass.turista.data.Repositorio
import com.jujuypass.turista.data.SesionStore
import com.jujuypass.turista.ui.comun.textoError
import com.jujuypass.turista.ui.comun.vm
import com.jujuypass.turista.ui.tema.Paleta
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface EstadoPrueba {
    data object Nada : EstadoPrueba
    data object Probando : EstadoPrueba
    data class Ok(val version: String?) : EstadoPrueba
    data class Fallo(val error: Throwable) : EstadoPrueba
}

class ServidorViewModel(private val repo: Repositorio, private val sesion: SesionStore) : ViewModel() {
    private val _prueba = MutableStateFlow<EstadoPrueba>(EstadoPrueba.Nada)
    val prueba = _prueba.asStateFlow()

    fun urlActual() = sesion.urlApi()

    fun probar(url: String) {
        _prueba.value = EstadoPrueba.Probando
        viewModelScope.launch {
            _prueba.value = try {
                val r = repo.probarServidor(SesionStore.normalizarUrl(url))
                if (r.ok) EstadoPrueba.Ok(r.version) else EstadoPrueba.Fallo(IllegalStateException("ok=false"))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                EstadoPrueba.Fallo(e)
            }
        }
    }

    fun guardar(url: String?) = sesion.guardarUrlApi(url)
}

/** Pantalla oculta (solo debug): mantener apretado el logo del login. */
@Composable
fun ServidorScreen(onVolver: () -> Unit) {
    val vm = vm { c, _ -> ServidorViewModel(c.repo, c.sesion) }
    val prueba by vm.prueba.collectAsStateWithLifecycle()
    var url by rememberSaveable { mutableStateOf(vm.urlActual()) }

    if (!BuildConfig.DEBUG) {
        LaunchedEffect(Unit) { onVolver() }
        return
    }
    MarcoAuth {
        Text(stringResource(R.string.servidor_titulo), style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))
        Text(stringResource(R.string.servidor_ayuda, BuildConfig.API_URL), style = MaterialTheme.typography.bodyMedium, color = Paleta.TextoSuave)
        Spacer(Modifier.height(16.dp))
        OutlinedTextField(
            value = url,
            onValueChange = { url = it },
            label = { Text(stringResource(R.string.servidor_url)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        when (val p = prueba) {
            EstadoPrueba.Nada -> {}
            EstadoPrueba.Probando -> Text(stringResource(R.string.servidor_probando))
            is EstadoPrueba.Ok -> Text(stringResource(R.string.servidor_ok, p.version ?: "?"), color = Paleta.Turquesa)
            is EstadoPrueba.Fallo -> Text(textoError(p.error), color = MaterialTheme.colorScheme.error)
        }
        Spacer(Modifier.height(16.dp))
        Row {
            OutlinedButton(onClick = { vm.probar(url) }) { Text(stringResource(R.string.servidor_probar)) }
            Spacer(Modifier.width(12.dp))
            Button(onClick = { vm.guardar(url); onVolver() }) { Text(stringResource(R.string.guardar)) }
        }
        Spacer(Modifier.height(8.dp))
        TextButton(onClick = { vm.guardar(null); url = BuildConfig.API_URL }) {
            Text(stringResource(R.string.servidor_restablecer))
        }
    }
}
