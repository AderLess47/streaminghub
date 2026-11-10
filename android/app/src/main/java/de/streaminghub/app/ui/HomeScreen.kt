package de.streaminghub.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.LiveTv
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.streaminghub.app.AppUiState
import de.streaminghub.app.model.Channel
import de.streaminghub.app.model.MediaKind
import de.streaminghub.app.ui.theme.Brand
import de.streaminghub.app.ui.theme.BrandLight
import de.streaminghub.app.ui.theme.Cyan
import de.streaminghub.app.ui.theme.Foreground
import de.streaminghub.app.ui.theme.Ink
import de.streaminghub.app.ui.theme.Line
import de.streaminghub.app.ui.theme.Muted
import de.streaminghub.app.ui.theme.Panel
import de.streaminghub.app.ui.theme.Panel2
import kotlinx.coroutines.delay
import java.util.Locale

private val filters = listOf("Alle", "Live", "Filme", "Serien")
private const val LOW_SPEC_PAGE_SIZE = 80

@Composable
fun HomeScreen(
    state: AppUiState,
    onPlay: (Channel) -> Unit,
    onToggleFavorite: (Channel) -> Unit,
    onAddPlaylist: () -> Unit,
    onOpenSettings: () -> Unit,
    onDismissError: () -> Unit,
    onOpenWebsite: () -> Unit,
    hasEpg: Boolean,
    onOpenGuide: () -> Unit,
    lowSpecMode: Boolean,
) {
    var query by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf("Alle") }
    var visibleLimit by rememberSaveable {
        mutableStateOf(if (lowSpecMode) LOW_SPEC_PAGE_SIZE else Int.MAX_VALUE)
    }
    val focusRequester = remember { FocusRequester() }

    val filteredChannels = remember(state.channels, query, filter) {
        val needle = query.trim().lowercase(Locale.ROOT)
        state.channels.filter { channel ->
            val matchesFilter = when (filter) {
                "Live" -> channel.kind == MediaKind.LIVE
                "Filme" -> channel.kind == MediaKind.MOVIE
                "Serien" -> channel.kind == MediaKind.SERIES
                else -> true
            }
            val matchesQuery = needle.isEmpty() ||
                channel.name.lowercase(Locale.ROOT).contains(needle) ||
                channel.group.lowercase(Locale.ROOT).contains(needle)
            matchesFilter && matchesQuery
        }
    }

    LaunchedEffect(lowSpecMode, query, filter) {
        visibleLimit = if (lowSpecMode) LOW_SPEC_PAGE_SIZE else Int.MAX_VALUE
    }

    val visibleChannels = filteredChannels.take(visibleLimit)

    LaunchedEffect(state.loading, state.channels.isEmpty()) {
        if (!state.loading) {
            delay(180)
            runCatching { focusRequester.requestFocus() }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(Ink, Color(0xFF0B101A), Ink))),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(440.dp)
                .background(
                    Brush.radialGradient(
                        colors = listOf(Brand.copy(alpha = 0.24f), Color.Transparent),
                        radius = 1000f,
                    ),
                ),
        )

        LazyVerticalGrid(
            columns = GridCells.Adaptive(minSize = 158.dp),
            modifier = Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.safeDrawing),
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 18.dp, bottom = 36.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                AppHeader(
                    sourceLabel = state.sourceLabel,
                    hasEpg = hasEpg,
                    onAddPlaylist = onAddPlaylist,
                    onOpenGuide = onOpenGuide,
                    onOpenSettings = onOpenSettings,
                )
            }

            if (state.error != null) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    ErrorBanner(
                        message = state.error,
                        onDismiss = onDismissError,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }

            if (state.loading) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    LinearProgressIndicator(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 6.dp)
                            .clipProgress(),
                        color = Cyan,
                        trackColor = Line,
                    )
                }
            }

            if (state.channels.isEmpty()) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    EmptyLibrary(
                        focusRequester = focusRequester,
                        onAddPlaylist = onAddPlaylist,
                    )
                }
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Footer(onOpenWebsite)
                }
            } else {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    FeaturedCard(
                        channel = state.channels.first(),
                        focusRequester = focusRequester,
                        onPlay = onPlay,
                    )
                }

                item(span = { GridItemSpan(maxLineSpan) }) {
                    SearchAndFilters(
                        query = query,
                        onQueryChange = { query = it },
                        filter = filter,
                        onFilterChange = { filter = it },
                    )
                }

                if (lowSpecMode) {
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        Text(
                            text = "Sparmodus aktiv: Listen werden in kleineren Schritten geladen, Logos nicht vorgeladen.",
                            color = Muted,
                            fontSize = 12.sp,
                            modifier = Modifier.padding(top = 2.dp),
                        )
                    }
                }

                if (filteredChannels.isEmpty()) {
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        NoResults(
                            onReset = {
                                query = ""
                                filter = "Alle"
                            },
                        )
                    }
                } else {
                    items(visibleChannels, key = { it.url }) { channel ->
                        ChannelCard(
                            channel = channel,
                            isFavorite = state.favorites.contains(channel.url),
                            lowSpecMode = lowSpecMode,
                            onPlay = { onPlay(channel) },
                            onToggleFavorite = { onToggleFavorite(channel) },
                        )
                    }

                    if (visibleChannels.size < filteredChannels.size) {
                        item(span = { GridItemSpan(maxLineSpan) }) {
                            SecondaryAction(
                                text = "Weitere ${minOf(LOW_SPEC_PAGE_SIZE, filteredChannels.size - visibleChannels.size)} Einträge anzeigen",
                                icon = Icons.Rounded.Add,
                                onClick = {
                                    visibleLimit = (visibleLimit + LOW_SPEC_PAGE_SIZE)
                                        .coerceAtMost(filteredChannels.size)
                                },
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                }

                item(span = { GridItemSpan(maxLineSpan) }) {
                    Footer(onOpenWebsite)
                }
            }
        }
    }
}

