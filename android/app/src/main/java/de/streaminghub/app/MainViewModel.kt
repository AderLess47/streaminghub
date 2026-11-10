package de.streaminghub.app

import android.app.Application
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import de.streaminghub.app.data.AccountInfo
import de.streaminghub.app.data.DeviceIdentity
import de.streaminghub.app.data.EpgRepository
import de.streaminghub.app.data.M3uParser
import de.streaminghub.app.data.ManagedPlaylist
import de.streaminghub.app.data.PairingCodeData
import de.streaminghub.app.data.PlaylistRepository
import de.streaminghub.app.data.SecureTokenStore
import de.streaminghub.app.data.SettingsRepository
import de.streaminghub.app.data.StreamingHubApi
import de.streaminghub.app.data.StreamingHubApiException
import de.streaminghub.app.data.XmltvParser
import de.streaminghub.app.model.Channel
import de.streaminghub.app.model.EpgProgramme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.IOException
import java.io.Reader
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL
import java.net.UnknownHostException

private const val MANAGED_PLAYLIST_LABEL = "Admin-Playlist"

internal enum class ManagedPlaylistSyncAction { KEEP, CLEAR, MARK_MANAGED, LOAD }

internal fun managedPlaylistSyncAction(
    currentSourceUrl: String?,
    currentManaged: Boolean,
    remote: ManagedPlaylist?,
): ManagedPlaylistSyncAction {
    if (remote == null) {
        return if (currentManaged) ManagedPlaylistSyncAction.CLEAR else ManagedPlaylistSyncAction.KEEP
    }

    val url = remote.url.trim()
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return ManagedPlaylistSyncAction.KEEP
    }

    if (currentSourceUrl == url) {
        return if (currentManaged) ManagedPlaylistSyncAction.KEEP else ManagedPlaylistSyncAction.MARK_MANAGED
    }

    return ManagedPlaylistSyncAction.LOAD
}

data class AppUiState(
    val channels: List<Channel> = emptyList(),
    val favorites: Set<String> = emptySet(),
    val loading: Boolean = false,
    val error: String? = null,
    val sourceUrl: String? = null,
    val sourceLabel: String? = null,
    val updatedAt: Long? = null,
    val managedPlaylist: Boolean = false,
)

data class AccountUiState(
    val account: AccountInfo? = null,
    val loading: Boolean = false,
    val error: String? = null,
    val pairing: PairingCodeData? = null,
    val pairingBusy: Boolean = false,
    val pairingError: String? = null,
    val pairedSuccessfully: Boolean = false,
)

data class EpgUiState(
    val programmes: List<EpgProgramme> = emptyList(),
    val sourceUrl: String? = null,
    val updatedAt: Long? = null,
    val loading: Boolean = false,
    val error: String? = null,
)

class MainViewModel(application: Application) : AndroidViewModel(application) {

    private val repository = PlaylistRepository(application)
    private val epgRepository = EpgRepository(application)
    private val secureStore = SecureTokenStore(application)
    private val settingsRepository = SettingsRepository(application)
    private val api = StreamingHubApi()
    private var pairingJob: Job? = null
    private var playlistRefreshJob: Job? = null

    var uiState by mutableStateOf(AppUiState())
        private set

    var accountState by mutableStateOf(AccountUiState())
        private set

    var epgState by mutableStateOf(EpgUiState())
        private set

    var lowSpecMode by mutableStateOf(settingsRepository.isLowSpecMode())
        private set

    init {
        val stored = repository.loadPlaylist()
        uiState = AppUiState(
            channels = stored.channels,
            favorites = repository.loadFavorites(),
            sourceUrl = stored.sourceUrl,
            sourceLabel = stored.sourceLabel,
            updatedAt = stored.updatedAt,
            managedPlaylist = stored.sourceLabel == MANAGED_PLAYLIST_LABEL,
        )

        val storedEpg = epgRepository.load()
        epgState = EpgUiState(
            programmes = storedEpg.programmes,
            sourceUrl = storedEpg.sourceUrl,
            updatedAt = storedEpg.updatedAt,
        )

        if (secureStore.loadToken() != null) {
            refreshAccount()
        }

        refreshCachedPlaylistIfStale()
    }

