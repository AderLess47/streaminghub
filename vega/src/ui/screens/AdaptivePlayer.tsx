import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { KeplerVideoSurfaceView } from "@amazon-devices/react-native-w3cmedia";
import type { Channel } from "../../model/types";
import { createHlsAdapter, hasHlsAdapter, type HlsAdapter } from "../../player/hls";
import { insecureTransportHint } from "../../data/transport";
import { Button, Notice } from "../components";
import { colors, radius, space, text as sizes } from "../theme";

/**
 * Wiedergabe adaptiver Quellen (HLS/DASH).
 *
 * Der W3C-Player im URL-Modus kann keine Manifeste lesen. Deshalb bekommt die
 * Oberfläche hier eine eigene Surface: `KeplerVideoSurfaceView` meldet beim
 * Einhängen einen Handle, den der Shaka-Adapter dem `VideoPlayer` zuweist,
 * bevor er das Manifest lädt.
 *
 * Fehlt der Shaka-Player, bleibt es bei einer Erklärung – kein schwarzes Bild
 * und kein vorgetäuschtes „lädt“.
 */

type Props = {
  channel: Channel;
  resumeMs: number;
  onClose: () => void;
  onProgress: (positionMs: number, durationMs: number) => void;
};

export function AdaptivePlayer({ channel, resumeMs, onClose, onProgress }: Props) {
  const adapterRef = useRef<HlsAdapter | null>(null);
  const startedRef = useRef(false);
  const progressRef = useRef(onProgress);
  const [available] = useState(() => hasHlsAdapter());
  const [status, setStatus] = useState("Player wird vorbereitet …");
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    progressRef.current = onProgress;
  }, [onProgress]);

  // Ein Adapter je Surface: Nach einem Neuaufbau der Oberfläche muss ein
  // frischer Player her, der alte wird vorher freigegeben.
  function makeAdapter(): HlsAdapter | null {
    return createHlsAdapter({
      onStatus: setStatus,
      onError: setError,
      onPausedChange: setPaused,
      onProgress: (positionMs, durationMs) => progressRef.current(positionMs, durationMs),
    });
  }

  useEffect(() => {
    if (!available) return;
    const adapter = makeAdapter();
    adapterRef.current = adapter;
    return () => {
      adapterRef.current = null;
      startedRef.current = false;
      void adapter?.destroy();
    };
    // makeAdapter hängt nur an stabilen Settern und einem Ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available]);

  function startPlayback(surfaceHandle: string) {
    const adapter = adapterRef.current;
    if (!adapter || startedRef.current) return;
    startedRef.current = true;
    void adapter.start(surfaceHandle, channel.url, resumeMs);
  }

  if (!available) {
    return (
      <View style={styles.root}>
        <View style={styles.fallback}>
          <Text style={styles.fallbackTitle}>HLS braucht den Shaka-Player</Text>
          <Text style={styles.fallbackText}>
            Diese Quelle ist ein Manifest. Vega OS spielt sie nur im MSE-Modus mit einem
            JavaScript-Player. Der gepatchte Shaka-Player von Amazon ist in diesem Build nicht
            eingebunden; `scripts/setup-shaka.mjs` holt ihn aus Amazons Download (siehe README,
            Abschnitt „HLS und DASH“). Progressive Dateien wie MP4 laufen ohne diesen Schritt.
          </Text>
          <Button label="Zurück" onPress={onClose} variant="ghost" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.surface}>
        <KeplerVideoSurfaceView
          style={styles.video}
          onSurfaceViewCreated={startPlayback}
          onSurfaceViewDestroyed={() => {
            const previous = adapterRef.current;
            adapterRef.current = null;
            startedRef.current = false;
            void previous?.destroy();
            if (available) adapterRef.current = makeAdapter();
          }}
        />
      </View>

      <View style={styles.overlay}>
        <View style={styles.overlayText}>
          <Text style={styles.title} numberOfLines={1}>
            {channel.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {channel.group} · {status}
          </Text>
          {insecureTransportHint(channel.url) ? (
            <Text style={styles.meta} numberOfLines={2}>
              {insecureTransportHint(channel.url)}
            </Text>
          ) : null}
        </View>
        <View style={styles.controls}>
          <Button
            label={paused ? "Abspielen" : "Pause"}
            onPress={() => adapterRef.current?.togglePlayback()}
            hasTVPreferredFocus
          />
          <Button label="−10 s" onPress={() => adapterRef.current?.seekBy(-10)} variant="ghost" />
          <Button label="+10 s" onPress={() => adapterRef.current?.seekBy(10)} variant="ghost" />
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
  fallback: { flex: 1, padding: space.xl, gap: space.md, justifyContent: "center" },
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
