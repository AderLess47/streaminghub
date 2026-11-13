import { useEffect, useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { AccountInfo, Settings } from "../../model/types";
import type { PremiumBillingState } from "../../billing/premium";
import { clearLog, logError, logSummary, readLogText, type LogSummary } from "../../data/diagnostics";
import { formatDateTime } from "../../data/epg";
import { insecureTransportHint } from "../../data/transport";
import { Badge, Button, Card, Notice, SectionTitle } from "../components";
import { colors, radius, space, text as sizes } from "../theme";

type Props = {
  account: AccountInfo | null;
  paired: boolean;
  deviceName: string;
  settings: Settings;
  playlistLabel: string;
  playlistSourceUrl: string | null;
  playlistCount: number;
  playlistUpdatedAt: number | null;
  epgCount: number;
  epgUpdatedAt: number | null;
  premium: PremiumBillingState;
  busy: string | null;
  onImportPlaylist: (url: string) => Promise<void>;
  onLoadDemo: () => Promise<void>;
  onRemovePlaylist: () => Promise<void>;
  onImportEpg: (url: string) => Promise<void>;
  onRemoveEpg: () => Promise<void>;
  onToggleLowSpec: () => Promise<void>;
  onToggleSecurePlayback: () => Promise<void>;
  onClearProgress: () => Promise<void>;
  onUnpair: () => Promise<void>;
  onRefreshAccount: () => Promise<void>;
  onPair: () => void;
};

export function SettingsScreen(props: Props) {
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [epgUrl, setEpgUrl] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [logInfo, setLogInfo] = useState<LogSummary | null>(null);
  const [logText, setLogText] = useState<string | null>(null);
  const { busy } = props;
  const playlistHint = insecureTransportHint(props.playlistSourceUrl);

  useEffect(() => {
    void logSummary().then(setLogInfo);
  }, []);

  async function run(action: () => Promise<void>) {
    setLocalError(null);
    try {
      await action();
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : "Der Vorgang ist fehlgeschlagen.");
      void logError("settings", reason);
    }
  }

  async function openSite(path: string) {
    const url = `https://streaminghub.org${path}`;
    try {
      await Linking.openURL(url);
    } catch {
      setLocalError(`Der Browser konnte nicht geöffnet werden. Die Adresse lautet ${url}`);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.heading} accessibilityRole="header">
        Einstellungen
      </Text>
      <Text style={styles.description}>
        StreamingHub stellt keine Sender, Filme oder Playlists bereit. Du importierst ausschließlich deine
        eigenen, rechtmäßig zugänglichen Quellen.
      </Text>

      {localError ? (
        <Notice tone="error" title="Nicht ausgeführt">
          {localError}
        </Notice>
      ) : null}

      <SectionTitle hint={props.paired ? "Gerät ist gekoppelt" : "Ohne Konto nutzbar"}>Konto</SectionTitle>
      <Card style={styles.card}>
        <View style={styles.badges}>
          <Badge label={props.paired ? "Gekoppelt" : "Nicht gekoppelt"} tone={props.paired ? "ok" : "neutral"} />
          <Badge
            label={props.account?.premiumActive ? "Premium aktiv" : "Kein Premium"}
            tone={props.account?.premiumActive ? "ok" : "neutral"}
          />
        </View>
        <Text style={styles.row}>Gerät: {props.deviceName}</Text>
        {props.account ? (
          <>
            <Text style={styles.row}>Konto: {props.account.email}</Text>
            <Text style={styles.muted}>
              Abo: {props.account.subscriptionStatus} · Kanal {props.account.channel} · bis{" "}
              {formatDateTime(props.account.currentPeriodEnd)}
            </Text>
          </>
        ) : (
          <Text style={styles.muted}>
            Ohne Kopplung bleiben Playlist, Programmdaten und Fortschritt ausschließlich auf diesem Gerät.
          </Text>
        )}
        <View style={styles.actions}>
          {props.paired ? (
            <>
              <Button label="Status aktualisieren" onPress={() => void run(props.onRefreshAccount)} variant="ghost" />
              <Button label="Kopplung aufheben" onPress={() => void run(props.onUnpair)} variant="danger" />
            </>
          ) : (
            <Button label="Gerät koppeln" onPress={props.onPair} />
          )}
        </View>
      </Card>

      <SectionTitle hint="Kauf läuft über den Amazon Appstore">Premium</SectionTitle>
      <Card style={styles.card}>
        <Text style={styles.row}>{premiumText(props.premium)}</Text>
        <Text style={styles.muted}>
          Premium wird in dieser App-Version nicht über einen Weblink verkauft: In einem Appstore-Build sind
          externe Zahlungsaufforderungen nicht zulässig. Der Abo-Status kommt bestätigt vom Server.
        </Text>
        <View style={styles.actions}>
          <Button label="Abo-Status prüfen" onPress={() => void run(props.onRefreshAccount)} variant="ghost" />
        </View>
      </Card>

      <SectionTitle hint={`${props.playlistCount} Einträge`}>Playlist</SectionTitle>
      <Card style={styles.card}>
        <Text style={styles.row}>
          {props.playlistLabel ? `Quelle: ${props.playlistLabel}` : "Keine eigene Playlist geladen"}
        </Text>
        {playlistHint ? (
          <Notice tone="warning" title="Unverschlüsselte Playlist">
            {playlistHint}
          </Notice>
        ) : null}
        {props.playlistUpdatedAt ? (
          <Text style={styles.muted}>Zuletzt geladen: {new Date(props.playlistUpdatedAt).toLocaleString("de-DE")}</Text>
        ) : null}
        <TextInput
          value={playlistUrl}
          onChangeText={setPlaylistUrl}
          placeholder="https://anbieter.example/playlist.m3u"
          placeholderTextColor={colors.muted}
          style={styles.input}
          accessibilityLabel="Adresse der M3U-Playlist"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <View style={styles.actions}>
          <Button
            label={busy === "playlist" ? "Lädt …" : "Playlist laden"}
            onPress={() => void run(() => props.onImportPlaylist(playlistUrl))}
            disabled={busy === "playlist" || playlistUrl.trim().length < 8}
          />
          <Button label="Demo-Inhalte" onPress={() => void run(props.onLoadDemo)} variant="ghost" />
          <Button
            label="Playlist entfernen"
            onPress={() => void run(props.onRemovePlaylist)}
            variant="danger"
            disabled={props.playlistCount === 0}
          />
        </View>
      </Card>

      <SectionTitle hint={`${props.epgCount} Sendungen`}>Programmdaten</SectionTitle>
      <Card style={styles.card}>
        <Text style={styles.row}>
          {props.epgCount > 0 ? "XMLTV geladen" : "Keine Programmdaten"}
          {props.epgUpdatedAt ? ` · ${new Date(props.epgUpdatedAt).toLocaleString("de-DE")}` : ""}
        </Text>
        <TextInput
          value={epgUrl}
          onChangeText={setEpgUrl}
          placeholder="https://anbieter.example/epg.xml"
          placeholderTextColor={colors.muted}
          style={styles.input}
          accessibilityLabel="Adresse der XMLTV-Datei"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <View style={styles.actions}>
          <Button
            label={busy === "epg" ? "Lädt …" : "Programmdaten laden"}
            onPress={() => void run(() => props.onImportEpg(epgUrl))}
            disabled={busy === "epg" || epgUrl.trim().length < 8}
          />
          <Button
            label="Programmdaten entfernen"
            onPress={() => void run(props.onRemoveEpg)}
            variant="danger"
            disabled={props.epgCount === 0}
          />
        </View>
      </Card>

      <SectionTitle hint="Für schwächere Geräte">Darstellung</SectionTitle>
      <Card style={styles.card}>
        <Text style={styles.row}>Low-Spec-Modus: {props.settings.lowSpec ? "an" : "aus"}</Text>
        <Text style={styles.muted}>
          Kürzt lange Listen auf 600 Einträge, lädt keine Logos und hält den Speicherbedarf klein.
        </Text>
        <View style={styles.actions}>
          <Button
            label={props.settings.lowSpec ? "Low-Spec ausschalten" : "Low-Spec einschalten"}
            onPress={() => void run(props.onToggleLowSpec)}
            variant="ghost"
          />
        </View>
      </Card>

      <SectionTitle hint="Nur für DRM-Sender">Wiedergabe</SectionTitle>
      <Card style={styles.card}>
        <Text style={styles.row}>Secure Buffers: {props.settings.securePlayback ? "an" : "aus"}</Text>
        <Text style={styles.muted}>
          Schickt entschlüsseltes Bild nur in den geschützten Pfad (Widevine L1, PlayReady SL3000). Wirkt ausschließlich
          auf Sender, deren Playlist DRM-Angaben enthält; unverschlüsselte Sender bleiben unverändert. Standardmäßig
          aus, weil es auf Geräten ohne L1-Unterstützung die Wiedergabe verhindern kann.
        </Text>
        <View style={styles.actions}>
          <Button
            label={props.settings.securePlayback ? "Secure Buffers ausschalten" : "Secure Buffers einschalten"}
            onPress={() => void run(props.onToggleSecurePlayback)}
            variant="ghost"
          />
        </View>
      </Card>

      <SectionTitle hint="Öffnet streaminghub.org">Rechtliches und Konto</SectionTitle>
      <Card style={styles.card}>
        <Text style={styles.muted}>
          Datenschutz, Impressum und die öffentliche Kontolöschung liegen auf der Website und funktionieren auch
          ohne Anmeldung in der App.
        </Text>
        <View style={styles.actions}>
          <Button label="Datenschutz" variant="ghost" onPress={() => void openSite("/privacy")} />
          <Button label="Impressum" variant="ghost" onPress={() => void openSite("/imprint")} />
          <Button label="Konto löschen" variant="ghost" onPress={() => void openSite("/account-deletion")} />
        </View>
      </Card>

      <SectionTitle hint="Bleibt auf diesem Gerät">Diagnose</SectionTitle>
      <Card style={styles.card}>
        <Text style={styles.row}>
          {logInfo
            ? `${logInfo.entries} Einträge, ${Math.max(1, Math.round(logInfo.chars / 1024))} KB`
            : "Protokoll wird gelesen …"}
        </Text>
        <Text style={styles.muted}>
          Fehler und Gerätedaten für die Fehlersuche: Zeitpunkt, Stufe, Bereich, Meldung, Modell, Systemstand,
          Bildschirm und Sprache. Keine Tokens, keine E-Mail-Adressen, Playlist-Adressen ohne Zugangsdaten und
          ohne Query. Nichts wird automatisch übertragen.
        </Text>
        <View style={styles.actions}>
          <Button
            label={logText ? "Protokoll ausblenden" : "Protokoll anzeigen"}
            variant="ghost"
            onPress={() => {
              if (logText) {
                setLogText(null);
                return;
              }
              void readLogText().then((text) => setLogText(text.length > 0 ? text : "Noch keine Einträge."));
            }}
          />
          <Button
            label="Protokoll löschen"
            variant="danger"
            onPress={() =>
              void run(async () => {
                await clearLog();
                setLogText(null);
                setLogInfo(await logSummary());
              })
            }
          />
        </View>
        {logText ? (
          <Text style={styles.log} selectable>
            {logText}
          </Text>
        ) : null}
      </Card>

      <SectionTitle hint="Unwiderruflich">Daten auf diesem Gerät</SectionTitle>
      <Card style={styles.card}>
        <Text style={styles.muted}>
          Wiedergabestände liegen lokal. Das Löschen entfernt nur die Fortsetzungspunkte, nicht die Playlist.
        </Text>
        <View style={styles.actions}>
          <Button label="Wiedergabestand löschen" onPress={() => void run(props.onClearProgress)} variant="danger" />
        </View>
      </Card>
    </ScrollView>
  );
}

