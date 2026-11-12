package de.streaminghub.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.LiveTv
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.streaminghub.app.AccountUiState
import de.streaminghub.app.AppUiState
import de.streaminghub.app.BuildConfig
import de.streaminghub.app.EpgUiState
import de.streaminghub.app.ui.theme.Cyan
import de.streaminghub.app.ui.theme.Foreground
import de.streaminghub.app.ui.theme.Ink
import de.streaminghub.app.ui.theme.Line
import de.streaminghub.app.ui.theme.Muted
import de.streaminghub.app.ui.theme.Panel
import de.streaminghub.app.data.AccountDeletion
import de.streaminghub.app.ui.theme.Rose
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun SettingsScreen(
    state: AppUiState,
    accountState: AccountUiState,
    epgState: EpgUiState,
    lowSpecMode: Boolean,
    onLowSpecModeChange: (Boolean) -> Unit,
    onBack: () -> Unit,
    onPairDevice: () -> Unit,
    onRefreshAccount: () -> Unit,
    onForgetDevice: () -> Unit,
    onAddEpg: () -> Unit,
    onRefreshEpg: () -> Unit,
    onRemoveEpg: () -> Unit,
    onOpenGuide: () -> Unit,
    onRefreshPlaylist: () -> Unit,
    onRemovePlaylist: () -> Unit,
    onClearProgress: () -> Unit,
    onAddPlaylist: () -> Unit,
    onOpenWebsite: (String) -> Unit,
    onDismissError: () -> Unit,
    demoMode: Boolean,
    onLoadDemo: () -> Unit,
    onRemoveDemo: () -> Unit,
    premiumSales: Boolean = BuildConfig.PREMIUM_SALES,
) {
    var showRemoveConfirmation by remember { mutableStateOf(false) }
    var showRemoveEpgConfirmation by remember { mutableStateOf(false) }
    var showUnlinkConfirmation by remember { mutableStateOf(false) }
    var progressCleared by remember { mutableStateOf(false) }

    BackHandler(onBack = onBack)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(Ink, Color(0xFF0B101A), Ink))),
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .testTag("settings-list")
                .windowInsetsPadding(WindowInsets.safeDrawing),
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 18.dp, bottom = 36.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    AppIconButton(
                        icon = Icons.AutoMirrored.Rounded.ArrowBack,
                        contentDescription = "Zurück",
                        onClick = onBack,
                    )
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Einstellungen", color = Foreground, style = MaterialTheme.typography.headlineMedium)
                        Text("Konto, Playlist, Wiedergabe und Leistung", color = Muted, fontSize = 12.sp)
                    }
                    BrandMark(size = 34.dp)
                }
            }

            if (state.error != null) {
                item {
                    ErrorBanner(message = state.error, onDismiss = onDismissError)
                }
            }

            if (state.loading) {
                item {
                    LinearProgressIndicator(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(99.dp)),
                        color = Cyan,
                        trackColor = Line,
                    )
                }
            }

            item {
                SettingsCard(
                    title = "Konto & Gerät",
                    subtitle = if (accountState.account == null) {
                        if (premiumSales) {
                            "Optional – für Geräteverwaltung und Premium-Status"
                        } else {
                            "Optional – für Geräteverwaltung"
                        }
                    } else {
                        "Gerät ist mit deinem StreamingHub-Konto verbunden"
                    },
                ) {
                    if (accountState.loading) {
                        LinearProgressIndicator(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(99.dp)),
                            color = Cyan,
                            trackColor = Line,
                        )
                        Spacer(Modifier.height(10.dp))
                    }

                    val account = accountState.account
                    if (account == null) {
                        Text(
                            "Koppel dieses Gerät über einen Einmalcode. Die Wiedergabe funktioniert auch ohne Konto.",
                            color = Muted,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        if (accountState.error != null) {
                            Spacer(Modifier.height(8.dp))
                            Text(
                                accountState.error,
                                color = Rose,
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                        Spacer(Modifier.height(14.dp))
                        PrimaryAction(
                            text = "Gerät koppeln",
                            icon = Icons.Rounded.Link,
                            onClick = onPairDevice,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        if (premiumSales) {
                            Spacer(Modifier.height(9.dp))
                            SecondaryAction(
                                text = "Konto im Web verwalten",
                                icon = Icons.AutoMirrored.Rounded.OpenInNew,
                                onClick = { onOpenWebsite("/dashboard") },
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    } else {
                        Text(
                            text = account.displayName.ifBlank { account.email },
                            color = Foreground,
                            style = MaterialTheme.typography.bodyLarge,
                        )
                        if (account.email.isNotBlank()) {
                            Text(account.email, color = Muted, style = MaterialTheme.typography.bodyMedium)
                        }
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = "Gerät: ${account.deviceName}",
                            color = Muted,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        if (premiumSales) {
                            Spacer(Modifier.height(5.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                Modifier
                                    .width(7.dp)
                                    .height(7.dp)
                                    .clip(RoundedCornerShape(99.dp))
                                    .background(if (account.premiumActive) Cyan else Line),
                            )
                            Spacer(Modifier.width(7.dp))
                            Text(
                                text = if (account.premiumActive) {
                                    "Premium aktiv"
                                } else {
                                    "Kein aktives Premium"
                                },
                                    color = if (account.premiumActive) Cyan else Muted,
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                            }
                        }
                        if (accountState.error != null) {
                            Spacer(Modifier.height(8.dp))
                            Text(
                                accountState.error,
                                color = Rose,
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                        Spacer(Modifier.height(14.dp))
                        SecondaryAction(
                            text = if (accountState.loading) "Wird aktualisiert …" else "Kontostatus aktualisieren",
                            icon = Icons.Rounded.Refresh,
                            onClick = onRefreshAccount,
                            enabled = !accountState.loading,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Spacer(Modifier.height(9.dp))
                        SecondaryAction(
                            text = "Lokale Kopplung entfernen",
                            icon = Icons.Rounded.Delete,
                            onClick = { showUnlinkConfirmation = true },
                            danger = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }

                    Spacer(Modifier.height(14.dp))
                    Text(
                        text = "Konto und gespeicherte Daten löschen: Die öffentliche Löschseite funktioniert auch ohne Anmeldung und erklärt, welche Daten gelöscht und welche aufbewahrt werden.",
                        color = Muted,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Spacer(Modifier.height(9.dp))
                    SecondaryAction(
                        text = "Konto löschen",
                        icon = Icons.Rounded.Delete,
                        onClick = { onOpenWebsite(AccountDeletion.PATH) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }

            item {
                SettingsCard(
                    title = "Playlist",
                    subtitle = if (state.managedPlaylist) {
                        "Vom Administrator verwaltet"
                    } else {
                        state.sourceLabel ?: "Noch keine Playlist eingerichtet"
                    },
                ) {
                    Text(
                        text = "${state.channels.size} Einträge",
                        color = Foreground,
                        style = MaterialTheme.typography.bodyLarge,
                    )
                    Text(
                        text = "Zuletzt aktualisiert: ${formatUpdatedAt(state.updatedAt)}",
                        color = Muted,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Spacer(Modifier.height(5.dp))
                    Text(
                        text = "Lokal zwischengespeichert – steht beim nächsten Start sofort bereit.",
                        color = Cyan,
                        style = MaterialTheme.typography.bodyMedium,
                    )

                    if (state.managedPlaylist) {
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = "Diese M3U-URL wird vom StreamingHub-Admin verwaltet und beim Kontoabruf automatisch geladen.",
                            color = Cyan,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }

                    if (state.sourceUrl != null) {
                        Spacer(Modifier.height(14.dp))
                        SecondaryAction(
                            text = if (state.loading) "Wird aktualisiert …" else "Playlist aktualisieren",
                            icon = Icons.Rounded.Refresh,
                            onClick = onRefreshPlaylist,
                            enabled = !state.loading,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    } else if (state.channels.isNotEmpty()) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = "Bei einer importierten Datei wählst du die Datei zum Aktualisieren erneut aus.",
                            color = Muted,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }

                    if (!state.managedPlaylist) {
                        Spacer(Modifier.height(9.dp))
                        PrimaryAction(
                            text = if (state.channels.isEmpty()) "Playlist hinzufügen" else "Andere Playlist hinzufügen",
                            icon = Icons.Rounded.Add,
                            onClick = onAddPlaylist,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }

                    if (state.channels.isNotEmpty() && !state.managedPlaylist) {
                        Spacer(Modifier.height(9.dp))
                        SecondaryAction(
                            text = "Playlist entfernen",
                            icon = Icons.Rounded.Delete,
                            onClick = { showRemoveConfirmation = true },
                            danger = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }

            item {
                SettingsCard(
                    title = "Demo-Modus",
                    subtitle = if (demoMode) {
                        "Demo-Inhalte sind geladen"
                    } else {
                        "App ohne Konto und ohne eigene Playlist testen"
                    },
                ) {
                    Text(
                        text = if (demoMode) {
                            "Sechs Beispiel-Einträge mit öffentlichen Teststreams und ein Programmführer mit laufender und folgender Sendung. Keine echten Sender, keine Kontodaten."
                        } else {
                            "Lädt sechs Beispiel-Einträge mit öffentlichen Teststreams und passende Programmdaten. Gedacht für Store-Tests und zum Ausprobieren ohne eigene Playlist."
                        },
                        color = Muted,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Spacer(Modifier.height(12.dp))
                    if (demoMode) {
                        SecondaryAction(
                            text = "Demo-Inhalte entfernen",
                            icon = Icons.Rounded.Delete,
                            onClick = onRemoveDemo,
                            danger = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    } else {
                        PrimaryAction(
                            text = "Demo-Inhalte laden",
                            icon = Icons.Rounded.PlayArrow,
                            onClick = onLoadDemo,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }

            item {
                SettingsCard(
                    title = "Programmführer (EPG)",
                    subtitle = if (epgState.programmes.isEmpty()) {
                        "Noch keine XMLTV-Daten"
                    } else {
                        "${epgState.programmes.size} Sendungen"
                    },
                ) {
                    if (epgState.loading) {
                        LinearProgressIndicator(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(99.dp)),
                            color = Cyan,
                            trackColor = Line,
                        )
                        Spacer(Modifier.height(10.dp))
                    }

                    if (epgState.programmes.isEmpty()) {
                        Text(
                            "Lade eine XMLTV-Datei, um laufende und kommende Sendungen im Programmführer zu sehen.",
                            color = Muted,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    } else {
                        Text(
                            text = "Zuletzt aktualisiert: ${formatUpdatedAt(epgState.updatedAt)}",
                            color = Muted,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }

                    if (epgState.error != null) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            epgState.error,
                            color = Rose,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }

                    if (epgState.sourceUrl != null) {
                        Spacer(Modifier.height(12.dp))
                        SecondaryAction(
                            text = if (epgState.loading) "Wird aktualisiert …" else "EPG aktualisieren",
                            icon = Icons.Rounded.Refresh,
                            onClick = onRefreshEpg,
                            enabled = !epgState.loading,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    } else if (epgState.programmes.isNotEmpty()) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "Bei einer importierten Datei wählst du die XMLTV-Datei zum Aktualisieren erneut aus.",
                            color = Muted,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }

                    Spacer(Modifier.height(9.dp))
                    PrimaryAction(
                        text = if (epgState.programmes.isEmpty()) "EPG hinzufügen" else "Anderes EPG hinzufügen",
                        icon = Icons.Rounded.Add,
                        onClick = onAddEpg,
                        modifier = Modifier.fillMaxWidth(),
                    )

                    if (epgState.programmes.isNotEmpty()) {
                        Spacer(Modifier.height(9.dp))
                        SecondaryAction(
                            text = "Programmführer öffnen",
                            icon = Icons.Rounded.LiveTv,
                            onClick = onOpenGuide,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Spacer(Modifier.height(9.dp))
                        SecondaryAction(
                            text = "EPG entfernen",
                            icon = Icons.Rounded.Delete,
                            onClick = { showRemoveEpgConfirmation = true },
                            danger = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }

            item {
                SettingsCard(
                    title = "Leistung & Cache",
                    subtitle = "Für langsame Fire-TV- und Android-TV-Geräte",
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Low-Spec-Modus",
                                color = Foreground,
                                style = MaterialTheme.typography.bodyLarge,
                            )
                            Spacer(Modifier.height(3.dp))
                            Text(
                                text = "Weniger Logos, kürzere Listen und kleinere Wiedergabepuffer.",
                                color = Muted,
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                        Spacer(Modifier.width(12.dp))
                        Switch(
                            checked = lowSpecMode,
                            onCheckedChange = onLowSpecModeChange,
                        )
                    }
                    Spacer(Modifier.height(14.dp))
                    Text(
                        text = "Die Playlist wird lokal zwischengespeichert. Beim Start erscheint der letzte Stand sofort. Ist die Quelle älter als 15 Minuten und erreichbar, aktualisiert die App den Cache im Hintergrund.",
                        color = Muted,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }

            item {
                SettingsCard(
                    title = "Wiedergabe",
                    subtitle = "Fortschritt wird nur für Filme und Serien auf diesem Gerät gespeichert.",
                ) {
                    SecondaryAction(
                        text = "Wiedergabefortschritt löschen",
                        icon = Icons.Rounded.Delete,
                        onClick = {
                            onClearProgress()
                            progressCleared = true
                        },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    if (progressCleared) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = "Der gespeicherte Wiedergabefortschritt wurde gelöscht.",
                            color = Cyan,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
            }

            item {
                SettingsCard(
                    title = "Über StreamingHub",
                    subtitle = "Version ${BuildConfig.VERSION_NAME}",
                ) {
                    Text(
                        text = "StreamingHub ist ein technischer IPTV-Player für Fire TV, Android TV, Smartphones und Tablets. Die App stellt keine Sender, Filme, Serien oder Playlists bereit.",
                        color = Muted,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Spacer(Modifier.height(12.dp))
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        SecondaryAction(
                            text = "Website",
                            icon = Icons.AutoMirrored.Rounded.OpenInNew,
                            onClick = { onOpenWebsite("/") },
                        )
                        SecondaryAction(
                            text = "Datenschutz",
                            onClick = { onOpenWebsite("/privacy") },
                        )
                        SecondaryAction(
                            text = "Impressum",
                            onClick = { onOpenWebsite("/imprint") },
                        )
                    }
                    Spacer(Modifier.height(12.dp))
                    Text(
                        text = "Deine Playlist, das EPG und deine Wiedergabedaten werden lokal in der App gespeichert. Eine vom Administrator zugewiesene M3U-URL wird beim Kontoabruf geladen; Playlist-Inhalte werden nicht zentral gespeichert. Für die Kopplung werden nur Gerätename, Plattform und App-Version an StreamingHub übertragen.",
                        color = Muted.copy(alpha = 0.82f),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }

            item {
                Text(
                    text = "StreamingHub · Deine Inhalte. Dein Erlebnis.",
                    color = Muted.copy(alpha = 0.65f),
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.padding(top = 8.dp, start = 4.dp),
                )
            }
        }
    }

    if (showRemoveConfirmation) {
        AlertDialog(
            onDismissRequest = { showRemoveConfirmation = false },
            containerColor = Panel,
            title = { Text("Playlist entfernen?", color = Foreground) },
            text = {
                Text(
                    "Die Playlist, die Favoriten und der Wiedergabefortschritt werden von diesem Gerät entfernt. Deine Quelldatei oder dein Anbieterkonto bleibt unverändert.",
                    color = Muted,
                    style = MaterialTheme.typography.bodyMedium,
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showRemoveConfirmation = false
                        progressCleared = false
                        onRemovePlaylist()
                    },
                ) {
                    Icon(Icons.Rounded.Delete, contentDescription = null, tint = Rose)
                    Spacer(Modifier.width(6.dp))
                    Text("Entfernen", color = Rose)
                }
            },
            dismissButton = {
                TextButton(onClick = { showRemoveConfirmation = false }) {
                    Text("Abbrechen")
                }
            },
        )
    }

    if (showRemoveEpgConfirmation) {
        AlertDialog(
            onDismissRequest = { showRemoveEpgConfirmation = false },
            containerColor = Panel,
            title = { Text("EPG entfernen?", color = Foreground) },
            text = {
                Text(
                    "Die lokal gespeicherten Programmdaten werden gelöscht. Deine Playlist und deine Sender bleiben erhalten.",
                    color = Muted,
                    style = MaterialTheme.typography.bodyMedium,
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showRemoveEpgConfirmation = false
                        onRemoveEpg()
                    },
                ) {
                    Icon(Icons.Rounded.Delete, contentDescription = null, tint = Rose)
                    Spacer(Modifier.width(6.dp))
                    Text("Entfernen", color = Rose)
                }
            },
            dismissButton = {
                TextButton(onClick = { showRemoveEpgConfirmation = false }) {
                    Text("Abbrechen")
                }
            },
        )
    }

    if (showUnlinkConfirmation) {
        AlertDialog(
            onDismissRequest = { showUnlinkConfirmation = false },
            containerColor = Panel,
            title = { Text("Lokale Kopplung entfernen?", color = Foreground) },
            text = {
                Text(
                    "Der gespeicherte Aktivierungstoken wird von diesem Gerät gelöscht. Das Gerät bleibt im StreamingHub-Konto aktiv; entferne es dort zusätzlich, wenn es nicht mehr verwendet wird.",
                    color = Muted,
                    style = MaterialTheme.typography.bodyMedium,
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showUnlinkConfirmation = false
                        onForgetDevice()
                    },
                ) {
                    Icon(Icons.Rounded.Delete, contentDescription = null, tint = Rose)
                    Spacer(Modifier.width(6.dp))
                    Text("Entfernen", color = Rose)
                }
            },
            dismissButton = {
                TextButton(onClick = { showUnlinkConfirmation = false }) {
                    Text("Abbrechen")
                }
            },
        )
    }
}

private fun formatUpdatedAt(timestamp: Long?): String {
    if (timestamp == null || timestamp <= 0L) return "noch nicht"
    return runCatching {
        SimpleDateFormat("dd.MM.yyyy, HH:mm", Locale.GERMANY).format(Date(timestamp))
    }.getOrDefault("noch nicht")
}
