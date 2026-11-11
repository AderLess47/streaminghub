package de.streaminghub.app.data

import de.streaminghub.app.model.EpgProgramme

/**
 * Bundled sample library for store reviewers and for trying the app without an
 * account or a provider playlist.
 *
 * The entries are public test assets: HLS test streams published by Mux and
 * Apple, and open movies by the Blender Foundation (CC BY). No broadcaster,
 * film studio or third-party brand is represented, and no personal data is
 * included. Nothing here is a StreamingHub content offering — the demo exists
 * so that browsing, filtering and playback can be exercised end to end.
 */
object DemoLibrary {

    const val SOURCE_LABEL = "Demo-Inhalte"

    internal data class DemoChannel(
        val id: String,
        val name: String,
        val url: String,
    )

    internal val liveChannels = listOf(
        DemoChannel(
            id = "demo.live.one",
            name = "Demo Live Eins",
            url = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        ),
        DemoChannel(
            id = "demo.live.two",
            name = "Demo Live Zwei",
            url = "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8",
        ),
        DemoChannel(
            id = "demo.live.three",
            name = "Demo Live Drei",
            url = "https://test-streams.mux.dev/pts_shift/master.m3u8",
        ),
    )

    private val movies = listOf(
        DemoChannel(
            id = "demo.movie.one",
            name = "Demo Film: Tears of Steel",
            url = "https://test-streams.mux.dev/tos_ismc/main.m3u8",
        ),
        DemoChannel(
            id = "demo.movie.two",
            name = "Demo Film: Big Buck Bunny",
            url = "https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4",
        ),
    )

    private val series = DemoChannel(
        id = "demo.series.one",
        name = "Demo Serie: Sintel Trailer",
        url = "https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4",
    )

    /** Extended M3U source, parsed by [M3uParser] like any imported playlist. */
    val playlist: String = buildString {
        appendLine("#EXTM3U")
        liveChannels.forEach { channel ->
            appendLine("#EXTINF:-1 tvg-id=\"${channel.id}\" group-title=\"Demo Live\",${channel.name}")
            appendLine(channel.url)
        }
        movies.forEach { channel ->
            appendLine("#EXTINF:-1 tvg-id=\"${channel.id}\" group-title=\"Demo Filme\",${channel.name}")
            appendLine(channel.url)
        }
        appendLine("#EXTINF:-1 tvg-id=\"${series.id}\" group-title=\"Demo Serien\",${series.name}")
        appendLine(series.url)
    }

    private const val MINUTE_MS = 60_000L

    /**
     * Programme guide data relative to [nowMs], so the guide always shows a
     * running and an upcoming show instead of expiring sample timestamps.
     */
    fun programmes(nowMs: Long): List<EpgProgramme> {
        val slots = listOf(
            Triple(-75L, -15L, "Demo: Rückblick"),
            Triple(-15L, 25L, "Demo: Jetzt"),
            Triple(25L, 65L, "Demo: Danach"),
        )

        return liveChannels.flatMapIndexed { channelIndex, channel ->
            slots.mapIndexed { slotIndex, (fromMinutes, toMinutes, prefix) ->
                EpgProgramme(
                    channelId = channel.id,
                    channelName = channel.name,
                    startMs = nowMs + fromMinutes * MINUTE_MS,
                    stopMs = nowMs + toMinutes * MINUTE_MS,
                    title = "$prefix ${channelIndex + 1}.${slotIndex + 1}",
                    description = "Beispielsendung für Store-Tests. Kein echter Sender, keine echten Programmdaten.",
                )
            }
        }.sortedBy { it.startMs }
    }
}
