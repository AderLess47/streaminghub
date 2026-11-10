package de.streaminghub.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

val Ink = Color(0xFF080B12)
val Ink800 = Color(0xFF0B101A)
val Panel = Color(0xFF111827)
val Panel2 = Color(0xFF0D1420)
val Brand = Color(0xFF2563EB)
val BrandLight = Color(0xFF3B82F6)
val Cyan = Color(0xFF06B6D4)
val Foreground = Color(0xFFF3F6FB)
val Muted = Color(0xFF9AA8BD)
val Line = Color(0xFF22304A)
val Rose = Color(0xFFFB7185)
val Amber = Color(0xFFFCD34D)

private val StreamingHubColors = darkColorScheme(
    primary = BrandLight,
    onPrimary = Color.White,
    primaryContainer = Brand,
    onPrimaryContainer = Color.White,
    secondary = Cyan,
    onSecondary = Ink,
    secondaryContainer = Color(0xFF0E3A46),
    onSecondaryContainer = Color(0xFFCFFAFE),
    tertiary = Amber,
    onTertiary = Ink,
    background = Ink,
    onBackground = Foreground,
    surface = Panel,
    onSurface = Foreground,
    surfaceVariant = Panel2,
    onSurfaceVariant = Muted,
    outline = Line,
    error = Rose,
    onError = Ink,
)

private val StreamingHubTypography = Typography(
    displayLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 38.sp,
        lineHeight = 44.sp,
        letterSpacing = (-1).sp,
    ),
    headlineLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 30.sp,
        lineHeight = 36.sp,
        letterSpacing = (-0.7).sp,
    ),
    headlineMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 24.sp,
        lineHeight = 30.sp,
        letterSpacing = (-0.4).sp,
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 20.sp,
        lineHeight = 26.sp,
        letterSpacing = (-0.3).sp,
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
        lineHeight = 22.sp,
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 21.sp,
    ),
    labelLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
        lineHeight = 18.sp,
    ),
    labelMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.3.sp,
    ),
)

@Composable
fun StreamingHubTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = StreamingHubColors,
        typography = StreamingHubTypography,
        content = content,
    )
}
