package de.streaminghub.app.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.streaminghub.app.EpgUiState
import de.streaminghub.app.model.Channel
import de.streaminghub.app.model.EpgProgramme
import de.streaminghub.app.reminder.ReminderScheduler
import de.streaminghub.app.ui.theme.Brand
import de.streaminghub.app.ui.theme.Cyan
import de.streaminghub.app.ui.theme.Foreground
import de.streaminghub.app.ui.theme.Ink
import de.streaminghub.app.ui.theme.Line
import de.streaminghub.app.ui.theme.Muted
import de.streaminghub.app.ui.theme.Panel
import de.streaminghub.app.ui.theme.Panel2
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun GuideScreen(
    channels: List<Channel>,
    epgState: EpgUiState,
    onPlay: (Channel) -> Unit,
    onDismissError: () -> Unit,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    var query by rememberSaveable { mutableStateOf("") }
    var onlyWithProgramme by rememberSaveable { mutableStateOf(false) }
    var now by remember { mutableStateOf(System.currentTimeMillis()) }
    var pendingReminder by remember { mutableStateOf<EpgProgramme?>(null) }

    fun scheduleReminder(programme: EpgProgramme) {
        val permissionNeeded = Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED

        if (permissionNeeded) {
            pendingReminder = programme
            return
        }

        val scheduled = ReminderScheduler.schedule(context, programme)
        Toast.makeText(
            context,
            if (scheduled) {
                "Erinnerung für ${programme.title} gesetzt."
            } else {
                "Die Erinnerung konnte nicht gesetzt werden."
            },
            Toast.LENGTH_SHORT,
        ).show()
    }

    val notificationPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        val programme = pendingReminder
        pendingReminder = null
        if (granted && programme != null) {
            scheduleReminder(programme)
        } else if (!granted) {
            Toast.makeText(
                context,
                "Benachrichtigungen sind deaktiviert. Erlaube sie in den Systemeinstellungen.",
                Toast.LENGTH_LONG,
            ).show()
        }
    }

    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            // The permission is requested only when the user actually schedules a reminder.
        }
    }

    LaunchedEffect(Unit) {
        while (true) {
            delay(30_000)
            now = System.currentTimeMillis()
        }
    }

    val programmesById = remember(epgState.programmes) {
        epgState.programmes.groupBy { it.channelId }
    }
    val programmesByName = remember(epgState.programmes) {
        epgState.programmes.groupBy { it.channelName.lowercase(Locale.ROOT) }
    }
    val filteredChannels = remember(channels, query, onlyWithProgramme, programmesById, programmesByName) {
        val needle = query.trim().lowercase(Locale.ROOT)
        channels.filter { channel ->
            val matchesName = needle.isEmpty() ||
                channel.name.lowercase(Locale.ROOT).contains(needle) ||
                channel.group.lowercase(Locale.ROOT).contains(needle)
            val channelProgrammes = programmesFor(channel, programmesById, programmesByName)
            matchesName && (!onlyWithProgramme || channelProgrammes.isNotEmpty())
        }
    }

    BackHandler(onBack = onBack)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(Ink, Color(0xFF0B101A), Ink))),
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.safeDrawing),
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 18.dp, bottom = 36.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    AppIconButton(
                        icon = Icons.AutoMirrored.Rounded.ArrowBack,
                        contentDescription = "Zurück",
                        onClick = onBack,
                    )
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Programmführer", color = Foreground, style = MaterialTheme.typography.headlineMedium)
                        Text(
                            if (epgState.programmes.isEmpty()) {
                                "Noch keine EPG-Daten"
                            } else {
                                "${epgState.programmes.size} Sendungen · XMLTV"
                            },
                            color = Muted,
                            fontSize = 12.sp,
                        )
                    }
                    BrandMark(size = 34.dp)
                }
            }

            if (epgState.error != null) {
                item {
                    ErrorBanner(message = epgState.error, onDismiss = onDismissError)
                }
            }

            item {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Sender im Programmführer suchen") },
                    leadingIcon = {
                        Icon(Icons.Rounded.Search, contentDescription = null, tint = Muted)
                    },
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                )
            }

            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = !onlyWithProgramme,
                        onClick = { onlyWithProgramme = false },
                        label = { Text("Alle Sender") },
                    )
                    FilterChip(
                        selected = onlyWithProgramme,
                        onClick = { onlyWithProgramme = true },
                        label = { Text("Mit Programm") },
                    )
                }
            }

            if (epgState.programmes.isEmpty()) {
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(20.dp))
                            .background(Panel)
                            .padding(20.dp),
                    ) {
                        Text(
                            "Noch kein Programmführer",
                            color = Foreground,
                            style = MaterialTheme.typography.titleLarge,
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "Öffne die Einstellungen und füge eine XMLTV-EPG-Adresse oder eine EPG-Datei hinzu.",
                            color = Muted,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
            } else if (filteredChannels.isEmpty()) {
                item {
                    Text(
                        "Keine Sender passen zur Suche.",
                        color = Muted,
                        modifier = Modifier.padding(vertical = 24.dp),
                    )
                }
            } else {
                items(filteredChannels, key = { it.url }) { channel ->
                    val programmes = programmesFor(channel, programmesById, programmesByName)
                    val current = programmes.firstOrNull { now >= it.startMs && now < it.stopMs }
                    val next = programmes.firstOrNull { it.startMs > now }
                    GuideRow(
                        channel = channel,
                        current = current,
                        next = next,
                        onPlay = { onPlay(channel) },
                        onRemind = {
                            if (next != null) {
                                if (Build.VERSION.SDK_INT >= 33 &&
                                    ContextCompat.checkSelfPermission(
                                        context,
                                        Manifest.permission.POST_NOTIFICATIONS,
                                    ) != PackageManager.PERMISSION_GRANTED
                                ) {
                                    pendingReminder = next
                                    notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                                } else {
                                    scheduleReminder(next)
                                }
                            }
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun GuideRow(
    channel: Channel,
    current: EpgProgramme?,
    next: EpgProgramme?,
    onPlay: () -> Unit,
    onRemind: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .onFocusChanged { focused = it.isFocused }
            .clip(RoundedCornerShape(16.dp))
            .background(if (focused) Panel2 else Panel)
            .then(
                if (focused) {
                    Modifier.background(Brand.copy(alpha = 0.08f))
                } else {
                    Modifier
                },
            )
            .clickable(onClick = onPlay)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = channel.name,
                color = Foreground,
                fontWeight = FontWeight.SemiBold,
                fontSize = 15.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(3.dp))
            if (current != null) {
                Text(
                    text = "Jetzt: ${current.title}",
                    color = Cyan,
                    fontSize = 13.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = "${formatTime(current.startMs)}–${formatTime(current.stopMs)}",
                    color = Muted,
                    fontSize = 11.sp,
                )
            } else {
                Text(
                    text = "Keine laufende Sendung",
                    color = Muted,
                    fontSize = 12.sp,
                )
            }
            if (next != null) {
                Spacer(Modifier.height(3.dp))
                Text(
                    text = "Danach: ${next.title} · ${formatTime(next.startMs)}",
                    color = Muted,
                    fontSize = 11.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (next != null) {
            IconButton(onClick = onRemind) {
                Icon(
                    Icons.Rounded.NotificationsActive,
                    contentDescription = "Erinnerung für ${next.title}",
                    tint = Cyan,
                )
            }
        }
        Spacer(Modifier.width(4.dp))
        Box(
            modifier = Modifier
                .width(36.dp)
                .height(36.dp)
                .clip(RoundedCornerShape(99.dp))
                .background(Brand.copy(alpha = 0.18f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Rounded.PlayArrow,
                contentDescription = "Sender abspielen",
                tint = Cyan,
                modifier = Modifier.width(19.dp),
            )
        }
    }
}

private fun programmesFor(
    channel: Channel,
    byId: Map<String, List<EpgProgramme>>,
    byName: Map<String, List<EpgProgramme>>,
): List<EpgProgramme> {
    val id = channel.tvgId?.takeIf { it.isNotBlank() }
    return (id?.let { byId[it] } ?: byName[channel.name.lowercase(Locale.ROOT)] ?: emptyList())
        .sortedBy { it.startMs }
}

private fun formatTime(timestamp: Long): String =
    SimpleDateFormat("HH:mm", Locale.GERMANY).format(Date(timestamp))
