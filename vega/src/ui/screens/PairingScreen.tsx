import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { PairingCode } from "../../model/types";
import { StreamingHubApi, StreamingHubApiError } from "../../data/api";
import { Button, Card, Notice, SectionTitle } from "../components";
import { colors, space, text as sizes } from "../theme";

type Props = {
  api: StreamingHubApi;
  deviceName: string;
  appVersion: string;
  onActivated: (token: string) => void;
  onCancel: () => void;
};

/**
 * Kopplung nach `docs/API.md`: Code anfordern, höchstens alle drei Sekunden
 * abfragen, bei `expired` aufhören und einen neuen Code anbieten.
 */
export function PairingScreen({ api, deviceName, appVersion, onActivated, onCancel }: Props) {
  const [pairing, setPairing] = useState<PairingCode | null>(null);
  const [status, setStatus] = useState("Code wird angefordert …");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setStatus("Code wird angefordert …");

    api
      .requestPairing(deviceName, "firetv", appVersion)
      .then((code) => {
        if (cancelled) return;
        setPairing(code);
        setStatus("Warte auf Bestätigung im Konto");
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "Der Code konnte nicht angefordert werden.");
        setStatus("Kein Code");
      });

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [api, deviceName, appVersion, attempt]);

  useEffect(() => {
    if (!pairing) return;
    let stopped = false;

    const poll = async () => {
      try {
        const result = await api.pollPairing(pairing.requestId, pairing.pollToken);
        if (stopped) return;
        if (result.status === "claimed" && result.activationToken) {
          setStatus("Gerät gekoppelt");
          onActivated(result.activationToken);
          return;
        }
        if (result.status === "expired") {
          setStatus("Der Code ist abgelaufen");
          setError("Der Code gilt zehn Minuten. Fordere einen neuen an.");
          return;
        }
        setStatus("Warte auf Bestätigung im Konto");
      } catch (reason) {
        if (stopped) return;
        const message =
          reason instanceof StreamingHubApiError && reason.status === 401
            ? "Die Abfrage wurde abgelehnt. Fordere einen neuen Code an."
            : reason instanceof Error
              ? reason.message
              : "Die Abfrage ist fehlgeschlagen.";
        setError(message);
        setStatus("Abfrage angehalten");
        return;
      }
      timer.current = setTimeout(poll, pairing.pollIntervalSeconds * 1000);
    };

    timer.current = setTimeout(poll, pairing.pollIntervalSeconds * 1000);
    return () => {
      stopped = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [api, pairing, onActivated]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.heading} accessibilityRole="header">
        Gerät koppeln
      </Text>
      <Text style={styles.description}>
        Gib den Code auf streaminghub.org/activate ein, während du dort angemeldet bist. Das Gerät wird
        danach deinem Konto zugeordnet; Playlist-Inhalte bleiben auf dem Gerät.
      </Text>

      <Card style={styles.codeCard}>
        <Text style={styles.label}>Dein Code</Text>
        <Text style={styles.code} accessibilityLabel={pairing ? `Code ${pairing.code}` : "Noch kein Code"}>
          {pairing?.code ?? "— — — —"}
        </Text>
        <Text style={styles.status}>{status}</Text>
      </Card>

      {error ? (
        <Notice tone="error" title="Kopplung nicht möglich">
          {error}
        </Notice>
      ) : null}

      <SectionTitle>Weiter</SectionTitle>
      <View style={styles.actions}>
        <Button label="Neuen Code anfordern" onPress={() => setAttempt((value) => value + 1)} />
        <Button label="Zurück" onPress={onCancel} variant="ghost" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.lg, maxWidth: 900 },
  heading: { color: colors.text, fontSize: sizes.title, fontWeight: "700" },
  description: { color: colors.muted, fontSize: sizes.body, lineHeight: 24 },
  codeCard: { alignItems: "center", gap: space.sm, paddingVertical: space.xl },
  label: { color: colors.muted, fontSize: sizes.small, textTransform: "uppercase", letterSpacing: 1 },
  code: { color: colors.text, fontSize: 48, fontWeight: "800", letterSpacing: 6 },
  status: { color: colors.muted, fontSize: sizes.small },
  actions: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
});
