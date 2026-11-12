package de.streaminghub.app.ui

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import de.streaminghub.app.MainViewModel
import de.streaminghub.app.model.Channel

private sealed interface Screen {
    data object Home : Screen
    data class Player(val channel: Channel) : Screen
    data object Settings : Screen
    data object Pairing : Screen
    data object Guide : Screen
}

@Composable
fun StreamingHubRoot(viewModel: MainViewModel = viewModel()) {
    val context = LocalContext.current
    val state = viewModel.uiState
    val accountState = viewModel.accountState
    val epgState = viewModel.epgState
    val lowSpecMode = viewModel.lowSpecMode
    val premiumState by viewModel.premiumState.collectAsState()
    var screen by remember { mutableStateOf<Screen>(Screen.Home) }
    var showAddPlaylist by rememberSaveable { mutableStateOf(false) }
    var showAddEpg by rememberSaveable { mutableStateOf(false) }

    val playlistFilePicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument(),
    ) { uri: Uri? ->
        if (uri != null) {
            viewModel.importFromUri(uri)
            showAddPlaylist = false
        }
    }

    val epgFilePicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument(),
    ) { uri: Uri? ->
        if (uri != null) {
            viewModel.importEpgFromUri(uri)
            showAddEpg = false
        }
    }

    fun openWebsite(path: String) {
        runCatching {
            context.startActivity(
                Intent(
                    Intent.ACTION_VIEW,
                    Uri.parse("https://streaminghub.org$path"),
                ),
            )
        }
    }

    BackHandler(enabled = screen != Screen.Home) {
        screen = Screen.Home
    }

    // Reload the store offer and the subscription whenever settings open.
    LaunchedEffect(screen) {
        if (screen == Screen.Settings) viewModel.loadPremium()
    }

    when (val current = screen) {
        Screen.Home -> HomeScreen(
            state = state,
            onPlay = { channel -> screen = Screen.Player(channel) },
            onToggleFavorite = viewModel::toggleFavorite,
            onAddPlaylist = { showAddPlaylist = true },
            onOpenSettings = { screen = Screen.Settings },
            onDismissError = viewModel::clearError,
            onOpenWebsite = { openWebsite("/") },
            hasEpg = epgState.programmes.isNotEmpty(),
            onOpenGuide = { screen = Screen.Guide },
            lowSpecMode = lowSpecMode,
            demoMode = state.demoMode,
            onLoadDemo = viewModel::loadDemoLibrary,
            onExitDemo = viewModel::removeDemoLibrary,
        )

        is Screen.Player -> PlayerScreen(
            channel = current.channel,
            viewModel = viewModel,
            lowSpecMode = lowSpecMode,
            onBack = { screen = Screen.Home },
        )

        Screen.Guide -> GuideScreen(
            channels = state.channels,
            epgState = epgState,
            onPlay = { channel -> screen = Screen.Player(channel) },
            onDismissError = viewModel::dismissEpgError,
            onBack = { screen = Screen.Home },
        )

        Screen.Settings -> SettingsScreen(
            state = state,
            accountState = accountState,
            epgState = epgState,
            lowSpecMode = lowSpecMode,
            onLowSpecModeChange = viewModel::updateLowSpecMode,
            onBack = { screen = Screen.Home },
            onPairDevice = {
                viewModel.startPairing()
                screen = Screen.Pairing
            },
            onRefreshAccount = viewModel::refreshAccount,
            onForgetDevice = viewModel::forgetDevice,
            onAddEpg = { showAddEpg = true },
            onRefreshEpg = viewModel::refreshEpg,
            onRemoveEpg = viewModel::removeEpg,
            onOpenGuide = { screen = Screen.Guide },
            onRefreshPlaylist = viewModel::refreshPlaylist,
            onRemovePlaylist = viewModel::removePlaylist,
            onClearProgress = viewModel::clearProgress,
            onAddPlaylist = { showAddPlaylist = true },
            onOpenWebsite = { path -> openWebsite(path) },
            onDismissError = viewModel::clearError,
            demoMode = state.demoMode,
            onLoadDemo = viewModel::loadDemoLibrary,
            onRemoveDemo = viewModel::removeDemoLibrary,
            premiumState = premiumState,
            onBuyPremium = { viewModel.buyPremium() },
            onRestorePremium = { viewModel.restorePremium() },
        )

        Screen.Pairing -> PairingScreen(
            state = accountState,
            onStartPairing = viewModel::startPairing,
            onDismissPairingError = viewModel::dismissPairingError,
            onBack = {
                viewModel.cancelPairing()
                screen = Screen.Settings
            },
            onPaired = {
                viewModel.acknowledgePairingSuccess()
                viewModel.refreshAccount()
                screen = Screen.Settings
            },
        )
    }

    if (showAddPlaylist) {
        AddPlaylistDialog(
            loading = state.loading,
            onDismiss = { showAddPlaylist = false },
            onImportUrl = { url ->
                viewModel.importFromUrl(url)
                showAddPlaylist = false
            },
            onPickFile = {
                playlistFilePicker.launch(arrayOf("*/*"))
            },
        )
    }

    if (showAddEpg) {
        AddEpgDialog(
            loading = epgState.loading,
            onDismiss = { showAddEpg = false },
            onImportUrl = { url ->
                viewModel.importEpgFromUrl(url)
                showAddEpg = false
            },
            onPickFile = {
                epgFilePicker.launch(arrayOf("*/*"))
            },
        )
    }
}