    fun importFromUrl(rawUrl: String) {
        val url = rawUrl.trim()
        if (!url.startsWith("https://") && !url.startsWith("http://")) {
            uiState = uiState.copy(
                error = "Bitte eine vollständige Playlist-Adresse mit http:// oder https:// eingeben.",
            )
            return
        }

        playlistRefreshJob?.cancel()
        uiState = uiState.copy(loading = true, error = null)
        playlistRefreshJob = viewModelScope.launch {
            val content = runCatching { fetchPlaylist(url) }.getOrElse { throwable ->
                uiState = uiState.copy(
                    loading = false,
                    error = throwable.toUserMessage(),
                )
                return@launch
            }
            applyPlaylist(
                content = content,
                sourceUrl = url,
                sourceLabel = sourceLabelFor(url),
            )
        }
    }

    fun importFromUri(uri: Uri) {
        playlistRefreshJob?.cancel()
        uiState = uiState.copy(loading = true, error = null)
        playlistRefreshJob = viewModelScope.launch {
            val content = runCatching { readUri(uri) }.getOrElse { throwable ->
                uiState = uiState.copy(
                    loading = false,
                    error = throwable.toUserMessage(),
                )
                return@launch
            }
            applyPlaylist(
                content = content,
                sourceUrl = null,
                sourceLabel = "M3U-Datei",
            )
        }
    }

    fun refreshPlaylist() {
        val source = uiState.sourceUrl ?: return
        importFromUrl(source)
    }

    fun removePlaylist() {
        playlistRefreshJob?.cancel()
        playlistRefreshJob = null
        repository.clearPlaylist()
        uiState = AppUiState()
    }

    fun updateLowSpecMode(enabled: Boolean) {
        lowSpecMode = enabled
        settingsRepository.saveLowSpecMode(enabled)
    }

    fun toggleFavorite(channel: Channel) {
        uiState = uiState.copy(favorites = repository.toggleFavorite(channel.url))
    }

    fun progressFor(channel: Channel): Long = repository.progressFor(channel.url)

    fun saveProgress(channel: Channel, positionMs: Long, durationMs: Long) {
        repository.saveProgress(channel.url, positionMs, durationMs)
    }

    fun clearProgress() {
        repository.clearProgress()
    }

    fun clearError() {
        if (uiState.error != null) uiState = uiState.copy(error = null)
    }

    // ---- XMLTV programme guide ---------------------------------------------------

    fun importEpgFromUrl(rawUrl: String) {
        val url = rawUrl.trim()
        if (!url.startsWith("https://") && !url.startsWith("http://")) {
            epgState = epgState.copy(
                error = "Bitte eine vollständige XMLTV-Adresse mit http:// oder https:// eingeben.",
            )
            return
        }

        epgState = epgState.copy(loading = true, error = null)
        viewModelScope.launch {
            val content = runCatching { fetchEpg(url) }.getOrElse { throwable ->
                epgState = epgState.copy(loading = false, error = throwable.epgMessage())
                return@launch
            }
            applyEpg(content, url)
        }
    }

    fun importEpgFromUri(uri: Uri) {
        epgState = epgState.copy(loading = true, error = null)
        viewModelScope.launch {
            val content = runCatching { readEpgUri(uri) }.getOrElse { throwable ->
                epgState = epgState.copy(loading = false, error = throwable.epgMessage())
                return@launch
            }
            applyEpg(content, null)
        }
    }

    fun refreshEpg() {
        val source = epgState.sourceUrl ?: return
        importEpgFromUrl(source)
    }

    fun removeEpg() {
        epgRepository.clear()
        epgState = EpgUiState()
    }

    fun dismissEpgError() {
        if (epgState.error != null) epgState = epgState.copy(error = null)
    }

    private suspend fun applyEpg(content: String, sourceUrl: String?) {
        val programmes = withContext(Dispatchers.Default) {
            runCatching { XmltvParser.parse(content) }
        }.getOrElse { throwable ->
            epgState = epgState.copy(
                loading = false,
                error = throwable.epgMessage(),
            )
            return
        }
        if (programmes.isEmpty()) {
            epgState = epgState.copy(
                loading = false,
                error = "Die XMLTV-Datei enthält keine gültigen Sendungen.",
            )
            return
        }

        val stored = withContext(Dispatchers.IO) {
            epgRepository.save(programmes, sourceUrl)
            epgRepository.load()
        }
        epgState = EpgUiState(
            programmes = stored.programmes,
            sourceUrl = stored.sourceUrl,
            updatedAt = stored.updatedAt,
        )
    }

