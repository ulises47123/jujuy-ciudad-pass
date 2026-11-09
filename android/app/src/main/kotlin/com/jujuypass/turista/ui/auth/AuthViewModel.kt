package com.jujuypass.turista.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jujuypass.turista.data.Repositorio
import com.jujuypass.turista.data.SesionStore
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class EstadoEnvio(
    val enviando: Boolean = false,
    val error: Throwable? = null,
)

class AuthViewModel(private val repo: Repositorio, val sesion: SesionStore) : ViewModel() {

    private val _estado = MutableStateFlow(EstadoEnvio())
    val estado: StateFlow<EstadoEnvio> = _estado.asStateFlow()

    fun limpiarError() {
        _estado.value = _estado.value.copy(error = null)
    }

    fun login(email: String, password: String) = enviar { repo.login(email, password) }

    fun registrar(nombre: String, email: String, password: String, procedencia: String?) =
        enviar { repo.registrar(nombre, email, password, procedencia) }

    private fun enviar(accion: suspend () -> Unit) {
        if (_estado.value.enviando) return
        _estado.value = EstadoEnvio(enviando = true)
        viewModelScope.launch {
            try {
                accion()
                _estado.value = EstadoEnvio()
                // Al guardarse el token, la navegación raíz cambia sola a la app principal.
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _estado.value = EstadoEnvio(error = e)
            }
        }
    }
}

object Validacion {
    private val regexEmail = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")
    fun emailValido(email: String) = regexEmail.matches(email.trim())
    fun passwordValida(p: String) = p.length >= 8
}