@Composable
private fun AppHeader(
    sourceLabel: String?,
    hasEpg: Boolean,
    onAddPlaylist: () -> Unit,
    onOpenGuide: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BrandMark(size = 40.dp)
        Spacer(Modifier.width(11.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "StreamingHub",
                color = Foreground,
                style = MaterialTheme.typography.titleLarge,
            )
            Text(
                text = sourceLabel ?: "IPTV-Player · Eigene Playlist",
                color = Muted,
                style = MaterialTheme.typography.labelMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(8.dp))
        AppIconButton(
            icon = Icons.Rounded.Add,
            contentDescription = "Playlist hinzufügen",
            onClick = onAddPlaylist,
        )
        if (hasEpg) {
            Spacer(Modifier.width(7.dp))
            AppIconButton(
                icon = Icons.Rounded.LiveTv,
                contentDescription = "Programmführer öffnen",
                onClick = onOpenGuide,
            )
        }
        Spacer(Modifier.width(7.dp))
        AppIconButton(
            icon = Icons.Rounded.Settings,
            contentDescription = "Einstellungen öffnen",
            onClick = onOpenSettings,
        )
    }
}

@Composable
private fun FeaturedCard(
    channel: Channel,
    focusRequester: FocusRequester,
    onPlay: (Channel) -> Unit,
) {
    val shape = RoundedCornerShape(24.dp)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 218.dp)
            .clip(shape)
            .background(
                Brush.linearGradient(
                    listOf(
                        Brand.copy(alpha = 0.92f),
                        BrandLight.copy(alpha = 0.72f),
                        Color(0xFF0E7490).copy(alpha = 0.58f),
                        Panel,
                    ),
                ),
            )
            .border(1.dp, Cyan.copy(alpha = 0.35f), shape)
            .padding(22.dp),
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "JETZT ANSEHEN",
                    color = Color(0xFFCFFAFE),
                    fontSize = 10.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 1.7.sp,
                )
                Spacer(Modifier.width(10.dp))
                Row(
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(Ink.copy(alpha = 0.32f))
                        .padding(horizontal = 8.dp, vertical = 3.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        Modifier
                            .size(5.dp)
                            .clip(CircleShape)
                            .background(Cyan),
                    )
                    Spacer(Modifier.width(5.dp))
                    Text(
                        text = channel.kind.label,
                        color = Color.White.copy(alpha = 0.9f),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }

            Spacer(Modifier.height(13.dp))
            Text(
                text = channel.name,
                color = Color.White,
                style = MaterialTheme.typography.headlineLarge,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(5.dp))
            Text(
                text = channel.group,
                color = Color.White.copy(alpha = 0.74f),
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(19.dp))
            PrimaryAction(
                text = "Jetzt abspielen",
                onClick = { onPlay(channel) },
                modifier = Modifier.focusRequester(focusRequester),
            )
        }
    }
}