    // ---- Account and device pairing -------------------------------------------------

    fun refreshAccount() {
        val token = secureStore.loadToken()
        if (token == null) {
            accountState = AccountUiState()
            return
        }

        accountState = accountState.copy(loading = true, error = null)
        viewModelScope.launch {
            runCatching { api.me(token) }
                .onSuccess { account ->
                    accountState = AccountUiState(account = account)
                    syncManagedPlaylist(account)
                }
                .onFailure { throwable ->
                    handleAccountFailure(throwable)
                }
        }
    }

    fun startPairing() {
        pairingJob?.cancel()
        accountState = accountState.copy(
            pairingBusy = true,
            pairing = null,
            pairingError = null,
            pairedSuccessfully = false,
            error = null,
        )

        val app = getApplication<Application>()
        viewModelScope.launch {
            runCatching {
                api.requestPairing(
                    deviceName = DeviceIdentity.name(),
                    platform = DeviceIdentity.platform(app),
                    appVersion = BuildConfig.VERSION_NAME,
                )
            }.onSuccess { session ->
                accountState = accountState.copy(
                    pairing = session,
                    pairingBusy = true,
                    pairingError = null,
                )
                pollPairing(session)
            }.onFailure { throwable ->
                accountState = accountState.copy(
                    pairingBusy = false,
                    pairingError = throwable.accountMessage(),
                )
            }
        }
    }

    fun cancelPairing() {
        pairingJob?.cancel()
        pairingJob = null
        accountState = accountState.copy(
            pairing = null,
            pairingBusy = false,
            pairingError = null,
        )
    }

    fun acknowledgePairingSuccess() {
        accountState = accountState.copy(pairedSuccessfully = false)
    }

    fun dismissPairingError() {
        accountState = accountState.copy(pairingError = null)
    }

    fun forgetDevice() {
        pairingJob?.cancel()
        pairingJob = null
        secureStore.clearToken()
        clearManagedPlaylist()
        accountState = AccountUiState()
    }

    private fun pollPairing(session: PairingCodeData) {
        pairingJob?.cancel()
        pairingJob = viewModelScope.launch {
            while (isActive) {
                delay(session.pollIntervalSeconds * 1_000L)
                val result = runCatching {
                    api.pollPairing(session.requestId, session.pollToken)
                }

                if (result.isFailure) {
                    accountState = accountState.copy(
                        pairingBusy = false,
                        pairingError = result.exceptionOrNull()?.accountMessage()
                            ?: "Der Kopplungsstatus konnte nicht geladen werden.",
                    )
                    return@launch
                }

                val poll = result.getOrThrow()
                when (poll.status) {
                    "claimed" -> {
                        val activationToken = poll.activationToken
                        if (activationToken.isNullOrBlank()) {
                            accountState = accountState.copy(
                                pairingBusy = false,
                                pairingError = "Der Aktivierungstoken fehlt.",
                            )
                            return@launch
                        }
                        if (!secureStore.saveToken(activationToken)) {
                            accountState = accountState.copy(
                                pairingBusy = false,
                                pairingError = "Der Aktivierungstoken konnte nicht sicher gespeichert werden.",
                            )
                            return@launch
                        }

                        val account = runCatching { api.me(activationToken) }.getOrNull()
                        accountState = AccountUiState(
                            account = account,
                            pairedSuccessfully = true,
                            error = if (account == null) {
                                "Das Gerät wurde aktiviert, die Kontodaten konnten aber noch nicht geladen werden."
                            } else {
                                null
                            },
                        )
                        if (account != null) syncManagedPlaylist(account)
                        return@launch
                    }

                    "expired" -> {
                        accountState = accountState.copy(
                            pairingBusy = false,
                            pairingError = "Der Kopplungscode ist abgelaufen. Bitte fordere einen neuen Code an.",
                        )
                        return@launch
                    }
                }
            }
        }
    }

