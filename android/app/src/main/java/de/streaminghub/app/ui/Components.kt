package de.streaminghub.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.SubcomposeAsyncImage
import de.streaminghub.app.model.Channel
import de.streaminghub.app.model.MediaKind
import de.streaminghub.app.ui.theme.Amber
import de.streaminghub.app.ui.theme.Brand
import de.streaminghub.app.ui.theme.BrandLight
import de.streaminghub.app.ui.theme.Cyan
import de.streaminghub.app.ui.theme.Foreground
import de.streaminghub.app.ui.theme.Ink
import de.streaminghub.app.ui.theme.Line
import de.streaminghub.app.ui.theme.Muted
import de.streaminghub.app.ui.theme.Panel
import de.streaminghub.app.ui.theme.Panel2
import de.streaminghub.app.ui.theme.Rose

@Composable
fun BrandMark(modifier: Modifier = Modifier, size: Dp = 38.dp) {
    Box(
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape(size * 0.3f))
            .background(Brush.linearGradient(listOf(Brand, BrandLight, Cyan))),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Rounded.PlayArrow,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.size(size * 0.62f),
        )
    }
}

@Composable
fun AppIconButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var focused by remember { mutableStateOf(false) }
    IconButton(
        onClick = onClick,
        modifier = modifier
            .onFocusChanged { focused = it.isFocused }
            .clip(CircleShape)
            .background(if (focused) Panel2 else Panel.copy(alpha = 0.75f))
            .border(if (focused) 2.dp else 1.dp, if (focused) Cyan else Line, CircleShape),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = if (focused) Color.White else Muted,
        )
    }
}

@Composable
fun PrimaryAction(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = Icons.Rounded.PlayArrow,
    enabled: Boolean = true,
) {
    var focused by remember { mutableStateOf(false) }
    Row(
        modifier = modifier
            .onFocusChanged { focused = it.isFocused }
            .clip(CircleShape)
            .background(
                if (enabled) {
                    Brush.linearGradient(listOf(Brand, BrandLight, Cyan))
                } else {
                    Brush.linearGradient(listOf(Panel, Panel))
                },
            )
            .border(if (focused) 2.dp else 0.dp, Color.White.copy(alpha = 0.9f), CircleShape)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (enabled) Color.White else Muted,
                modifier = Modifier.size(18.dp),
            )
            Spacer(Modifier.width(8.dp))
        }
        Text(
            text = text,
            color = if (enabled) Color.White else Muted,
            fontWeight = FontWeight.SemiBold,
            fontSize = 14.sp,
        )
    }
}

@Composable
fun SecondaryAction(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    danger: Boolean = false,
) {
    var focused by remember { mutableStateOf(false) }
    val accent = if (danger) Rose else Cyan
    Row(
        modifier = modifier
            .onFocusChanged { focused = it.isFocused }
            .clip(CircleShape)
            .background(if (focused) accent.copy(alpha = 0.1f) else Color.Transparent)
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = if (!enabled) Line.copy(alpha = 0.5f) else if (focused) accent else Line,
                shape = CircleShape,
            )
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (danger) Rose else if (focused) Cyan else Muted,
                modifier = Modifier.size(17.dp),
            )
            Spacer(Modifier.width(7.dp))
        }
        Text(
            text = text,
            color = when {
                !enabled -> Muted.copy(alpha = 0.6f)
                danger -> Rose
                focused -> Color.White
                else -> Foreground
            },
            fontWeight = FontWeight.Medium,
            fontSize = 13.sp,
        )
    }
}

@Composable
fun ErrorBanner(
    message: String,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Rose.copy(alpha = 0.1f))
            .border(1.dp, Rose.copy(alpha = 0.35f), RoundedCornerShape(16.dp))
            .padding(start = 16.dp, top = 10.dp, bottom = 10.dp, end = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = message,
            modifier = Modifier.weight(1f),
            color = Color(0xFFFECDD3),
            style = MaterialTheme.typography.bodyMedium,
        )
        IconButton(onClick = onDismiss) {
            Icon(Icons.Rounded.Close, contentDescription = "Hinweis schließen", tint = Rose)
        }
    }
}

