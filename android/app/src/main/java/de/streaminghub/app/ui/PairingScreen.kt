package de.streaminghub.app.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.streaminghub.app.AccountUiState
import de.streaminghub.app.data.DeviceIdentity
import de.streaminghub.app.ui.theme.Cyan
import de.streaminghub.app.ui.theme.Foreground
import de.streaminghub.app.ui.theme.Ink
import de.streaminghub.app.ui.theme.Line
import de.streaminghub.app.ui.theme.Muted
import de.streaminghub.app.ui.theme.Panel
import de.streaminghub.app.ui.theme.Panel2

@Composable
fun PairingScreen(
    state: AccountUiState,
    onStartPairing: () -> Unit,
    onDismissPairingError: () -> Unit,
    onBack: () -> Unit,
    onPaired: () -> Unit,
) {
    val context = LocalContext.current
    var copied by remember { mutableStateOf(false) }
    val clipboard = remember(context) {
        context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
    }

    LaunchedEffect(state.account, state.pairedSuccessfully) {
        if (state.account != null || state.pairedSuccessfully) {
            onPaired()
        }
    }

    BackHandler(onBack = onBack)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(Ink, Color(0xFF0B101A), Ink))),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AppIconButton(
                    icon = Icons.AutoMirrored.Rounded.ArrowBack,
                    contentDescription = "Zurück",
                    onClick = onBack,
                )
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text("Gerät koppeln", color = Foreground, style = MaterialTheme.typography.headlineMedium)
                    Text("StreamingHub-Konto und Gerätestatus", color = Muted, fontSize = 12.sp)
                }
                BrandMark(size = 36.dp)
            }

            Spacer(Modifier.height(24.dp))

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(24.dp))
                    .background(Panel)
                    .padding(22.dp),
            ) {
                Text(
                    "So funktioniert die Kopplung",
                    color = Foreground,
                    style = MaterialTheme.typography.titleLarge,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    "Öffne streaminghub.org/activate auf deinem Handy, melde dich an und gib den Code ein. Der Code ist nur wenige Minuten gültig.",
                    color = Muted,
                    style = MaterialTheme.typography.bodyMedium,
                )

                Spacer(Modifier.height(22.dp))

                if (state.pairing != null) {
                    Text(
                        text = "DEIN KOPPLUNGSCODE",
                        color = Cyan,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = 1.6.sp,
                    )
                    Spacer(Modifier.height(8.dp))
                    SelectionContainer {
                        Text(
                            text = state.pairing.code,
                            color = Color.White,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold,
                            fontSize = 34.sp,
                            letterSpacing = 2.sp,
                        )
                    }
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        PrimaryAction(
                            text = if (copied) "Code kopiert" else "Code kopieren",
                            icon = Icons.Rounded.ContentCopy,
                            onClick = {
                                clipboard?.setPrimaryClip(
                                    ClipData.newPlainText("StreamingHub Kopplungscode", state.pairing.code),
                                )
                                copied = true
                            },
                        )
                        SecondaryAction(
                            text = "Neuer Code",
                            icon = Icons.Rounded.Refresh,
                            onClick = {
                                copied = false
                                onStartPairing()
                            },
                            enabled = !state.pairingBusy,
                        )
                    }

                    Spacer(Modifier.height(18.dp))
                    if (state.pairingBusy) {
                        LinearProgressIndicator(
                            modifier = Modifier.fillMaxWidth(),
                            color = Cyan,
                            trackColor = Line,
                        )
                        Spacer(Modifier.height(7.dp))
                        Text(
                            "Warte auf Bestätigung auf streaminghub.org/activate …",
                            color = Muted,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                } else if (state.pairingBusy) {
                    CircularProgressIndicator(color = Cyan, modifier = Modifier.padding(8.dp))
                    Spacer(Modifier.height(10.dp))
                    Text("Kopplungscode wird angefordert …", color = Muted)
                } else if (state.pairingError == null) {
                    PrimaryAction(
                        text = "Kopplungscode anfordern",
                        onClick = onStartPairing,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                if (state.pairingError != null) {
                    Spacer(Modifier.height(14.dp))
                    ErrorBanner(message = state.pairingError, onDismiss = onDismissPairingError)
                    Spacer(Modifier.height(10.dp))
                    SecondaryAction(
                        text = "Neuen Code anfordern",
                        icon = Icons.Rounded.Refresh,
                        onClick = onStartPairing,
                    )
                }

                Spacer(Modifier.height(22.dp))
                Text(
                    "Gerät: ${DeviceIdentity.name()}",
                    color = Muted,
                    style = MaterialTheme.typography.labelMedium,
                )
            }

            Spacer(Modifier.height(14.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(Panel2)
                    .padding(15.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Box(
                    Modifier
                        .padding(top = 5.dp)
                        .width(6.dp)
                        .height(6.dp)
                        .clip(RoundedCornerShape(99.dp))
                        .background(Cyan),
                )
                Spacer(Modifier.width(10.dp))
                Text(
                    "Die Kopplung ist optional. Deine Playlist und die Wiedergabe funktionieren auch ohne Konto. Das Konto wird für Geräteverwaltung und Premium-Status benötigt.",
                    color = Muted,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }

            Spacer(Modifier.height(20.dp))
            SecondaryAction(
                text = "Abbrechen",
                onClick = onBack,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