    private fun syncManagedPlaylist(account: AccountInfo) {
        val managed = account.playlist
        when (managedPlaylistSyncAction(uiState.sourceUrl, uiState.managedPlaylist, managed)) {
            ManagedPlaylistSyncAction.KEEP -> return
            ManagedPlaylistSyncAction.CLEAR -> {
                clearManagedPlaylist()
                return
            }
            ManagedPlaylistSyncAction.MARK_MANAGED -> {
                uiState = uiState.copy(
                    managedPlaylist = true,
                    sourceLabel = MANAGED_PLAYLIST_LABEL,
                )
                return
            }
            ManagedPlaylistSyncAction.LOAD -> Unit
        }

        val url = managed?.url?.trim() ?: return
        playlistRefreshJob?.cancel()
        uiState = uiState.copy(loading = true, error = null)
        playlistRefreshJob = viewModelScope.launch {
            val content = runCatching { fetchPlaylist(url) }.getOrElse { throwable ->
                uiState = uiState.copy(
                    loading = false,
                    error = throwable.toUserMessage(),
                )
                return@launch
            }
            applyPlaylist(
                content = content,
                sourceUrl = url,
                sourceLabel = MANAGED_PLAYLIST_LABEL,
            )
        }
    }

    private fun handleAccountFailure(throwable: Throwable) {
        val apiError = throwable as? StreamingHubApiException
        if (apiError?.httpStatus == 401 || apiError?.httpStatus == 403) {
            secureStore.clearToken()
            clearManagedPlaylist()
            accountState = AccountUiState(error = apiError.message)
        } else {
            accountState = accountState.copy(
                loading = false,
                error = throwable.accountMessage(),
            )
        }
    }

    private fun clearManagedPlaylist() {
        if (!uiState.managedPlaylist) return
        playlistRefreshJob?.cancel()
        playlistRefreshJob = null
        repository.clearPlaylist()
        uiState = AppUiState()
    }

    private fun refreshCachedPlaylistIfStale() {
        val source = uiState.sourceUrl ?: return
        if (!source.startsWith("http://") && !source.startsWith("https://")) return

        val cachedAt = uiState.updatedAt ?: 0L
        if (System.currentTimeMillis() - cachedAt < CACHE_REFRESH_AFTER_MS) return

        val label = uiState.sourceLabel ?: sourceLabelFor(source)
        playlistRefreshJob?.cancel()
        playlistRefreshJob = viewModelScope.launch {
            val content = runCatching { fetchPlaylist(source) }.getOrNull() ?: return@launch
            if (uiState.sourceUrl != source || uiState.updatedAt != cachedAt) return@launch
            applyPlaylist(
                content = content,
                sourceUrl = source,
                sourceLabel = label,
                silent = true,
            )
        }
    }

    private suspend fun applyPlaylist(
        content: String,
        sourceUrl: String?,
        sourceLabel: String,
        silent: Boolean = false,
    ) {
        val channels = withContext(Dispatchers.Default) {
            runCatching { M3uParser.parse(content) }
        }.getOrElse { throwable ->
            uiState = uiState.copy(
                loading = false,
                error = if (silent) uiState.error else throwable.toUserMessage(),
            )
            return
        }
        if (channels.isEmpty()) {
            uiState = uiState.copy(
                loading = false,
                error = if (silent) {
                    uiState.error
                } else {
                    "Die Playlist enthält keine abspielbaren Einträge. Prüfe die M3U-Datei oder URL."
                },
            )
            return
        }

        val stored = withContext(Dispatchers.IO) {
            repository.savePlaylist(channels, sourceUrl, sourceLabel)
            repository.loadPlaylist()
        }
        uiState = AppUiState(
            channels = stored.channels,
            favorites = repository.loadFavorites(),
            sourceUrl = stored.sourceUrl,
            sourceLabel = stored.sourceLabel,
            updatedAt = stored.updatedAt,
            managedPlaylist = sourceLabel == MANAGED_PLAYLIST_LABEL,
        )
    }

    private suspend fun fetchPlaylist(url: String): String = withContext(Dispatchers.IO) {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 20_000
            readTimeout = 45_000
            instanceFollowRedirects = true
            requestMethod = "GET"
            setRequestProperty("Accept", "*/*")
            setRequestProperty("User-Agent", "StreamingHub/1.2 (Android)")
        }

