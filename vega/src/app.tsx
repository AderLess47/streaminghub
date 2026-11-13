import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { AccountInfo, Channel, EpgProgramme, Reminder, Settings } from "./model/types";
import { DEFAULT_SETTINGS, EMPTY_EPG, EMPTY_PLAYLIST } from "./model/types";
import { StreamingHubApi, StreamingHubApiError } from "./data/api";
import { demoPlaylist, demoProgrammes, DEMO_SOURCE_LABEL } from "./data/demo-library";
import { loadEpgFromUrl } from "./data/epg";
import { parseM3u } from "./data/m3u";
import { logError, logEvent, recordDeviceInfo } from "./data/diagnostics";
// Trägt Amazons Shaka-Player ein, sofern er im Projekt liegt (siehe README).
import "./player/shaka-registration";
import { limitFor, loadPlaylistFromUrl, shouldApplyManaged } from "./data/playlist";
import {
  clearActivationToken,
  clearPlaylist,
  clearProgress,
  loadActivationToken,
  loadDeviceName,
  loadEpg,
  loadFavorites,
  loadPlaylist,
  loadProgress,
  loadSettings,
  saveActivationToken,
  saveDeviceName,
  saveEpg,
  saveFavorites,
  savePlaylist,
  saveProgress as persistProgress,
  saveSettings,
  type ProgressMap,
} from "./data/storage";
import { PremiumPurchaseController, unavailableBilling } from "./billing/premium";
import { ReminderService } from "./reminder/reminders";
import { SMOKE_HLS_URL } from "./smoke";
import { useLayoutProfile } from "./ui/layout";
import { Badge, Button, Notice } from "./ui/components";
import { colors, space, text as sizes } from "./ui/theme";
import { BrowseScreen } from "./ui/screens/BrowseScreen";
import { GuideScreen } from "./ui/screens/GuideScreen";
import { PairingScreen } from "./ui/screens/PairingScreen";
import { PlayerScreen } from "./ui/screens/PlayerScreen";
import { SearchScreen } from "./ui/screens/SearchScreen";
import { SettingsScreen } from "./ui/screens/SettingsScreen";

const APP_VERSION = "1.0.0";