function premiumText(state: PremiumBillingState): string {
  switch (state.kind) {
    case "loading":
      return "Abo-Status wird geladen …";
    case "unavailable":
      return "In dieser App-Version ist kein Kauf möglich.";
    case "ready":
      return `Kauf möglich${state.displayPrice ? ` für ${state.displayPrice}` : ""}.`;
    case "purchasing":
      return "Kauf läuft …";
    case "pending":
      return "Der Kauf wartet auf die Bestätigung des Stores.";
    case "active":
      return `Premium aktiv${state.currentPeriodEnd ? ` bis ${formatDateTime(state.currentPeriodEnd)}` : ""}.`;
    default:
      return state.message;
  }
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.md, paddingBottom: space.xl * 2, maxWidth: 1000 },
  heading: { color: colors.text, fontSize: sizes.title, fontWeight: "700" },
  description: { color: colors.muted, fontSize: sizes.body, lineHeight: 24 },
  card: { gap: space.sm },
  badges: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  row: { color: colors.text, fontSize: sizes.body },
  muted: { color: colors.muted, fontSize: sizes.small, lineHeight: 20 },
  actions: { flexDirection: "row", gap: space.sm, flexWrap: "wrap", marginTop: space.xs },
  log: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: "monospace",
    backgroundColor: colors.background,
    borderRadius: radius.control,
    padding: space.sm,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    color: colors.text,
    fontSize: sizes.body,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
});