        try {
            val code = connection.responseCode
            if (code !in 200..299) {
                throw IOException("Der Server antwortet mit HTTP $code.")
            }
            connection.inputStream.bufferedReader(Charsets.UTF_8).use { reader ->
                reader.readLimited(MAX_PLAYLIST_CHARS)
            }
        } finally {
            connection.disconnect()
        }
    }

    private suspend fun readUri(uri: Uri): String = withContext(Dispatchers.IO) {
        val resolver = getApplication<Application>().contentResolver
        resolver.openInputStream(uri)?.bufferedReader(Charsets.UTF_8)?.use { reader ->
            reader.readLimited(MAX_PLAYLIST_CHARS)
        } ?: throw IOException("Die ausgewählte Datei konnte nicht geöffnet werden.")
    }

    private suspend fun fetchEpg(url: String): String = withContext(Dispatchers.IO) {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 20_000
            readTimeout = 45_000
            instanceFollowRedirects = true
            requestMethod = "GET"
            setRequestProperty("Accept", "application/xml,text/xml,*/*")
            setRequestProperty("User-Agent", "StreamingHub/1.2 (Android)")
        }

        try {
            val code = connection.responseCode
            if (code !in 200..299) {
                throw IOException("Der EPG-Server antwortet mit HTTP $code.")
            }
            connection.inputStream.bufferedReader(Charsets.UTF_8).use { reader ->
                reader.readLimited(MAX_EPG_CHARS)
            }
        } finally {
            connection.disconnect()
        }
    }

    private suspend fun readEpgUri(uri: Uri): String = withContext(Dispatchers.IO) {
        val resolver = getApplication<Application>().contentResolver
        resolver.openInputStream(uri)?.bufferedReader(Charsets.UTF_8)?.use { reader ->
            reader.readLimited(MAX_EPG_CHARS)
        } ?: throw IOException("Die ausgewählte EPG-Datei konnte nicht geöffnet werden.")
    }

    private fun Reader.readLimited(maxChars: Int): String {
        val builder = StringBuilder()
        val buffer = CharArray(8_192)
        var total = 0
        while (true) {
            val read = read(buffer)
            if (read < 0) break
            total += read
            if (total > maxChars) {
                throw IOException("Die Playlist ist zu groß (maximal 20 MB).")
            }
            builder.append(buffer, 0, read)
        }
        return builder.toString()
    }

    private fun sourceLabelFor(url: String): String {
        val host = runCatching { Uri.parse(url).host }.getOrNull()
        return host?.takeIf { it.isNotBlank() } ?: "Playlist-URL"
    }

    private fun Throwable.toUserMessage(): String = when (this) {
        is UnknownHostException -> "Der Playlist-Server ist nicht erreichbar. Prüfe die Adresse und deine Verbindung."
        is SocketTimeoutException -> "Der Playlist-Server antwortet zu langsam. Bitte versuche es erneut."
        is IOException -> message?.takeIf { it.isNotBlank() }
            ?: "Die Playlist konnte nicht geladen werden."
        else -> "Die Playlist konnte nicht verarbeitet werden."
    }

    private fun Throwable.accountMessage(): String = when (this) {
        is StreamingHubApiException -> message
        is UnknownHostException -> "streaminghub.org ist nicht erreichbar. Prüfe deine Internetverbindung."
        is SocketTimeoutException -> "streaminghub.org antwortet zu langsam. Bitte versuche es erneut."
        is IOException -> message?.takeIf { it.isNotBlank() }
            ?: "Die Kontoanfrage konnte nicht abgeschlossen werden."
        else -> "Die Kontoanfrage konnte nicht abgeschlossen werden."
    }

    private fun Throwable.epgMessage(): String = when (this) {
        is UnknownHostException -> "Der EPG-Server ist nicht erreichbar. Prüfe die Adresse und deine Verbindung."
        is SocketTimeoutException -> "Der EPG-Server antwortet zu langsam. Bitte versuche es erneut."
        is IOException -> message?.takeIf { it.isNotBlank() }
            ?: "Das EPG konnte nicht geladen werden."
        else -> "Das EPG konnte nicht verarbeitet werden."
    }

    private companion object {
        const val MAX_PLAYLIST_CHARS = 20_000_000
        const val MAX_EPG_CHARS = 20_000_000
        const val CACHE_REFRESH_AFTER_MS = 15 * 60 * 1_000L
    }
}