@Composable
fun ChannelCard(
    channel: Channel,
    isFavorite: Boolean,
    onPlay: () -> Unit,
    onToggleFavorite: () -> Unit,
    modifier: Modifier = Modifier,
    lowSpecMode: Boolean = false,
) {
    var focused by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(18.dp)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .onFocusChanged { focused = it.isFocused }
            .clip(shape)
            .background(Panel)
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = if (focused) Cyan else Line,
                shape = shape,
            )
            .clickable(onClick = onPlay)
            .padding(9.dp),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .clip(RoundedCornerShape(12.dp))
                .background(Panel2),
        ) {
            if (!lowSpecMode && !channel.logo.isNullOrBlank()) {
                SubcomposeAsyncImage(
                    model = channel.logo,
                    contentDescription = null,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                    loading = { ChannelFallback(channel.name) },
                    error = { ChannelFallback(channel.name) },
                )
            } else {
                ChannelFallback(channel.name)
            }

            KindBadge(
                kind = channel.kind,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(7.dp),
            )

            IconButton(
                onClick = onToggleFavorite,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(2.dp)
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(Ink.copy(alpha = 0.72f)),
            ) {
                Icon(
                    imageVector = if (isFavorite) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                    contentDescription = if (isFavorite) "Aus Favoriten entfernen" else "Zu Favoriten hinzufügen",
                    tint = if (isFavorite) Rose else Color.White,
                    modifier = Modifier.size(18.dp),
                )
            }
        }

        Spacer(Modifier.height(9.dp))
        Text(
            text = channel.name,
            color = Foreground,
            fontWeight = FontWeight.SemiBold,
            fontSize = 14.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(2.dp))
        Text(
            text = channel.group,
            color = Muted,
            fontSize = 11.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun KindBadge(kind: MediaKind, modifier: Modifier = Modifier) {
    val color = when (kind) {
        MediaKind.LIVE -> Rose
        MediaKind.MOVIE -> Cyan
        MediaKind.SERIES -> Amber
    }
    Row(
        modifier = modifier
            .clip(CircleShape)
            .background(Ink.copy(alpha = 0.82f))
            .padding(horizontal = 7.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(5.dp)
                .clip(CircleShape)
                .background(color),
        )
        Spacer(Modifier.width(4.dp))
        Text(
            text = kind.label,
            color = Color.White,
            fontSize = 9.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 0.6.sp,
        )
    }
}

@Composable
private fun ChannelFallback(name: String) {
    val initials = name.trim().split(Regex("\\s+"))
        .filter { it.isNotBlank() }
        .take(2)
        .mapNotNull { it.firstOrNull()?.uppercaseChar() }
        .joinToString("")
        .ifBlank { "SH" }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Brush.linearGradient(listOf(Brand.copy(alpha = 0.55f), Panel2))),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = initials,
            color = Color.White.copy(alpha = 0.9f),
            fontWeight = FontWeight.SemiBold,
            fontSize = 22.sp,
        )
    }
}

@Composable
fun SettingsCard(
    title: String,
    subtitle: String? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(Panel)
            .border(1.dp, Line, RoundedCornerShape(20.dp))
            .padding(18.dp),
    ) {
        Text(title, color = Foreground, style = MaterialTheme.typography.titleMedium)
        if (subtitle != null) {
            Spacer(Modifier.height(3.dp))
            Text(subtitle, color = Muted, style = MaterialTheme.typography.bodyMedium)
        }
        Spacer(Modifier.height(14.dp))
        content()
    }
}

@Composable
fun AddPlaylistDialog(
    loading: Boolean,
    onDismiss: () -> Unit,
    onImportUrl: (String) -> Unit,
    onPickFile: () -> Unit,
) {
    var url by rememberSaveable { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = { if (!loading) onDismiss() },
        containerColor = Panel,
        title = {
            Text("Playlist hinzufügen", color = Foreground)
        },
        text = {
            Column {
                Text(
                    "Gib die M3U-Playlist-Adresse deines Anbieters ein oder wähle eine M3U-Datei auf dem Gerät.",
                    color = Muted,
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(14.dp))
                OutlinedTextField(
                    value = url,
                    onValueChange = { url = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("M3U-URL") },
                    placeholder = { Text("https://…/playlist.m3u") },
                    singleLine = true,
                    enabled = !loading,
                    shape = RoundedCornerShape(12.dp),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                )
                Spacer(Modifier.height(8.dp))
                TextButton(onClick = onPickFile, enabled = !loading) {
                    Icon(
                        Icons.Rounded.FolderOpen,
                        contentDescription = null,
                        tint = Cyan,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(Modifier.width(7.dp))
                    Text("M3U-Datei wählen", color = Color(0xFF7DD3FC))
                }
                if (loading) {
                    Spacer(Modifier.height(8.dp))
                    LinearProgressIndicator(
                        modifier = Modifier.fillMaxWidth(),
                        color = Cyan,
                        trackColor = Line,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onImportUrl(url.trim()) },
                enabled = url.isNotBlank() && !loading,
            ) {
                Text(if (loading) "Wird geladen …" else "Importieren")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !loading) {
                Text("Abbrechen")
            }
        },
    )
}

@Composable
fun AddEpgDialog(
    loading: Boolean,
    onDismiss: () -> Unit,
    onImportUrl: (String) -> Unit,
    onPickFile: () -> Unit,
) {
    var url by rememberSaveable { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = { if (!loading) onDismiss() },
        containerColor = Panel,
        title = {
            Text("EPG hinzufügen", color = Foreground)
        },
        text = {
            Column {
                Text(
                    "Gib eine XMLTV-EPG-Adresse ein oder wähle eine XMLTV-Datei. Die Programmdaten bleiben lokal auf diesem Gerät.",
                    color = Muted,
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(14.dp))
                OutlinedTextField(
                    value = url,
                    onValueChange = { url = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("XMLTV-URL") },
                    placeholder = { Text("https://…/guide.xml") },
                    singleLine = true,
                    enabled = !loading,
                    shape = RoundedCornerShape(12.dp),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                )
                Spacer(Modifier.height(8.dp))
                TextButton(onClick = onPickFile, enabled = !loading) {
                    Icon(
                        Icons.Rounded.FolderOpen,
                        contentDescription = null,
                        tint = Cyan,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(Modifier.width(7.dp))
                    Text("XMLTV-Datei wählen", color = Color(0xFF7DD3FC))
                }
                if (loading) {
                    Spacer(Modifier.height(8.dp))
                    LinearProgressIndicator(
                        modifier = Modifier.fillMaxWidth(),
                        color = Cyan,
                        trackColor = Line,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onImportUrl(url.trim()) },
                enabled = url.isNotBlank() && !loading,
            ) {
                Text(if (loading) "Wird geladen …" else "Importieren")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !loading) {
                Text("Abbrechen")
            }
        },
    )
}
