/**
 * Prüft die Plattform-unabhängige Logik der Vega-App unter Node – ohne
 * Virtual Device und ohne React Native. Gebündelt und gestartet von
 * `scripts/headless-check.mjs` (`npm run test:headless`).
 *
 * Geprüft werden die echten Module aus `src/`: Playlist-Parser, XMLTV-Parser,
 * HLS-Nahtstelle und die Speicherschicht. AsyncStorage ersetzt dabei
 * `scripts/mocks/async-storage.ts`, das der Runner per esbuild-Alias einsetzt.
 * Alles, was die W3C-Media-API oder eine Oberfläche braucht, bleibt außen vor;
 * das kann nur ein Gerät zeigen.
 */

import assert from "node:assert/strict";
import { groupsOf, inferKind, parseM3u } from "../src/data/m3u";
import { parseXmltv, parseXmltvTime } from "../src/data/xmltv";
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
  loadReminders,
  loadSettings,
  saveActivationToken,
  saveDeviceName,
  saveEpg,
  saveFavorites,
  savePlaylist,
  saveProgress,
  saveReminders,
  saveSettings,
  shouldStoreProgress,
  type ProgressMap,
} from "../src/data/storage";
import {
  createHlsAdapter,
  hasHlsAdapter,
  isAdaptiveSource,
  registerHlsAdapter,
  type HlsCallbacks,
} from "../src/player/hls";
import memoryStorage from "./mocks/async-storage";

const results: { name: string; ok: boolean; detail?: string }[] = [];

