/**
 * Fortschritt und Fortsetzen über Gerätegrenzen.
 *
 * Der Server entscheidet in `src/lib/watch-progress.ts`, ob eine gemeldete
 * Position gespeichert wird und an welcher Stelle ein Gerät weiterspielt. Die
 * Vega-App entscheidet lokal dasselbe in `src/data/storage.ts`. Dieser Test
 * hält beide Seiten gegeneinander: Weichen die Regeln ab, springt ein Nutzer
 * beim Gerätewechsel oder verliert seinen Stand.
 *
 * Gebündelt und gestartet von `scripts/headless-run.mjs`
 * (`npm run test:resume`), AsyncStorage ersetzt der In-Memory-Mock.
 */

import assert from "node:assert/strict";
import {
  FINISH_MARGIN_MS,
  MIN_RESUME_MS,
  isFinished,
  parseProgressInput,
  resumePosition,
  shouldRemember,
} from "../../src/lib/watch-progress.ts";
import {
  loadProgress,
  saveProgress,
  shouldStoreProgress,
} from "../src/data/storage";
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

const URL = "https://anbieter.example/vod/folge-1.mp4";
const DURATION = 2_700_000;

/* ------------------------- Regeln auf beiden Seiten ---------------------- */

await check("Schwellen sind auf Server und App gleich", () => {
  assert.equal(MIN_RESUME_MS, 5_000);
  assert.equal(FINISH_MARGIN_MS, 10_000);
  // Die App prüft dieselben Grenzen über shouldStoreProgress.
  assert.equal(shouldStoreProgress(MIN_RESUME_MS - 1, DURATION), false);
  assert.equal(shouldStoreProgress(MIN_RESUME_MS, DURATION), true);
  assert.equal(shouldStoreProgress(DURATION - FINISH_MARGIN_MS, DURATION), false);
  assert.equal(shouldStoreProgress(DURATION - FINISH_MARGIN_MS - 1, DURATION), true);
});

await check("App und Server entscheiden für jede realistische Position gleich", () => {
  const durations = [1_000, 60_000, 600_000, DURATION];
  const positionsOf = (duration: number) => [
    0,
    MIN_RESUME_MS - 1,
    MIN_RESUME_MS,
    MIN_RESUME_MS + 1,
    Math.floor(duration / 2),
    duration - FINISH_MARGIN_MS - 1,
    duration - FINISH_MARGIN_MS,
    duration,
  ];

  for (const duration of durations) {
    for (const positionMs of positionsOf(duration)) {
      const app = shouldStoreProgress(positionMs, duration);
      const server = shouldRemember({ url: URL, positionMs, durationMs: duration });
      assert.equal(
        app,
        server,
        `Position ${positionMs} bei ${duration} ms: App ${app}, Server ${server}`,
      );
    }
  }
});

await check("Live-Streams ohne Laufzeit speichert die App nicht, der Server verlangt eine Dauer", () => {
  // Die App hat den strengeren Weg: ohne Laufzeit gibt es keinen Fortsetzungspunkt.
  assert.equal(shouldStoreProgress(120_000, 0), false);
  const parsed = parseProgressInput({ url: URL, positionMs: 120_000, durationMs: 0 });
  assert.equal(parsed.ok, false, "Server akzeptiert keine Laufzeit 0");
  assert.equal(isFinished(120_000, 0), false);
});

/* ------------------------------ Weiterspielen ---------------------------- */

await check("Das spätere Gerät gewinnt, Offline-Stand bleibt erhalten", () => {
  assert.equal(resumePosition(0, 90_000), 90_000, "nur Server kennt den Stand");
  assert.equal(resumePosition(120_000, 90_000), 120_000, "lokal weiter");
  assert.equal(resumePosition(90_000, 120_000), 120_000, "anderes Gerät weiter");
  assert.equal(resumePosition(0, null), 0);
  assert.equal(resumePosition(0, undefined), 0);
});

await check("Ungültige Gegenwerte zählen als 0, krumme Werte werden abgerundet", () => {
  assert.equal(resumePosition(60_000, -5), 60_000);
  assert.equal(resumePosition(60_000, Number.NaN), 60_000);
  assert.equal(resumePosition(60_000, Number.POSITIVE_INFINITY), 60_000);
  assert.equal(resumePosition(60_000.9, null), 60_000);
  assert.equal(resumePosition(-1, 42_000), 42_000);
});

