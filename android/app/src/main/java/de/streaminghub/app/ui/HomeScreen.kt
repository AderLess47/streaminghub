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
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.LiveTv
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.paging.LoadState
import androidx.paging.PagingData
import androidx.paging.compose.collectAsLazyPagingItems
import androidx.paging.compose.itemKey
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
import kotlinx.coroutines.flow.Flow

private val filters = listOf("Alle", "Live", "Filme", "Serien")

@Composable
fun HomeScreen(
    state: AppUiState,
    categories: List<String>,
    channelPages: (String?, MediaKind?, String) -> Flow<PagingData<Channel>>,
    onPlay: (Channel) -> Unit,
    onToggleFavorite: (Channel) -> Unit,
    onAddPlaylist: () -> Unit,
    onOpenSettings: () -> Unit,
    onDismissError: () -> Unit,
    onOpenWebsite: () -> Unit,
    hasEpg: Boolean,
    onOpenGuide: () -> Unit,
    lowSpecMode: Boolean,
    demoMode: Boolean,
    onLoadDemo: () -> Unit,
    onExitDemo: () -> Unit,
    updateVersion: String? = null,
    onOpenUpdate: () -> Unit = {},
) {
    var query by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf("Alle") }
    var selectedCategory by rememberSaveable { mutableStateOf<String?>(null) }
    val focusRequester = remember { FocusRequester() }

    val selectedKind = when (filter) {
        "Live" -> MediaKind.LIVE
        "Filme" -> MediaKind.MOVIE
        "Serien" -> MediaKind.SERIES
        else -> null
    }
    val pagedChannels = remember(selectedCategory, filter, query, lowSpecMode) {
        channelPages(selectedCategory, selectedKind, query.trim())
    }.collectAsLazyPagingItems()

    LaunchedEffect(categories) {
        if (selectedCategory != null && selectedCategory !in categories) {
            selectedCategory = null
        }
    }

    LaunchedEffect(state.loading, state.channels.isEmpty()) {
        if (!state.loading) {
            delay(180)
            runCatching { focusRequester.requestFocus() }
        }
    }

    // TV, phone, tablet and desktop get their own card size and margins.
    val profile = rememberLayoutProfile()

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
            columns = GridCells.Adaptive(minSize = profile.cardMinSize),
            modifier = Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.safeDrawing),
            contentPadding = PaddingValues(
                start = profile.horizontalPadding,
                end = profile.horizontalPadding,
                top = if (profile.isTelevision) 24.dp else 18.dp,
                bottom = 36.dp,
            ),
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

            if (updateVersion != null) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    UpdateBanner(version = updateVersion, onOpen = onOpenUpdate)
                }
            }

            if (demoMode) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    DemoBanner(onExitDemo = onExitDemo)
                }
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
                        onLoadDemo = onLoadDemo,
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
                        categories = categories,
                        selectedCategory = selectedCategory,
                        onCategoryChange = { selectedCategory = it },
                    )
                }

                if (lowSpecMode) {
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        Text(
                            text = "Sparmodus aktiv: Es werden kleinere Seiten geladen, Logos nicht vorgeladen.",
                            color = Muted,
                            fontSize = 12.sp,
                            modifier = Modifier.padding(top = 2.dp),
                        )
                    }
                }

                when {
                    pagedChannels.loadState.refresh is LoadState.Loading && pagedChannels.itemCount == 0 -> {
                        item(span = { GridItemSpan(maxLineSpan) }) {
                            LinearProgressIndicator(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = 8.dp)
                                    .clipProgress(),
                                color = Cyan,
                                trackColor = Line,
                            )
                        }
                    }

                    pagedChannels.loadState.refresh is LoadState.Error -> {
                        item(span = { GridItemSpan(maxLineSpan) }) {
                            val error = pagedChannels.loadState.refresh as LoadState.Error
                            ErrorBanner(
                                message = error.error.localizedMessage
                                    ?: "Die Sender konnten nicht geladen werden.",
                                onDismiss = { pagedChannels.retry() },
                            )
                        }
                    }

                    pagedChannels.itemCount == 0 -> {
                        item(span = { GridItemSpan(maxLineSpan) }) {
                            NoResults(
                                onReset = {
                                    query = ""
                                    filter = "Alle"
                                    selectedCategory = null
                                },
                            )
                        }
                    }

                    else -> {
                        items(
                            count = pagedChannels.itemCount,
                            key = pagedChannels.itemKey { it.url },
                        ) { index ->
                            pagedChannels[index]?.let { channel ->
                                ChannelCard(
                                    channel = channel,
                                    isFavorite = state.favorites.contains(channel.url),
                                    lowSpecMode = lowSpecMode,
                                    onPlay = { onPlay(channel) },
                                    onToggleFavorite = { onToggleFavorite(channel) },
                                )
                            }
                        }
                    }
                }

                if (pagedChannels.loadState.append is LoadState.Loading) {
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 18.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(22.dp),
                                color = Cyan,
                                strokeWidth = 2.dp,
                            )
                        }
                    }
                }

                if (pagedChannels.loadState.append is LoadState.Error) {
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        SecondaryAction(
                            text = "Weitere Sender laden",
                            icon = Icons.Rounded.Add,
                            onClick = { pagedChannels.retry() },
                            modifier = Modifier.fillMaxWidth(),
                        )
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
private fun UpdateBanner(version: String, onOpen: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Cyan.copy(alpha = 0.08f))
            .border(1.dp, Cyan.copy(alpha = 0.3f), RoundedCornerShape(16.dp))
            .padding(start = 14.dp, top = 10.dp, bottom = 10.dp, end = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Rounded.Download,
            contentDescription = null,
            tint = Cyan,
            modifier = Modifier.size(18.dp),
        )
        Spacer(Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "Update verfügbar",
                color = Foreground,
                style = MaterialTheme.typography.labelLarge,
            )
            Text(
                text = "Version $version ist bereit – vor der Installation geprüft.",
                color = Muted,
                style = MaterialTheme.typography.bodySmall,
            )
        }
        Spacer(Modifier.width(8.dp))
        SecondaryAction(text = "Ansehen", onClick = onOpen)
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
    categories: List<String>,
    selectedCategory: String?,
    onCategoryChange: (String?) -> Unit,
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
        if (categories.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            Text(
                text = "Kategorien",
                color = Muted,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(5.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FilterChip(
                    selected = selectedCategory == null,
                    onClick = { onCategoryChange(null) },
                    label = { Text("Alle Kategorien") },
                )
                categories.forEach { category ->
                    FilterChip(
                        selected = selectedCategory == category,
                        onClick = { onCategoryChange(category) },
                        label = {
                            Text(
                                text = category,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        },
                    )
                }
            }
        }

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
    onLoadDemo: () -> Unit,
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
        Spacer(Modifier.height(10.dp))
        SecondaryAction(
            text = "Demo-Inhalte ansehen",
            icon = Icons.Rounded.PlayArrow,
            onClick = onLoadDemo,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        Text(
            text = "Du kannst eine Playlist-URL eingeben oder eine M3U-Datei vom Gerät auswählen. Ohne eigene Playlist zeigen die Demo-Inhalte die App mit öffentlichen Teststreams.",
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
private fun DemoBanner(onExitDemo: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Panel)
            .border(1.dp, Cyan.copy(alpha = 0.35f), RoundedCornerShape(16.dp))
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "Demo-Inhalte aktiv",
                color = Foreground,
                fontWeight = FontWeight.SemiBold,
                fontSize = 14.sp,
            )
            Spacer(Modifier.height(3.dp))
            Text(
                text = "Beispieldaten mit öffentlichen Teststreams – keine echten Sender, kein Konto nötig.",
                color = Muted,
                fontSize = 12.sp,
            )
        }
        Spacer(Modifier.width(10.dp))
        SecondaryAction(text = "Demo beenden", onClick = onExitDemo)
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
            text = "Für deine Suche, Kategorie oder den gewählten Filter gibt es keine Einträge.",
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