/** Wie in der Android-App: Cache nach 15 Minuten im Hintergrund auffrischen. */
const STALE_PLAYLIST_MS = 15 * 60_000;
const TABS = [
  { id: "start", label: "Start" },
  { id: "live", label: "Live" },
  { id: "movies", label: "Filme" },
  { id: "series", label: "Serien" },
  { id: "guide", label: "Programm" },
  { id: "search", label: "Suche" },
  { id: "settings", label: "Einstellungen" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function App() {
  const layout = useLayoutProfile();
  const api = useMemo(() => new StreamingHubApi(), []);
  const reminders = useMemo(() => new ReminderService(), []);
  const premium = useMemo(
    () =>
      new PremiumPurchaseController({
        billing: unavailableBilling,
        submitReceipt: async () => ({ premiumActive: false, message: "Kein Store-Kauf in dieser Version." }),
        refreshSubscription: async () => {
          const current = await loadActivationToken();
          if (!current) return { premiumActive: false, message: "Gerät ist nicht gekoppelt." };
          const account = await api.me(current);
          return {
            premiumActive: account.premiumActive,
            currentPeriodEnd: account.currentPeriodEnd,
            message: "Kein aktives Premium-Abo gefunden.",
          };
        },
      }),
    [api],
  );

  const [booted, setBooted] = useState(false);
  const [tab, setTab] = useState<TabId>("start");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [sourceLabel, setSourceLabel] = useState("");
  const [playlistUpdatedAt, setPlaylistUpdatedAt] = useState<number | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [programmes, setProgrammes] = useState<EpgProgramme[]>([]);
  const [epgUpdatedAt, setEpgUpdatedAt] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<ProgressMap>({});
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [token, setToken] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [deviceName, setDeviceName] = useState("Vega-Gerät");
  const [playing, setPlaying] = useState<Channel | null>(null);
  const [pairing, setPairing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reminderList, setReminderList] = useState<Reminder[]>([]);
  const [premiumState, setPremiumState] = useState(premium.getState());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const appliedManagedUrl = useRef<string | null>(null);

  /* --------------------------------- Start --------------------------------- */

  useEffect(() => {
    void recordDeviceInfo();
    let cancelled = false;
    void (async () => {
      const [storedPlaylist, storedEpg, storedFavorites, storedProgress, storedSettings, storedToken, storedName] =
        await Promise.all([
          loadPlaylist(),
          loadEpg(),
          loadFavorites(),
          loadProgress(),
          loadSettings(),
          loadActivationToken(),
          loadDeviceName(),
        ]);
      if (cancelled) return;

      setFavorites(new Set(storedFavorites));
      setProgress(storedProgress);
      setSettings(storedSettings);
      setToken(storedToken);
      setDeviceName(storedName ?? "Vega-Gerät");
      setReminderList(await reminders.load());

      if (storedSettings.demoMode) {
        const demo = parseM3u(demoPlaylist);
        setChannels(limitFor(demo, storedSettings.lowSpec));
        setSourceLabel(DEMO_SOURCE_LABEL);
        setSourceUrl(null);
        setProgrammes(demoProgrammes(Date.now()));
      } else {
        setChannels(limitFor(storedPlaylist.channels, storedSettings.lowSpec));
        setSourceLabel(storedPlaylist.sourceLabel);
        setSourceUrl(storedPlaylist.sourceUrl);
        setPlaylistUpdatedAt(storedPlaylist.updatedAt);
        setProgrammes(storedEpg.programmes.length > 0 ? storedEpg.programmes : EMPTY_EPG.programmes);
        setEpgUpdatedAt(storedEpg.updatedAt);
      }
      setBooted(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [reminders]);

  // Smoke-Test: `scripts/verify-shaka.mjs` schreibt vor dem Build eine HLS-URL
  // in `src/smoke.ts`. Dann öffnet die App sie sofort und schreibt den Verlauf
  // in die Geräte-Logs, damit ein Prüflauf ohne Fernbedienung auskommt.
  useEffect(() => {
    if (!booted || !SMOKE_HLS_URL) return;
    console.log(`StreamingHub smoke: start ${SMOKE_HLS_URL}`);
    setPlaying({ name: "HLS-Smoke-Test", url: SMOKE_HLS_URL, group: "Test", kind: "live" });
  }, [booted]);

  // Wie in der Android-App: Ist der lokale Stand älter als 15 Minuten, wird die
  // hinterlegte URL im Hintergrund neu geladen. Fehler bleiben still – der
  // gespeicherte Stand ist weiter nutzbar –, landen aber im Protokoll.
  useEffect(() => {
    if (!booted || !sourceUrl || settings.demoMode) return;
    if (Date.now() - (playlistUpdatedAt ?? 0) < STALE_PLAYLIST_MS) return;
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await loadPlaylistFromUrl(sourceUrl, sourceLabel || "Playlist-URL");
        if (cancelled) return;
        setChannels(limitFor(loaded.channels, settings.lowSpec));
        setSourceLabel(loaded.sourceLabel);
        setPlaylistUpdatedAt(loaded.updatedAt);
        await savePlaylist(loaded);
        void logEvent("playlist", "Cache im Hintergrund aufgefrischt.");
      } catch (reason) {
        void logEvent("playlist", "Hintergrund-Aktualisierung fehlgeschlagen.", "warn", String(reason));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [booted, playlistUpdatedAt, settings.demoMode, settings.lowSpec, sourceLabel, sourceUrl]);

  useEffect(() => premium.subscribe(setPremiumState), [premium]);

  // Der Programmführer soll mitlaufen, ohne die Wiedergabe zu stören.
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!booted) return;
    const stop = reminders.startWatcher((reminder) => {
      setNotice(`Jetzt: ${reminder.title} auf ${reminder.channelName}`);
    });
    return stop;
  }, [booted, reminders]);

  /* -------------------------------- Konto ---------------------------------- */

  const reportError = useCallback((area: string, message: string, reason?: unknown) => {
    setError(message);
    void logError(area, reason ?? message);
  }, []);

  const refreshAccount = useCallback(
    async (activeToken: string | null = token) => {
      if (!activeToken) {
        setAccount(null);
        return;
      }
      try {
        const info = await api.me(activeToken);
        setAccount(info);

        // Eine vom Admin hinterlegte Quelle übernimmt die App nur, wenn sie sich
        // von der lokalen unterscheidet – und nur einmal je Sitzung.
        const managedUrl = info.playlist?.url;
        const current = { channels, sourceUrl, sourceLabel, updatedAt: playlistUpdatedAt };
        if (managedUrl && shouldApplyManaged(managedUrl, current) && appliedManagedUrl.current !== managedUrl) {
          appliedManagedUrl.current = managedUrl;
          setBusy("managed");
          try {
            const loaded = await loadPlaylistFromUrl(managedUrl, "Vom Konto hinterlegt");
            setChannels(limitFor(loaded.channels, settings.lowSpec));
            setSourceLabel(loaded.sourceLabel);
            setSourceUrl(loaded.sourceUrl);
            setPlaylistUpdatedAt(loaded.updatedAt);
            await savePlaylist(loaded);
            setNotice("Die im Konto hinterlegte Playlist wurde geladen.");
          } catch (reason) {
            reportError(
              "playlist",
              reason instanceof Error ? reason.message : "Die hinterlegte Playlist konnte nicht geladen werden.",
              reason,
            );
          } finally {
            setBusy(null);
          }
        }
      } catch (reason) {
        if (reason instanceof StreamingHubApiError && (reason.status === 403 || reason.status === 401)) {
          await clearActivationToken();
          setToken(null);
          setAccount(null);
          reportError("account", reason.message, reason);
          return;
        }
        reportError(
          "account",
          reason instanceof Error ? reason.message : "Der Kontostatus konnte nicht geladen werden.",
          reason,
        );
      }
    },
    [api, channels, playlistUpdatedAt, reportError, settings.lowSpec, sourceLabel, sourceUrl, token],
  );

  useEffect(() => {
    if (!booted || !token) return;
    void refreshAccount(token);
    void premium.load();
  }, [booted, token, refreshAccount, premium]);

  /* ------------------------------- Aktionen -------------------------------- */

  const openChannel = useCallback((channel: Channel) => {
    setPlaying(channel);
    setNotice(null);
  }, []);

  const toggleFavorite = useCallback(async (url: string) => {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      void saveFavorites([...next]);
      return next;
    });
  }, []);

  const handleProgress = useCallback(
    (channel: Channel, positionMs: number, durationMs: number) => {
      void persistProgress(channel.url, positionMs, durationMs).then(async () => {
        setProgress(await loadProgress());
      });
      if (token && account?.premiumActive) {
        void api.saveWatchProgress(token, channel.url, positionMs, durationMs).catch(() => {
          // Fortsetzen auf anderen Geräten ist ein Zusatz; lokal ist der Stand sicher.
        });
      }
    },
    [account?.premiumActive, api, token],
  );

  const importPlaylist = useCallback(
    async (url: string) => {
      setBusy("playlist");
      setError(null);
      try {
        const loaded = await loadPlaylistFromUrl(url.trim());
        setChannels(limitFor(loaded.channels, settings.lowSpec));
        setSourceLabel(loaded.sourceLabel);
        setSourceUrl(loaded.sourceUrl);
        setPlaylistUpdatedAt(loaded.updatedAt);
        setSettings((current) => ({ ...current, demoMode: false }));
        await savePlaylist(loaded);
        await saveSettings({ ...settings, demoMode: false });
        appliedManagedUrl.current = null;
        setNotice(`${loaded.channels.length} Einträge geladen.`);
        void logEvent("playlist", `${loaded.channels.length} Einträge aus der URL geladen.`);
      } catch (reason) {
        void logError("playlist", reason, "Import per URL");
        throw reason;
      } finally {
        setBusy(null);
      }
    },
    [settings],
  );

  const loadDemo = useCallback(async () => {
    const demo = parseM3u(demoPlaylist);
    setChannels(limitFor(demo, settings.lowSpec));
    setSourceLabel(DEMO_SOURCE_LABEL);
    setSourceUrl(null);
    setPlaylistUpdatedAt(Date.now());
    setProgrammes(demoProgrammes(Date.now()));
    const next = { ...settings, demoMode: true };
    setSettings(next);
    await saveSettings(next);
    setNotice("Demo-Inhalte geladen: öffentliche Teststreams, keine echten Sender.");
  }, [settings]);

  const removePlaylist = useCallback(async () => {
    await clearPlaylist();
    setChannels([]);
    setSourceLabel("");
    setSourceUrl(null);
    setPlaylistUpdatedAt(null);
    setFavorites(new Set());
    setProgress({});
    setSettings((current) => ({ ...current, demoMode: false }));
    await saveSettings({ ...settings, demoMode: false });
    setNotice("Playlist entfernt.");
  }, [settings]);

  const importEpg = useCallback(async (url: string) => {
    setBusy("epg");
    setError(null);
    try {
      const loaded = await loadEpgFromUrl(url.trim());
      setProgrammes(loaded.programmes);
      setEpgUpdatedAt(loaded.updatedAt);
      await saveEpg(loaded);
      setNotice(`${loaded.programmes.length} Sendungen geladen.`);
      void logEvent("epg", `${loaded.programmes.length} Sendungen aus der URL geladen.`);
    } catch (reason) {
      void logError("epg", reason, "Import per URL");
      throw reason;
    } finally {
      setBusy(null);
    }
  }, []);

  const removeEpg = useCallback(async () => {
    setProgrammes([]);
    setEpgUpdatedAt(null);
    await saveEpg(EMPTY_EPG);
    setNotice("Programmdaten entfernt.");
  }, []);

  const toggleLowSpec = useCallback(async () => {
    const next = { ...settings, lowSpec: !settings.lowSpec };
    setSettings(next);
    await saveSettings(next);
    setChannels((current) => limitFor(current, next.lowSpec));
  }, [settings]);

  const clearProgressPoints = useCallback(async () => {
    await clearProgress();
    setProgress({});
    setNotice("Wiedergabestand gelöscht.");
  }, []);

  const unpair = useCallback(async () => {
    await clearActivationToken();
    setToken(null);
    setAccount(null);
    setNotice("Kopplung aufgehoben. Die Playlist bleibt auf dem Gerät.");
  }, []);

  const activated = useCallback(async (newToken: string) => {
    await saveActivationToken(newToken);
    setToken(newToken);
    setPairing(false);
    setNotice("Gerät gekoppelt.");
  }, []);

  const toggleReminder = useCallback(
    async (programme: EpgProgramme) => {
      const next = await reminders.toggle(programme, Date.now());
      setReminderList(next);
      setNotice(
        reminders.has(programme)
          ? `Erinnerung für „${programme.title}“ vorgemerkt.`
          : `Erinnerung für „${programme.title}“ entfernt.`,
      );
    },
    [reminders],
  );

  /* -------------------------------- Ansicht --------------------------------- */

  if (playing) {
    return (
      <PlayerScreen
        channel={playing}
        resumeMs={progress[playing.url] ?? 0}
        onClose={() => setPlaying(null)}
        onProgress={(positionMs, durationMs) => handleProgress(playing, positionMs, durationMs)}
      />
    );
  }

  if (!booted) {
    return (
      <View style={styles.boot}>
        <Text style={styles.bootText}>StreamingHub wird vorbereitet …</Text>
      </View>
    );
  }

  if (pairing) {
    return (
      <View style={styles.root}>
        <PairingScreen
          api={api}
          deviceName={deviceName}
          appVersion={APP_VERSION}
          onActivated={(newToken) => void activated(newToken)}
          onCancel={() => setPairing(false)}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.brand}>
          <Text style={styles.brandText}>
            Streaming<Text style={styles.brandAccent}>Hub</Text>
          </Text>
          <Text style={styles.brandHint}>{sourceLabel || "Keine Quelle"}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {TABS.map((entry) => (
            <View key={entry.id} style={styles.tabItem}>
              <Button
                label={entry.label}
                variant={tab === entry.id ? "primary" : "ghost"}
                onPress={() => setTab(entry.id)}
                hasTVPreferredFocus={entry.id === "start"}
              />
            </View>
          ))}
        </ScrollView>
        <View style={styles.status}>
          <Badge label={account?.premiumActive ? "Premium" : "Basis"} tone={account?.premiumActive ? "ok" : "neutral"} />
          <Badge label={`${channels.length} Einträge`} />
        </View>
      </View>

      {notice ? (
        <View style={styles.noticeArea}>
          <Notice tone="info" title="Hinweis">
            {notice}
          </Notice>
        </View>
      ) : null}
      {error ? (
        <View style={styles.noticeArea}>
          <Notice tone="error" title="Fehler">
            {error}
          </Notice>
        </View>
      ) : null}

      <View style={styles.body}>
        {tab === "start" ? (
          <BrowseScreen
            heading="Start"
            description="Deine eigenen Quellen, gruppiert wie in der Playlist. Favoriten und Fortschritt bleiben auf dem Gerät."
            channels={channels}
            progress={progress}
            favorites={favorites}
            layout={layout}
            onOpen={openChannel}
            onToggleFavorite={(url) => void toggleFavorite(url)}
          />
        ) : null}
        {tab === "live" ? (
          <BrowseScreen
            heading="Live-TV"
            kind="live"
            channels={channels}
            progress={progress}
            favorites={favorites}
            layout={layout}
            onOpen={openChannel}
            onToggleFavorite={(url) => void toggleFavorite(url)}
            emptyHint="In deiner Playlist wurden keine Live-Einträge erkannt."
          />
        ) : null}
        {tab === "movies" ? (
          <BrowseScreen
            heading="Filme"
            kind="movie"
            channels={channels}
            progress={progress}
            favorites={favorites}
            layout={layout}
            onOpen={openChannel}
            onToggleFavorite={(url) => void toggleFavorite(url)}
            emptyHint="In deiner Playlist wurden keine Filme erkannt."
          />
        ) : null}
        {tab === "series" ? (
          <BrowseScreen
            heading="Serien"
            kind="series"
            channels={channels}
            progress={progress}
            favorites={favorites}
            layout={layout}
            onOpen={openChannel}
            onToggleFavorite={(url) => void toggleFavorite(url)}
            emptyHint="In deiner Playlist wurden keine Serien erkannt."
          />
        ) : null}
        {tab === "guide" ? (
          <GuideScreen
            channels={channels}
            programmes={programmes}
            reminders={reminderList}
            nowMs={nowMs}
            updatedAt={epgUpdatedAt}
            onOpen={openChannel}
            onToggleReminder={(programme) => void toggleReminder(programme)}
          />
        ) : null}
        {tab === "search" ? <SearchScreen channels={channels} layout={layout} onOpen={openChannel} /> : null}
        {tab === "settings" ? (
          <SettingsScreen
            account={account}
            paired={Boolean(token)}
            deviceName={account?.deviceName ?? deviceName}
            settings={settings}
            playlistLabel={sourceLabel}
            playlistCount={channels.length}
            playlistUpdatedAt={playlistUpdatedAt}
            epgCount={programmes.length}
            epgUpdatedAt={epgUpdatedAt}
            premium={premiumState}
            busy={busy}
            onImportPlaylist={importPlaylist}
            onLoadDemo={loadDemo}
            onRemovePlaylist={removePlaylist}
            onImportEpg={importEpg}
            onRemoveEpg={removeEpg}
            onToggleLowSpec={toggleLowSpec}
            onClearProgress={clearProgressPoints}
            onUnpair={unpair}
            onRefreshAccount={() => refreshAccount()}
            onPair={() => setPairing(true)}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  boot: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  bootText: { color: colors.muted, fontSize: sizes.body },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  brand: { gap: 2 },
  brandText: { color: colors.text, fontSize: sizes.heading, fontWeight: "800" },
  brandAccent: { color: "#7dd3fc" },
  brandHint: { color: colors.muted, fontSize: sizes.tiny, maxWidth: 180 },
  tabs: { gap: space.xs, paddingVertical: 2 },
  tabItem: {},
  status: { marginLeft: "auto", flexDirection: "row", gap: space.xs },
  noticeArea: { paddingHorizontal: space.xl, paddingTop: space.md },
  body: { flex: 1 },
});
