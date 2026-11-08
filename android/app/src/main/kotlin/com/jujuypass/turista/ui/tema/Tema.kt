package com.jujuypass.turista.ui.tema

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// Paleta del prototipo web
object Paleta {
    val Crema = Color(0xFFFBF9F5)
    val Arena = Color(0xFFF4EDE4)
    val Terracota = Color(0xFFC25E2E)
    val TerracotaOscuro = Color(0xFF9C431B)
    val TerracotaClaro = Color(0xFFFBEEE7)
    val Turquesa = Color(0xFF0F766E)
    val TurquesaClaro = Color(0xFFE6F6F4)
    val Texto = Color(0xFF292524)
    val TextoSuave = Color(0xFF6B635C)
    val Borde = Color(0xFFE7DED5)
    val Error = Color(0xFFB3261E)
    val ErrorClaro = Color(0xFFFCE8E6)
    val Dorado = Color(0xFFB7791F)
}

private val esquema = lightColorScheme(
    primary = Paleta.Terracota,
    onPrimary = Color.White,
    primaryContainer = Paleta.TerracotaClaro,
    onPrimaryContainer = Paleta.TerracotaOscuro,
    secondary = Paleta.Turquesa,
    onSecondary = Color.White,
    secondaryContainer = Paleta.TurquesaClaro,
    onSecondaryContainer = Paleta.Turquesa,
    tertiary = Paleta.TerracotaOscuro,
    onTertiary = Color.White,
    background = Paleta.Crema,
    onBackground = Paleta.Texto,
    surface = Paleta.Crema,
    onSurface = Paleta.Texto,
    surfaceVariant = Paleta.Arena,
    onSurfaceVariant = Paleta.TextoSuave,
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFFDFBF8),
    surfaceContainer = Paleta.Arena,
    surfaceContainerHigh = Paleta.Arena,
    surfaceContainerHighest = Color(0xFFEFE6DB),
    outline = Paleta.Borde,
    outlineVariant = Paleta.Borde,
    error = Paleta.Error,
    onError = Color.White,
    errorContainer = Paleta.ErrorClaro,
    onErrorContainer = Paleta.Error,
)

private val base = Typography()
private val tipografia = Typography(
    headlineMedium = base.headlineMedium.copy(fontWeight = FontWeight.Bold),
    headlineSmall = base.headlineSmall.copy(fontWeight = FontWeight.Bold),
    titleLarge = base.titleLarge.copy(fontWeight = FontWeight.Bold),
    titleMedium = base.titleMedium.copy(fontWeight = FontWeight.SemiBold),
    labelLarge = base.labelLarge.copy(fontWeight = FontWeight.SemiBold),
)

val EstiloCodigo = TextStyle(fontSize = 30.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)

private val formas = Shapes(
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(20.dp),
)

@Composable
fun TemaJujuyPass(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = esquema, typography = tipografia, shapes = formas, content = content)
}