@Composable
private fun SearchAndFilters(
    query: String,
    onQueryChange: (String) -> Unit,
    filter: String,
    onFilterChange: (String) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 4.dp),
    ) {
        OutlinedTextField(
            value = query,
            onValueChange = onQueryChange,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Sender, Filme oder Serien suchen") },
            leadingIcon = {
                Icon(Icons.Rounded.Search, contentDescription = null, tint = Muted)
            },
            trailingIcon = {
                if (query.isNotEmpty()) {
                    IconButton(onClick = { onQueryChange("") }) {
                        Icon(Icons.Rounded.Close, contentDescription = "Suche leeren", tint = Muted)
                    }
                }
            },
            singleLine = true,
            shape = RoundedCornerShape(14.dp),
        )
        Spacer(Modifier.height(10.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            filters.forEach { item ->
                FilterChip(
                    selected = filter == item,
                    onClick = { onFilterChange(item) },
                    label = { Text(item) },
                )
            }
        }
    }
}

@Composable
private fun EmptyLibrary(
    focusRequester: FocusRequester,
    onAddPlaylist: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 36.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            BrandMark(size = 58.dp)
            Spacer(Modifier.width(16.dp))
            Column {
                Text(
                    text = "Deine Inhalte.",
                    color = Foreground,
                    style = MaterialTheme.typography.headlineLarge,
                )
                Text(
                    text = "Dein Erlebnis.",
                    color = Cyan,
                    style = MaterialTheme.typography.headlineLarge,
                )
            }
        }

        Spacer(Modifier.height(20.dp))
        Text(
            text = "Füge deine eigene M3U-Playlist hinzu. StreamingHub ordnet Live-TV, Filme und Serien übersichtlich und startet deine Wiedergabe direkt auf dem Gerät.",
            color = Muted,
            style = MaterialTheme.typography.bodyLarge,
        )
        Spacer(Modifier.height(18.dp))

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FeaturePill("Live-TV")
            FeaturePill("Filme")
            FeaturePill("Serien")
            FeaturePill("M3U & M3U8")
        }

        Spacer(Modifier.height(24.dp))
        PrimaryAction(
            text = "M3U-Playlist hinzufügen",
            onClick = onAddPlaylist,
            modifier = Modifier
                .fillMaxWidth()
                .focusRequester(focusRequester),
        )
        Spacer(Modifier.height(12.dp))
        Text(
            text = "Du kannst eine Playlist-URL eingeben oder eine M3U-Datei vom Gerät auswählen.",
            color = Muted,
            style = MaterialTheme.typography.bodyMedium,
        )
        Spacer(Modifier.height(20.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(Panel)
                .border(1.dp, Line, RoundedCornerShape(16.dp))
                .padding(15.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Icon(
                Icons.Rounded.Check,
                contentDescription = null,
                tint = Cyan,
                modifier = Modifier
                    .padding(top = 2.dp)
                    .size(17.dp),
            )
            Spacer(Modifier.width(9.dp))
            Text(
                text = "Deine Playlist bleibt lokal auf diesem Gerät. StreamingHub stellt keine Sender, Filme oder Serien bereit.",
                color = Muted,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}

@Composable
private fun FeaturePill(text: String) {
    Row(
        modifier = Modifier
            .clip(CircleShape)
            .background(Panel2)
            .border(1.dp, Line, CircleShape)
            .padding(horizontal = 11.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(5.dp)
                .clip(CircleShape)
                .background(Cyan),
        )
        Spacer(Modifier.width(6.dp))
        Text(text, color = Foreground, fontSize = 12.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun NoResults(onReset: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Keine Treffer",
            color = Foreground,
            style = MaterialTheme.typography.titleLarge,
        )
        Spacer(Modifier.height(5.dp))
        Text(
            text = "Für deine Suche und den gewählten Filter gibt es keine Einträge.",
            color = Muted,
            style = MaterialTheme.typography.bodyMedium,
        )
        Spacer(Modifier.height(14.dp))
        SecondaryAction(
            text = "Suche zurücksetzen",
            icon = Icons.Rounded.Close,
            onClick = onReset,
        )
    }
}

@Composable
private fun Footer(onOpenWebsite: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 18.dp, bottom = 8.dp),
    ) {
        Text(
            text = "StreamingHub ist ein technischer IPTV-Player. Du bist selbst für die Rechte an deinen Quellen verantwortlich.",
            color = Muted.copy(alpha = 0.8f),
            style = MaterialTheme.typography.bodyMedium,
        )
        Spacer(Modifier.height(4.dp))
        TextButton(onClick = onOpenWebsite) {
            Text("streaminghub.org", color = Color(0xFF7DD3FC), fontSize = 13.sp)
        }
    }
}

private fun Modifier.clipProgress(): Modifier = this.then(
    Modifier
        .height(3.dp)
        .background(Line, RoundedCornerShape(99.dp)),
)
