import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { KeplerVideoView, VideoPlayer } from "@amazon-devices/react-native-w3cmedia";
import type { Channel } from "../../model/types";
import { createHlsAdapter, hasHlsAdapter, isAdaptiveSource } from "../../player/hls";
import { Button, Notice } from "../components";
import { colors, radius, space, text as sizes } from "../theme";

/**
 * Wiedergabe.
 *
 * Progressive Quellen laufen über den W3C-Player im URL-Modus. HLS/DASH braucht
 * MSE plus JavaScript-Player; dafür gibt es die Nahtstelle in `player/hls.ts`.
 * Ist sie nicht bestückt, sagt der Bildschirm das – eine schwarze Fläche ohne
 * Erklärung wäre der schlechtere Zustand.
 */

type Props = {
  channel: Channel;
  resumeMs: number;
  onClose: () => void;
  onProgress: (positionMs: number, durationMs: number) => void;
};

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function PlayerScreen({ channel, resumeMs, onClose, onProgress }: Props) {
  const playerRef = useRef<VideoPlayer | null>(null);
  const [player, setPlayer] = useState<VideoPlayer | null>(null);
  const [status, setStatus] = useState("Player wird vorbereitet …");
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [position, setPosition] = useState(resumeMs / 1000);
  const [duration, setDuration] = useState(0);
  const adaptive = isAdaptiveSource(channel.url);

  useEffect(() => {
    if (adaptive && !hasHlsAdapter()) return;

    const video = new VideoPlayer();
    playerRef.current = video;
    let disposed = false;
    let lastReport = 0;

    const onLoaded = () => {
      setStatus("Bereit");
      const total = video.duration;
      if (Number.isFinite(total)) setDuration(total);
      if (resumeMs > 5_000) video.currentTime = resumeMs / 1000;
    };
    const onPlaying = () => {
      setStatus("Wiedergabe läuft");
      setPaused(false);
    };
    const onPause = () => setPaused(true);
    const onTimeUpdate = () => {
      const now = Date.now();
      setPosition(video.currentTime);
      if (!Number.isFinite(video.duration)) return;
      setDuration(video.duration);
      // Alle zehn Sekunden reicht: Der Fortschritt soll den Player nicht bremsen.
      if (now - lastReport < 10_000) return;
      lastReport = now;
      onProgress(Math.round(video.currentTime * 1000), Math.round(video.duration * 1000));
    };
    const onEnded = () => {
      setStatus("Beendet");
      onProgress(Math.round((video.duration || 0) * 1000), Math.round((video.duration || 0) * 1000));
    };
    const onError = () => setError("Die Quelle konnte nicht wiedergegeben werden.");

    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);

    if (adaptive) {
      const adapter = createHlsAdapter(video);
      void adapter?.load(channel.url).catch(() => {
        if (!disposed) setError("Der HLS-Player konnte die Quelle nicht laden.");
      });
    } else {
      video
        .initialize()
        .then(() => {
          video.src = channel.url;
          return video.play();
        })
        .catch((reason: unknown) => {
          if (disposed) return;
          setError(`Der Player konnte nicht starten: ${String(reason)}`);
        });
    }

    setPlayer(video);

    return () => {
      disposed = true;
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
      if (video.currentTime > 0 && Number.isFinite(video.duration)) {
        onProgress(Math.round(video.currentTime * 1000), Math.round(video.duration * 1000));
      }
      video.pause();
      // Der Player gehört der App, nicht dem Bildschirm: Beim Verlassen muss er
      // freigegeben werden, sonst bleibt der native Decoder belegt.
      void video.deinitialize().catch(() => undefined);
      playerRef.current = null;
      setPlayer(null);
    };
    // Der Bildschirm gilt für genau eine Quelle; ein Wechsel erzeugt einen neuen Player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.url]);

  function togglePlayback() {
    const video = playerRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }

  function seekBy(seconds: number) {
    const video = playerRef.current;
    if (!video) return;
    const next = Math.max(0, Math.min(video.duration || Number.POSITIVE_INFINITY, video.currentTime + seconds));
    video.currentTime = next;
    setPosition(next);
  }

  return (
    <View style={styles.root}>
      <View style={styles.surface}>
        {player ? (
          <KeplerVideoView style={styles.video} videoPlayer={player} />
        ) : (
          <View style={styles.surfaceFallback}>
            <Text style={styles.fallbackTitle}>
              {adaptive && !hasHlsAdapter() ? "HLS braucht den Shaka-Player" : "Kein Bild"}
            </Text>
            <Text style={styles.fallbackText}>
              {adaptive && !hasHlsAdapter()
                ? "Diese Quelle ist ein HLS-Manifest. Vega OS spielt sie nur im MSE-Modus mit einem JavaScript-Player. Das gepatchte Shaka-Paket von Amazon ist in diesem Projekt noch nicht eingebunden (siehe README, Abschnitt „HLS und DASH“). Progressive Dateien wie MP4 laufen ohne diesen Schritt."
                : "Der Player wurde noch nicht erzeugt."}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.overlay}>
        <View style={styles.overlayText}>
          <Text style={styles.title} numberOfLines={1}>
            {channel.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {channel.group} · {status}
            {duration > 0 ? ` · ${formatClock(position)} / ${formatClock(duration)}` : ""}
          </Text>
        </View>
        <View style={styles.controls}>
          <Button label={paused ? "Abspielen" : "Pause"} onPress={togglePlayback} hasTVPreferredFocus />
          <Button label="−10 s" onPress={() => seekBy(-10)} variant="ghost" />
          <Button label="+10 s" onPress={() => seekBy(10)} variant="ghost" />
          <Button label="Zurück" onPress={onClose} variant="ghost" />
        </View>
      </View>

      {error ? (
        <View style={styles.errorArea}>
          <Notice tone="error" title="Wiedergabe nicht möglich">
            {error}
          </Notice>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  surface: { flex: 1, backgroundColor: "#000000" },
  video: { flex: 1 },
  surfaceFallback: { flex: 1, padding: space.xl, gap: space.md, justifyContent: "center" },
  fallbackTitle: { color: colors.text, fontSize: sizes.title, fontWeight: "700" },
  fallbackText: { color: colors.muted, fontSize: sizes.body, lineHeight: 24, maxWidth: 720 },
  overlay: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: space.md,
  },
  overlayText: { gap: space.xs },
  title: { color: colors.text, fontSize: sizes.heading, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: sizes.small },
  controls: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  errorArea: { padding: space.lg, borderRadius: radius.card },
});