await check("Der Server begrenzt Positionen am Titelende, damit kein Gerät dahinter fortsetzt", () => {
  const parsed = parseProgressInput({ url: URL, positionMs: DURATION + 30_000, durationMs: DURATION });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.positionMs, DURATION, "auf die Laufzeit geklemmt");
  assert.equal(resumePosition(DURATION - 20_000, parsed.value.positionMs), DURATION);
});

/* ------------------------ Zwei Geräte, ein Titel ------------------------- */

await check("Gerät A speichert, Gerät B setzt an derselben Stelle fort", async () => {
  memoryStorage.__reset();

  // Gerät A (Vega) schaut bis 90 s und schreibt lokal.
  await saveProgress(URL, 90_000, DURATION);
  const fromDeviceA = (await loadProgress())[URL];
  assert.equal(fromDeviceA, 90_000);

  // Der Server nimmt genau diesen Wert an (App und Server sind sich einig).
  const upload = parseProgressInput({ url: URL, positionMs: fromDeviceA, durationMs: DURATION });
  assert.equal(upload.ok, true);

  // Gerät B hat keinen lokalen Stand und bekommt 90 s vom Server.
  assert.equal(resumePosition(0, 90_000), 90_000);
});

await check("Gerät B schaut weiter, Gerät A bleibt offline und verliert nichts", async () => {
  memoryStorage.__reset();
  await saveProgress(URL, 120_000, DURATION);
  const offline = (await loadProgress())[URL];

  // Gerät B schreibt 90 s in die Cloud; A war offline und hat 120 s lokal.
  const remote = parseProgressInput({ url: URL, positionMs: 90_000, durationMs: DURATION });
  assert.equal(remote.ok, true);
  assert.equal(
    resumePosition(offline, 90_000),
    120_000,
    "A setzt bei seinem späteren lokalen Stand fort",
  );
});

await check("Ist der Titel zu Ende geschaut, wird der Stand gelöscht statt fortgesetzt", async () => {
  memoryStorage.__reset();
  await saveProgress(URL, 600_000, DURATION);
  assert.equal((await loadProgress())[URL], 600_000);

  await saveProgress(URL, DURATION - 5_000, DURATION);
  assert.equal((await loadProgress())[URL], undefined, "kurz vor Schluss entfernt");

  const server = parseProgressInput({ url: URL, positionMs: DURATION - 5_000, durationMs: DURATION });
  assert.equal(server.ok, true, "der Server nimmt die Meldung an");
  if (server.ok) {
    assert.equal(shouldRemember(server.value), false, "speichert sie aber nicht");
  }
  assert.equal(resumePosition(0, null), 0, "anderes Gerät startet von vorn");
});

await check("Gespeicherte Positionen sind ganzzahlig, wie der Server sie erwartet", async () => {
  memoryStorage.__reset();
  await saveProgress(URL, 90_450.6, DURATION);
  const stored = (await loadProgress())[URL];
  assert.equal(Number.isInteger(stored), true);
  assert.equal(stored, 90_451);
  assert.equal(parseProgressInput({ url: URL, positionMs: stored, durationMs: DURATION }).ok, true);
});

await check("Lokale Einträge mit nicht synchronisierbaren Adressen bleiben lokal nutzbar", async () => {
  memoryStorage.__reset();
  const localUrl = "file:///mnt/usb/aufnahme.mp4";
  await saveProgress(localUrl, 90_000, DURATION);
  assert.equal((await loadProgress())[localUrl], 90_000, "lokal gespeichert");

  const upload = parseProgressInput({ url: localUrl, positionMs: 90_000, durationMs: DURATION });
  assert.equal(upload.ok, false, "der Server lehnt fremde Schemata ab");
  assert.equal(resumePosition(90_000, null), 90_000, "Wiedergabe läuft lokal weiter");
});

/* -------------------------------- Ergebnis ------------------------------- */

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
if (failed.length > 0) {
  process.exitCode = 1;
}
