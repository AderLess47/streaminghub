package de.streaminghub.app.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.view.WindowManager
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Replay
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import de.streaminghub.app.MainViewModel
import de.streaminghub.app.data.resumeStart
import de.streaminghub.app.model.Channel
import de.streaminghub.app.ui.theme.Brand
import de.streaminghub.app.ui.theme.Cyan
import de.streaminghub.app.ui.theme.Foreground
import de.streaminghub.app.ui.theme.Ink
import de.streaminghub.app.ui.theme.Line
import de.streaminghub.app.ui.theme.Muted
import de.streaminghub.app.ui.theme.Panel
import kotlinx.coroutines.delay
import de.streaminghub.app.data.AppLog
import de.streaminghub.app.data.PlaybackErrors

@Composable
fun PlayerScreen(
    channel: Channel,
    viewModel: MainViewModel,
    lowSpecMode: Boolean,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val startPosition = remember(channel.url) { viewModel.progressFor(channel) }

    val mediaItem = remember(channel.url, channel.drm) {
        val builder = MediaItem.Builder().setUri(channel.url)
        channel.drm?.let { drm ->
            builder.setDrmConfiguration(
                MediaItem.DrmConfiguration.Builder(drm.scheme.uuid)
                    .setLicenseUri(drm.licenseUrl)
                    .setLicenseRequestHeaders(drm.headers)
                    .build(),
            )
        }
        builder.build()
    }

    val exoPlayer = remember(mediaItem, lowSpecMode) {
        val renderersFactory = DefaultRenderersFactory(context)
            .setEnableDecoderFallback(true)
        val builder = ExoPlayer.Builder(context, renderersFactory)

        if (lowSpecMode) {
            builder.setLoadControl(
                DefaultLoadControl.Builder()
                    .setBufferDurationsMs(
                        10_000,
                        25_000,
                        1_000,
                        2_000,
                    )
                    .build(),
            )
        }

        builder.build().apply {
            setMediaItem(mediaItem, startPosition)
            prepare()
            playWhenReady = true
        }
    }

    val listener = remember(exoPlayer) {
        object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                AppLog.error(
                    "player",
                    error,
                    "${AppLog.redactUrl(channel.url)} drm=${channel.drm?.scheme?.label ?: "keins"}",
                )
                errorMessage = PlaybackErrors.describe(
                    errorCode = error.errorCode,
                    detail = error.localizedMessage,
                    hasDrm = channel.drm != null,
                    insecure = channel.url.startsWith("http://", ignoreCase = true),
                )
            }
        }
    }

    val activity = remember(context) { context.findActivity() }
    DisposableEffect(activity) {
        activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val insetsController = activity?.window?.let { window ->
            WindowCompat.getInsetsController(window, window.decorView)
        }
        insetsController?.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        insetsController?.hide(WindowInsetsCompat.Type.systemBars())

        onDispose {
            activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            insetsController?.show(WindowInsetsCompat.Type.systemBars())
        }
    }

    DisposableEffect(exoPlayer, listener) {
        exoPlayer.addListener(listener)
        onDispose {
            viewModel.saveProgress(channel, exoPlayer.currentPosition, exoPlayer.duration)
            viewModel.syncWatchProgress(channel, exoPlayer.currentPosition, exoPlayer.duration)
            exoPlayer.removeListener(listener)
            exoPlayer.release()
        }
    }

    // Premium accounts continue where another device stopped; the local position
    // still wins when it is further ahead.
    LaunchedEffect(exoPlayer, channel.url) {
        val remote = viewModel.remoteResumePosition(channel)
        val target = resumeStart(viewModel.progressFor(channel), remote)
        if (target > 5_000L && target > exoPlayer.currentPosition + 5_000L) {
            exoPlayer.seekTo(target)
        }
    }

    LaunchedEffect(exoPlayer) {
        var ticks = 0
        while (true) {
            delay(5_000)
            if (exoPlayer.isPlaying && exoPlayer.duration > 0L) {
                viewModel.saveProgress(channel, exoPlayer.currentPosition, exoPlayer.duration)
                ticks += 1
                if (ticks % 6 == 0) {
                    viewModel.syncWatchProgress(
                        channel,
                        exoPlayer.currentPosition,
                        exoPlayer.duration,
                    )
                }
            }
        }
    }

    BackHandler(onBack = onBack)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
    ) {
        AndroidView(
            factory = { viewContext ->
                PlayerView(viewContext).apply {
                    player = exoPlayer
                    useController = true
                    controllerAutoShow = true
                    controllerShowTimeoutMs = 3_500
                    setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING)
                    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                    setBackgroundColor(android.graphics.Color.BLACK)
                }
            },
            update = { playerView -> playerView.player = exoPlayer },
            modifier = Modifier.fillMaxSize(),
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(
                        listOf(Color.Black.copy(alpha = 0.82f), Color.Transparent),
                    ),
                )
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(
                onClick = onBack,
                modifier = Modifier
                    .clip(CircleShape)
                    .background(Ink.copy(alpha = 0.45f)),
            ) {
                Icon(
                    Icons.AutoMirrored.Rounded.ArrowBack,
                    contentDescription = "Zurück zur Bibliothek",
                    tint = Color.White,
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = channel.name,
                    color = Foreground,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 17.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = "${channel.group} · ${channel.kind.label}",
                    color = Muted,
                    fontSize = 12.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        if (errorMessage != null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.78f)),
                contentAlignment = Alignment.Center,
            ) {
                Column(
                    modifier = Modifier
                        .padding(24.dp)
                        .clip(RoundedCornerShape(24.dp))
                        .background(Panel)
                        .padding(22.dp),
                ) {
                    Text(
                        text = "Wiedergabe nicht möglich",
                        color = Foreground,
                        style = MaterialTheme.typography.titleLarge,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = errorMessage ?: "",
                        color = Muted,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Spacer(Modifier.height(18.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                        PrimaryAction(
                            text = "Erneut versuchen",
                            icon = Icons.Rounded.Replay,
                            onClick = {
                                errorMessage = null
                                exoPlayer.prepare()
                                exoPlayer.play()
                            },
                        )
                        SecondaryAction(
                            text = "Zurück",
                            onClick = onBack,
                        )
                    }
                }
            }
        }
    }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
