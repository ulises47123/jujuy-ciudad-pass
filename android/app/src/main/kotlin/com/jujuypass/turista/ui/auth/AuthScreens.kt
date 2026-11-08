package com.jujuypass.turista.ui.auth

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jujuypass.turista.BuildConfig
import com.jujuypass.turista.R
import com.jujuypass.turista.ui.comun.textoError
import com.jujuypass.turista.ui.comun.vm
import com.jujuypass.turista.ui.tema.Paleta

@Composable
internal fun MarcoAuth(content: @Composable () -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .safeDrawingPadding()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(Modifier.widthIn(max = 480.dp).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            content()
        }
    }
}

@Composable
fun BienvenidaScreen(onIngresar: () -> Unit, onRegistrarse: () -> Unit) {
    MarcoAuth {
        Spacer(Modifier.height(48.dp))
        Image(painterResource(R.drawable.logo), null, Modifier.size(140.dp))
        Spacer(Modifier.height(24.dp))
        Text(stringResource(R.string.app_name), style = MaterialTheme.typography.headlineMedium, color = Paleta.TerracotaOscuro)
        Spacer(Modifier.height(8.dp))
        Text(
            stringResource(R.string.bienvenida_lema),
            style = MaterialTheme.typography.titleMedium,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(24.dp))
        Paso("1", stringResource(R.string.bienvenida_paso1))
        Paso("2", stringResource(R.string.bienvenida_paso2))
        Paso("3", stringResource(R.string.bienvenida_paso3))
        Spacer(Modifier.height(32.dp))
        Button(onClick = onIngresar, modifier = Modifier.fillMaxWidth().height(52.dp)) {
            Text(stringResource(R.string.ingresar))
        }
        Spacer(Modifier.height(12.dp))
        OutlinedButton(onClick = onRegistrarse, modifier = Modifier.fillMaxWidth().height(52.dp)) {
            Text(stringResource(R.string.crear_cuenta))
        }
    }
}

