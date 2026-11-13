/**
 * Prüft die Plattform-unabhängige Logik der Vega-App unter Node – ohne
 * Virtual Device und ohne React Native. Gebündelt und gestartet von
 * `scripts/headless-check.mjs` (`npm run test:headless`).
 *
 * Geprüft werden die echten Module aus `src/`: Playlist-Parser, XMLTV-Parser
 * und die HLS-Nahtstelle. Alles, was React Native oder die W3C-Media-API
 * braucht, bleibt außen vor; das kann nur ein Gerät zeigen.
 */

import assert from "node:assert/strict";
import { groupsOf, inferKind, parseM3u } from "../src/data/m3u";
import { parseXmltv, parseXmltvTime } from "../src/data/xmltv";
import {
  createHlsAdapter,
  hasHlsAdapter,
  isAdaptiveSource,
  registerHlsAdapter,
  type HlsCallbacks,
} from "../src/player/hls";

const results: { name: string; ok: boolean; detail?: string }[] = [];

function check(name: string, run: () => void): void {
  try {
    run();
    results.push({ name, ok: true });
    console.log(`  \u2713 ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail });
    console.log(`  \u2717 ${name}\n      ${detail.split("\n")[0]}`);
  }
}

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

check("Playlist: nur Einträge mit URL, Duplikate entfernt", () => {
  assert.equal(channels.length, 5, `erwartet 5, bekommen ${channels.length}`);
});

check("Playlist: Attribute und Titel werden übernommen", () => {
  const ard = channels[0];
  assert.equal(ard.name, "Das Erste HD");
  assert.equal(ard.group, "Öffentlich");
  assert.equal(ard.logo, "https://example.test/ard.png");
  assert.equal(ard.tvgId, "ard");
});

check("Playlist: fehlende Gruppe fällt auf #EXTGRP oder Standard zurück", () => {
  assert.equal(channels[3].group, "Ohne Kategorie");
  assert.equal(channels[4].group, "Radio");
});

check("Playlist: Gruppen in Reihenfolge des ersten Auftretens", () => {
  assert.deepEqual(groupsOf(channels), ["Öffentlich", "Filme", "Serien", "Ohne Kategorie", "Radio"]);
});

check("Playlist: Art wird aus Name, Gruppe und Endung abgeleitet", () => {
  assert.equal(inferKind("Das Erste HD", "Öffentlich", "https://example.test/live/ard.m3u8"), "live");
  assert.equal(inferKind("Beispielfilm", "Filme", "https://example.test/movie/film.mp4"), "movie");
  assert.equal(inferKind("Staffel 1 Folge 2", "Serien", "https://example.test/x.m3u8"), "series");
  assert.equal(inferKind("Doku", "", "https://example.test/x.m3u8"), "movie");
});

check("Playlist: leere Eingabe ergibt keine Sender", () => {
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

check("XMLTV: gültige Sendungen, kaputte Zeit und Ende vor Start fliegen raus", () => {
  assert.equal(programmes.length, 2);
  assert.deepEqual(
    programmes.map((programme) => programme.title),
    ["Tagesschau", "Mittagsmagazin"],
  );
  assert.equal(programmes[0].channelName, "Das Erste");
  assert.equal(programmes[0].description, "Nachrichten");
});

check("XMLTV: Zeitzone wird verrechnet", () => {
  const withZone = parseXmltvTime("20261113120000 +0100");
  const withoutZone = parseXmltvTime("20261113120000");
  assert.equal(withZone, Date.UTC(2026, 10, 13, 11, 0, 0));
  assert.equal(withoutZone, Date.UTC(2026, 10, 13, 12, 0, 0));
});

check("XMLTV: unsinnige Zeit ergibt null", () => {
  assert.equal(parseXmltvTime("gestern"), null);
  assert.equal(parseXmltvTime(""), null);
});

/* ---------------------------------- HLS ---------------------------------- */

check("HLS: adaptive Quellen werden erkannt", () => {
  assert.equal(isAdaptiveSource("https://example.test/master.m3u8"), true);
  assert.equal(isAdaptiveSource("https://example.test/manifest.MPD?token=1"), true);
  assert.equal(isAdaptiveSource("https://example.test/film.mp4"), false);
  assert.equal(isAdaptiveSource("rtmp://example.test/live"), false);
});

check("HLS: ohne Registrierung gibt es keinen Adapter", () => {
  assert.equal(hasHlsAdapter(), false);
  assert.equal(createHlsAdapter(callbacks()), null);
});

check("HLS: nach der Registrierung entsteht ein Adapter mit Lebenszyklus", () => {
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

/* -------------------------------- Ergebnis ------------------------------- */

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
if (failed.length > 0) {
  process.exitCode = 1;
}
