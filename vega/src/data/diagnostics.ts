import AsyncStorage from "@react-native-async-storage/async-storage";
import { Dimensions, PixelRatio, Platform } from "react-native";

/**
 * Diagnose-Protokoll für Support und Fehlersuche.
 *
 * Auf Vega OS gibt es kein `console.log`, das man später noch lesen könnte, und
 * keinen Dateidialog. Das Protokoll liegt deshalb als JSON in AsyncStorage – mit
 * derselben Struktur wie in der Android- und der Apple-App, damit sich die
 * Einträge vergleichen lassen.
 *
 * Aufgezeichnet werden **nur** technische Daten: Zeitpunkt, Stufe, Bereich,
 * Meldung, Geräteklasse und Hardware. Keine Tokens, keine E-Mail-Adressen, und
 * URLs werden vor dem Schreiben von Zugangsdaten, Query und Fragment befreit.
 * Nichts davon wird automatisch übertragen.
 */

const KEY = "streaminghub.diagnostics";
const MAX_CHARS = 64_000;
const MAX_ENTRIES = 400;

export type LogLevel = "info" | "warn" | "error";

export type LogEntry = {
  at: string;
  level: LogLevel;
  area: string;
  message: string;
  meta?: string;
};

export type LogSummary = { entries: number; chars: number };

/**
 * Entfernt Zugangsdaten und Query-Parameter aus einer URL. Playlist-Adressen
 * enthalten häufig Tokens (`?username=…&password=…`); die gehören nicht in ein
 * Protokoll, das jemand weitergibt.
 */
export function redactUrl(value: string): string {
  return value
    .trim()
    .replace(/\/\/[^/@\s]*@/, "//")
    .replace(/[?#].*$/, "");
}

const truncate = (value: string, limit = 500) =>
  value.length <= limit ? value : `${value.slice(0, limit)}…`;

function isEntry(value: unknown): value is LogEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<LogEntry>;
  return (
    typeof entry.at === "string" &&
    (entry.level === "info" || entry.level === "warn" || entry.level === "error") &&
    typeof entry.area === "string" &&
    typeof entry.message === "string"
  );
}

async function readEntries(): Promise<LogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

async function writeEntries(entries: LogEntry[]): Promise<void> {
  let kept = entries.slice(-MAX_ENTRIES);
  let text = JSON.stringify(kept);
  // Älteste Einträge fallen zuerst heraus, bis das Protokoll wieder passt.
  while (text.length > MAX_CHARS && kept.length > 1) {
    kept = kept.slice(Math.max(1, Math.ceil(kept.length / 4)));
    text = JSON.stringify(kept);
  }
  try {
    await AsyncStorage.setItem(KEY, text);
  } catch {
    // Ein voller Speicher darf die App nicht stören – das Protokoll ist Beiwerk.
  }
}

async function append(level: LogLevel, area: string, message: string, meta?: string): Promise<void> {
  const entry: LogEntry = {
    at: new Date().toISOString(),
    level,
    area: truncate(area, 40),
    message: truncate(message),
    ...(meta ? { meta: truncate(meta) } : {}),
  };
  await writeEntries([...(await readEntries()), entry]);
}

export async function logEvent(
  area: string,
  message: string,
  level: LogLevel = "info",
  meta?: string,
): Promise<void> {
  await append(level, area, message, meta);
}

export async function logError(area: string, error: unknown, meta?: string): Promise<void> {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Unbekannter Fehler";
  await append("error", area, message, meta);
}

type PlatformConstants = { Model?: string; Manufacturer?: string; Brand?: string };

let deviceRecorded = false;

/**
 * Schreibt einmal je App-Start einen Kopf mit Hardware und Systemstand. Das ist
 * die Zeile, die man bei „auf diesem Gerät ruckelt es“ zuerst braucht.
 */
export async function recordDeviceInfo(): Promise<void> {
  if (deviceRecorded) return;
  deviceRecorded = true;

  const constants = (Platform as unknown as { constants?: PlatformConstants }).constants ?? {};
  const window = Dimensions.get("window");
  const locale = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().locale;
    } catch {
      return "unbekannt";
    }
  })();

  const parts = [
    `os=${Platform.OS}`,
    `osVersion=${String(Platform.Version)}`,
    `model=${constants.Model ?? "unbekannt"}`,
    `manufacturer=${constants.Manufacturer ?? constants.Brand ?? "unbekannt"}`,
    `screen=${Math.round(window.width)}x${Math.round(window.height)}@${PixelRatio.get().toFixed(2)}`,
    `locale=${locale}`,
  ];

  await append("info", "device", parts.join(" "));
}

export async function readLog(): Promise<LogEntry[]> {
  return readEntries();
}

export function formatLog(entries: LogEntry[]): string {
  return entries
    .map((entry) => {
      const meta = entry.meta ? ` | ${entry.meta}` : "";
      return `${entry.at} ${entry.level.toUpperCase().padEnd(5)} ${entry.area}: ${entry.message}${meta}`;
    })
    .join("\n");
}

export async function readLogText(limit = 12_000): Promise<string> {
  const text = formatLog(await readEntries());
  return text.length <= limit ? text : `… (gekürzt)\n${text.slice(-limit)}`;
}

export async function logSummary(): Promise<LogSummary> {
  const entries = await readEntries();
  return { entries: entries.length, chars: JSON.stringify(entries).length };
}

export async function clearLog(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Siehe writeEntries: ein Fehler hier ist kein Grund, die App zu stören.
  }
}