@Composable
private fun Paso(numero: String, texto: String) {
    androidx.compose.foundation.layout.Row(
        Modifier.fillMaxWidth().padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Surface(shape = RoundedCornerShape(50), color = Paleta.TurquesaClaro, modifier = Modifier.size(32.dp)) {
            Column(verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                Text(numero, color = Paleta.Turquesa, style = MaterialTheme.typography.labelLarge)
            }
        }
        Spacer(Modifier.size(12.dp))
        Text(texto, style = MaterialTheme.typography.bodyMedium)
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun LoginScreen(onRegistrarse: () -> Unit, onServidor: () -> Unit) {
    val vm = vm { c, _ -> AuthViewModel(c.repo, c.sesion) }
    val estado by vm.estado.collectAsStateWithLifecycle()
    val expirada by vm.sesion.sesionExpirada.collectAsStateWithLifecycle()
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var errorLocal by rememberSaveable { mutableStateOf<Int?>(null) }
    val foco = LocalFocusManager.current
    val haptico = LocalHapticFeedback.current

    fun enviar() {
        errorLocal = when {
            !Validacion.emailValido(email) -> R.string.validacion_email
            password.isEmpty() -> R.string.validacion_password_vacia
            else -> null
        }
        if (errorLocal == null) {
            foco.clearFocus()
            vm.sesion.avisoExpiracionMostrado()
            vm.login(email, password)
        }
    }

    MarcoAuth {
        Spacer(Modifier.height(32.dp))
        Image(
            painterResource(R.drawable.logo),
            stringResource(R.string.app_name),
            Modifier
                .size(110.dp)
                .combinedClickable(
                    onClick = {},
                    onLongClick = {
                        // Pantalla oculta solo en debug para cambiar la URL del servidor
                        if (BuildConfig.DEBUG) {
                            haptico.performHapticFeedback(HapticFeedbackType.LongPress)
                            onServidor()
                        }
                    },
                ),
        )
        Spacer(Modifier.height(16.dp))
        Text(stringResource(R.string.login_titulo), style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(4.dp))
        Text(stringResource(R.string.login_subtitulo), style = MaterialTheme.typography.bodyMedium, color = Paleta.TextoSuave)
        Spacer(Modifier.height(24.dp))
        if (expirada) {
            Surface(color = Paleta.TerracotaClaro, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.sesion_expirada), Modifier.padding(12.dp), color = Paleta.TerracotaOscuro)
            }
            Spacer(Modifier.height(16.dp))
        }
        OutlinedTextField(
            value = email,
            onValueChange = { email = it; vm.limpiarError() },
            label = { Text(stringResource(R.string.campo_email)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        CampoPassword(
            valor = password,
            onCambio = { password = it; vm.limpiarError() },
            etiqueta = stringResource(R.string.campo_password),
            imeAction = ImeAction.Done,
            onListo = { enviar() },
        )
        MensajeError(errorLocal?.let { stringResource(it) } ?: estado.error?.let { textoError(it) })
        Spacer(Modifier.height(20.dp))
        BotonEnviar(stringResource(R.string.ingresar), estado.enviando) { enviar() }
        Spacer(Modifier.height(12.dp))
        TextButton(onClick = onRegistrarse) { Text(stringResource(R.string.login_ir_registro)) }
    }
}

@Composable
fun RegistroScreen(onIrLogin: () -> Unit) {
    val vm = vm { c, _ -> AuthViewModel(c.repo, c.sesion) }
    val estado by vm.estado.collectAsStateWithLifecycle()
    var nombre by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var password2 by rememberSaveable { mutableStateOf("") }
    var procedencia by rememberSaveable { mutableStateOf("") }
    var errorLocal by rememberSaveable { mutableStateOf<Int?>(null) }
    val foco = LocalFocusManager.current

    fun enviar() {
        errorLocal = when {
            nombre.isBlank() -> R.string.validacion_nombre
            !Validacion.emailValido(email) -> R.string.validacion_email
            !Validacion.passwordValida(password) -> R.string.validacion_password_corta
            password != password2 -> R.string.validacion_password_distinta
            else -> null
        }
        if (errorLocal == null) {
            foco.clearFocus()
            vm.registrar(nombre, email, password, procedencia)
        }
    }

    MarcoAuth {
        Spacer(Modifier.height(24.dp))
        Text(stringResource(R.string.registro_titulo), style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(4.dp))
        Text(
            stringResource(R.string.registro_subtitulo),
            style = MaterialTheme.typography.bodyMedium,
            color = Paleta.TextoSuave,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(20.dp))
        OutlinedTextField(
            value = nombre, onValueChange = { nombre = it; vm.limpiarError() },
            label = { Text(stringResource(R.string.campo_nombre)) }, singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = email, onValueChange = { email = it; vm.limpiarError() },
            label = { Text(stringResource(R.string.campo_email)) }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        CampoPassword(password, { password = it; vm.limpiarError() }, stringResource(R.string.campo_password_nueva))
        Spacer(Modifier.height(12.dp))
        CampoPassword(password2, { password2 = it }, stringResource(R.string.campo_password_repetir))
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = procedencia, onValueChange = { procedencia = it },
            label = { Text(stringResource(R.string.campo_procedencia)) }, singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { enviar() }),
            modifier = Modifier.fillMaxWidth(),
        )
        MensajeError(errorLocal?.let { stringResource(it) } ?: estado.error?.let { textoError(it) })
        Spacer(Modifier.height(20.dp))
        BotonEnviar(stringResource(R.string.crear_cuenta), estado.enviando) { enviar() }
        Spacer(Modifier.height(12.dp))
        TextButton(onClick = onIrLogin) { Text(stringResource(R.string.registro_ir_login)) }
    }
}

@Composable
fun CampoPassword(
    valor: String,
    onCambio: (String) -> Unit,
    etiqueta: String,
    imeAction: ImeAction = ImeAction.Next,
    onListo: () -> Unit = {},
) {
    var visible by rememberSaveable { mutableStateOf(false) }
    OutlinedTextField(
        value = valor,
        onValueChange = onCambio,
        label = { Text(etiqueta) },
        singleLine = true,
        visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = imeAction),
        keyboardActions = KeyboardActions(onDone = { onListo() }),
        trailingIcon = {
            TextButton(onClick = { visible = !visible }) {
                Text(stringResource(if (visible) R.string.ocultar else R.string.mostrar))
            }
        },
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
fun MensajeError(texto: String?) {
    if (texto != null) {
        Spacer(Modifier.height(12.dp))
        Text(texto, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
fun BotonEnviar(texto: String, enviando: Boolean, onClick: () -> Unit) {
    Button(onClick = onClick, enabled = !enviando, modifier = Modifier.fillMaxWidth().height(52.dp)) {
        if (enviando) {
            CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
        } else {
            Text(texto)
        }
    }
}