async function check(name: string, run: () => void | Promise<void>): Promise<void> {
  try {
    await run();
    results.push({ name, ok: true });
    console.log(`  \u2713 ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail });
    console.log(`  \u2717 ${name}\n      ${detail.split("\n")[0]}`);
  }
}

const KEY = {
  playlist: "streaminghub.playlist",
  epg: "streaminghub.epg",
  favorites: "streaminghub.favorites",
  progress: "streaminghub.progress",
  settings: "streaminghub.settings",
  token: "streaminghub.token",
  deviceName: "streaminghub.deviceName",
  reminders: "streaminghub.reminders",
};

/* ------------------------------- Playlist -------------------------------- */

const playlist = `#EXTM3U
#EXTINF:-1 tvg-id="ard" tvg-logo="https://example.test/ard.png" group-title="Öffentlich",Das Erste HD
https://example.test/live/ard.m3u8
#EXTINF:-1 group-title="Filme",Beispielfilm
https://example.test/movie/film.mp4
#EXTINF:-1 group-title="Serien",Staffel 1 Folge 2
https://example.test/series/show.m3u8
#EXTINF:-1,Ohne Gruppe
https://example.test/live/other.m3u8
#EXTINF:-1,Sender ohne URL
#EXTGRP:Radio
#EXTINF:-1,Radio Eins
https://example.test/radio/eins.m3u8
https://example.test/live/ard.m3u8
not a url
`;

const channels = parseM3u(playlist);

await check("Playlist: nur Einträge mit URL, Duplikate entfernt", () => {
  assert.equal(channels.length, 5, `erwartet 5, bekommen ${channels.length}`);
});

await check("Playlist: Attribute und Titel werden übernommen", () => {
  const ard = channels[0];
  assert.equal(ard.name, "Das Erste HD");
  assert.equal(ard.group, "Öffentlich");
  assert.equal(ard.logo, "https://example.test/ard.png");
  assert.equal(ard.tvgId, "ard");
});

await check("Playlist: fehlende Gruppe fällt auf #EXTGRP oder Standard zurück", () => {
  assert.equal(channels[3].group, "Ohne Kategorie");
  assert.equal(channels[4].group, "Radio");
});

await check("Playlist: Gruppen in Reihenfolge des ersten Auftretens", () => {
  assert.deepEqual(groupsOf(channels), ["Öffentlich", "Filme", "Serien", "Ohne Kategorie", "Radio"]);
});

await check("Playlist: Art wird aus Name, Gruppe und Endung abgeleitet", () => {
  assert.equal(inferKind("Das Erste HD", "Öffentlich", "https://example.test/live/ard.m3u8"), "live");
  assert.equal(inferKind("Beispielfilm", "Filme", "https://example.test/movie/film.mp4"), "movie");
  assert.equal(inferKind("Staffel 1 Folge 2", "Serien", "https://example.test/x.m3u8"), "series");
  assert.equal(inferKind("Doku", "", "https://example.test/x.m3u8"), "movie");
});

await check("Playlist: leere Eingabe ergibt keine Sender", () => {
  assert.deepEqual(parseM3u(""), []);
});

/* --------------------------------- XMLTV --------------------------------- */

const xmltv = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="ard.de"><display-name>Das Erste</display-name></channel>
  <programme start="20261113120000 +0100" stop="20261113130000 +0100" channel="ard.de">
    <title>Tagesschau</title>
    <desc>Nachrichten</desc>
  </programme>
  <programme start="20261113130000 +0100" stop="20261113140000 +0100" channel="ard.de">
    <title>Mittagsmagazin</title>
  </programme>
  <programme start="20261113140000 +0100" stop="20261113130000 +0100" channel="ard.de">
    <title>Ungültig</title>
  </programme>
</tv>`;

const programmes = parseXmltv(xmltv);

await check("XMLTV: gültige Sendungen, kaputte Zeit und Ende vor Start fliegen raus", () => {
  assert.equal(programmes.length, 2);
  assert.deepEqual(
    programmes.map((programme) => programme.title),
    ["Tagesschau", "Mittagsmagazin"],
  );
  assert.equal(programmes[0].channelName, "Das Erste");
  assert.equal(programmes[0].description, "Nachrichten");
});

await check("XMLTV: Zeitzone wird verrechnet", () => {
  const withZone = parseXmltvTime("20261113120000 +0100");
  const withoutZone = parseXmltvTime("20261113120000");
  assert.equal(withZone, Date.UTC(2026, 10, 13, 11, 0, 0));
  assert.equal(withoutZone, Date.UTC(2026, 10, 13, 12, 0, 0));
});

await check("XMLTV: unsinnige Zeit ergibt null", () => {
  assert.equal(parseXmltvTime("gestern"), null);
  assert.equal(parseXmltvTime(""), null);
});

/* ---------------------------------- HLS ---------------------------------- */

await check("HLS: adaptive Quellen werden erkannt", () => {
  assert.equal(isAdaptiveSource("https://example.test/master.m3u8"), true);
  assert.equal(isAdaptiveSource("https://example.test/manifest.MPD?token=1"), true);
  assert.equal(isAdaptiveSource("https://example.test/film.mp4"), false);
  assert.equal(isAdaptiveSource("rtmp://example.test/live"), false);
});

await check("HLS: ohne Registrierung gibt es keinen Adapter", () => {
  assert.equal(hasHlsAdapter(), false);
  assert.equal(createHlsAdapter(callbacks()), null);
});

await check("HLS: nach der Registrierung entsteht ein Adapter mit Lebenszyklus", () => {
  const created: string[] = [];
  registerHlsAdapter(() => {
    created.push("erzeugt");
    return {
      async start(handle, url) {
        created.push(`start:${handle}:${url}`);
      },
      togglePlayback() {
        created.push("toggle");
      },
      seekBy(seconds) {
        created.push(`seek:${seconds}`);
      },
      async destroy() {
        created.push("destroy");
      },
    };
  });

  assert.equal(hasHlsAdapter(), true);
  const adapter = createHlsAdapter(callbacks());
  assert.ok(adapter, "Adapter fehlt nach der Registrierung");
  void adapter.start("surface-1", "https://example.test/master.m3u8", 0);
  adapter.togglePlayback();
  adapter.seekBy(30);
  void adapter.destroy();
  assert.deepEqual(created, [
    "erzeugt",
    "start:surface-1:https://example.test/master.m3u8",
    "toggle",
    "seek:30",
    "destroy",
  ]);
});

function callbacks(): HlsCallbacks {
  return {
    onStatus: () => undefined,
    onError: () => undefined,
    onPausedChange: () => undefined,
    onProgress: () => undefined,
  };
}

/* ------------------------------ Einstellungen ---------------------------- */

await check("Einstellungen: leerer Speicher liefert die Standardwerte", async () => {
  memoryStorage.__reset();
  assert.deepEqual(await loadSettings(), { lowSpec: false, demoMode: false });
});

await check("Einstellungen: Speichern und Laden erhält beide Schalter", async () => {
  memoryStorage.__reset();
  await saveSettings({ lowSpec: true, demoMode: true });
  assert.deepEqual(await loadSettings(), { lowSpec: true, demoMode: true });
  await saveSettings({ lowSpec: false, demoMode: true });
  assert.deepEqual(await loadSettings(), { lowSpec: false, demoMode: true });
});

await check("Einstellungen: unbekannte Felder und falsche Typen fallen auf Standard zurück", async () => {
  memoryStorage.__reset();
  await memoryStorage.setItem(KEY.settings, JSON.stringify({ lowSpec: "ja", demoMode: 1, theme: "dark" }));
  assert.deepEqual(await loadSettings(), { lowSpec: false, demoMode: false });
});

await check("Einstellungen: kaputtes JSON wird still ignoriert", async () => {
  memoryStorage.__reset();
  await memoryStorage.setItem(KEY.settings, "{kein json");
  assert.deepEqual(await loadSettings(), { lowSpec: false, demoMode: false });
});

/* -------------------------------- Playlist ------------------------------- */

await check("Speicher: Playlist übersteht Speichern und Laden", async () => {
  memoryStorage.__reset();
  const stored = {
    channels: [{ name: "Das Erste", url: "https://example.test/ard.m3u8", group: "Öffentlich", kind: "live" as const }],
    sourceUrl: "https://example.test/liste.m3u",
    sourceLabel: "Meine Liste",
    updatedAt: 1_760_000_000_000,
  };
  await savePlaylist(stored);
  const loaded = await loadPlaylist();
  assert.equal(loaded.channels.length, 1);
  assert.equal(loaded.channels[0].name, "Das Erste");
  assert.equal(loaded.channels[0].url, "https://example.test/ard.m3u8");
  assert.equal(loaded.channels[0].kind, "live");
  assert.equal(loaded.sourceUrl, stored.sourceUrl);
  assert.equal(loaded.sourceLabel, stored.sourceLabel);
  assert.equal(loaded.updatedAt, stored.updatedAt);
});

await check("Speicher: ungültige Sender werden beim Laden aussortiert", async () => {
  memoryStorage.__reset();
  await memoryStorage.setItem(
    KEY.playlist,
    JSON.stringify({
      channels: [
        { name: "   ", url: "https://example.test/a.m3u8" },
        { name: "Ohne URL", url: "   " },
        { name: "Film", url: "https://example.test/film.mp4", kind: "movie" },
        { name: "Serie", url: "https://example.test/serie.m3u8", kind: "serie" },
        { name: "Live", url: "https://example.test/live.m3u8", group: "" },
      ],
      sourceUrl: 7,
    }),
  );
  const loaded = await loadPlaylist();
  assert.deepEqual(
    loaded.channels.map((channel) => channel.name),
    ["Film", "Serie", "Live"],
  );
  assert.equal(loaded.channels[0].kind, "movie");
  assert.equal(loaded.channels[1].kind, "live", "unbekannte Art wird zu live");
  assert.equal(loaded.channels[2].group, "Ohne Kategorie");
  assert.equal(loaded.sourceUrl, null);
  assert.equal(loaded.sourceLabel, "");
  assert.equal(loaded.updatedAt, null);
});

await check("Speicher: gespeichertes null ergibt eine leere Liste statt Absturz", async () => {
  memoryStorage.__reset();
  await memoryStorage.setItem(KEY.playlist, "null");
  assert.deepEqual(await loadPlaylist(), {
    channels: [],
    sourceUrl: null,
    sourceLabel: "",
    updatedAt: null,
  });
  await memoryStorage.setItem(KEY.playlist, JSON.stringify({ channels: "keine Liste" }));
  assert.deepEqual((await loadPlaylist()).channels, []);
});

await check("EPG: gespeichertes null ergibt keine Sendungen", async () => {
  memoryStorage.__reset();
  await memoryStorage.setItem(KEY.epg, "null");
  assert.deepEqual(await loadEpg(), { programmes: [], sourceUrl: null, updatedAt: null });
});

await check("Speicher: Favoriten filtern alles außer Text", async () => {
  memoryStorage.__reset();
  await memoryStorage.setItem(KEY.favorites, JSON.stringify(["https://a", 5, null, "https://b"]));
  assert.deepEqual(await loadFavorites(), ["https://a", "https://b"]);
  await saveFavorites(["https://c"]);
  assert.deepEqual(await loadFavorites(), ["https://c"]);
});

/* --------------------------- Wiedergabestand ----------------------------- */

await check("Fortschritt: nur mittendrin wird gespeichert", () => {
  assert.equal(shouldStoreProgress(30_000, 600_000), true);
  assert.equal(shouldStoreProgress(1_000, 600_000), false, "zu früh");
  assert.equal(shouldStoreProgress(595_000, 600_000), false, "kurz vor Schluss");
  assert.equal(shouldStoreProgress(30_000, 0), false, "Live-Stream ohne Laufzeit");
});

await check("Fortschritt: Speichern, Aktualisieren und Entfernen", async () => {
  memoryStorage.__reset();
  await saveProgress("https://example.test/film.mp4", 30_400, 600_000);
  assert.deepEqual(await loadProgress(), { "https://example.test/film.mp4": 30_400 }, "gerundet");

  await saveProgress("https://example.test/film.mp4", 595_000, 600_000);
  assert.deepEqual(await loadProgress(), {}, "kurz vor Schluss wird der Punkt gelöscht");

  await saveProgress("https://example.test/live.m3u8", 60_000, 0);
  assert.deepEqual(await loadProgress(), {}, "Live ohne Laufzeit speichert nichts");
});

await check("Fortschritt: unsinnige Einträge werden beim Laden verworfen", async () => {
  memoryStorage.__reset();
  await memoryStorage.setItem(KEY.progress, JSON.stringify({ a: -5, b: "12", c: 9_000, d: null }));
  const loaded: ProgressMap = await loadProgress();
  assert.deepEqual(loaded, { c: 9_000 });
});

await check("Fortschritt: Zurücksetzen leert die Karte", async () => {
  memoryStorage.__reset();
  await saveProgress("https://example.test/film.mp4", 30_000, 600_000);
  await clearProgress();
  assert.deepEqual(await loadProgress(), {});
});

/* ------------------------------ Aufräumen -------------------------------- */

await check("clearPlaylist: löscht Liste, Favoriten und Fortschritt, aber nicht Einstellungen", async () => {
  memoryStorage.__reset();
  await savePlaylist({
    channels: [{ name: "A", url: "https://a", group: "G", kind: "live" }],
    sourceUrl: null,
    sourceLabel: "",
    updatedAt: null,
  });
  await saveFavorites(["https://a"]);
  await saveProgress("https://a", 30_000, 600_000);
  await saveSettings({ lowSpec: true, demoMode: false });
  await saveActivationToken("token-123");

  await clearPlaylist();

  assert.deepEqual((await loadPlaylist()).channels, []);
  assert.deepEqual(await loadFavorites(), []);
  assert.deepEqual(await loadProgress(), {});
  assert.deepEqual(await loadSettings(), { lowSpec: true, demoMode: false });
  assert.equal(await loadActivationToken(), "token-123");
});

/* --------------------------- Kopplung und Gerät -------------------------- */

await check("Token: leere oder fehlende Werte ergeben null", async () => {
  memoryStorage.__reset();
  assert.equal(await loadActivationToken(), null);
  await saveActivationToken("   ");
  assert.equal(await loadActivationToken(), null);
  await saveActivationToken("abc");
  assert.equal(await loadActivationToken(), "abc");
  await clearActivationToken();
  assert.equal(await loadActivationToken(), null);
});

await check("Gerätename: wird auf 60 Zeichen gekürzt", async () => {
  memoryStorage.__reset();
  await saveDeviceName("x".repeat(100));
  assert.equal((await loadDeviceName())?.length, 60);
  await saveDeviceName("   ");
  assert.equal(await loadDeviceName(), null, "nur Leerzeichen zählt nicht");
});

/* -------------------------------- EPG ------------------------------------ */

await check("EPG: ungültige Sendungen fliegen beim Laden raus, Quelle bleibt", async () => {
  memoryStorage.__reset();
  await saveEpg({
    programmes: [
      { channelId: "a", channelName: "A", startMs: 1_000, stopMs: 2_000, title: "Gut" },
      { channelId: "b", channelName: "B", startMs: 2_000, stopMs: 2_000, title: "Null lang" },
      { channelId: "c", channelName: "C", startMs: 3_000, stopMs: 2_000, title: "Rückwärts" },
    ],
    sourceUrl: "https://example.test/epg.xml",
    updatedAt: 1_760_000_000_000,
  });
  const loaded = await loadEpg();
  assert.deepEqual(
    loaded.programmes.map((programme) => programme.title),
    ["Gut"],
  );
  assert.equal(loaded.sourceUrl, "https://example.test/epg.xml");
  assert.equal(loaded.updatedAt, 1_760_000_000_000);
});

/* ----------------------------- Erinnerungen ------------------------------ */

await check("Erinnerungen: ungültige Einträge werden verworfen", async () => {
  memoryStorage.__reset();
  await memoryStorage.setItem(
    KEY.reminders,
    JSON.stringify([
      { id: "r1", channelId: "a", channelName: "A", title: "Start", startMs: 5_000 },
      { id: 2, title: "Kaputt", startMs: 5_000 },
      { id: "r3", title: "Ohne Zeit" },
    ]),
  );
  const loaded = await loadReminders();
  assert.deepEqual(
    loaded.map((reminder) => reminder.id),
    ["r1"],
  );
  await saveReminders([{ id: "r4", channelId: "b", channelName: "B", title: "Neu", startMs: 6_000 }]);
  assert.equal((await loadReminders())[0].id, "r4");
});

/* -------------------------------- Ergebnis ------------------------------- */

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
if (failed.length > 0) {
  process.exitCode = 1;
}
