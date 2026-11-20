import { parseXmltv } from "./xmltv";
import { fetchText } from "./playlist";
import type { EpgProgramme, StoredEpg } from "../model/types";

export async function loadEpgFromUrl(url: string): Promise<StoredEpg> {
  const xml = await fetchText(url);
  const programmes = parseXmltv(xml);
  if (programmes.length === 0) {
    throw new Error("Die XMLTV-Datei enthielt keine lesbaren Sendungen.");
  }
  return { programmes, sourceUrl: url, updatedAt: Date.now() };
}

/** Laufende Sendung eines Senders; ohne Startzeit davor und ohne Ende danach. */
export function programmeAt(
  programmes: EpgProgramme[],
  channelId: string,
  atMs: number,
): EpgProgramme | undefined {
  return programmes.find(
    (programme) => programme.channelId === channelId && programme.startMs <= atMs && programme.stopMs > atMs,
  );
}

/** Nächste Sendung, die nach `atMs` beginnt. */
export function nextProgramme(
  programmes: EpgProgramme[],
  channelId: string,
  atMs: number,
): EpgProgramme | undefined {
  let best: EpgProgramme | undefined;
  for (const programme of programmes) {
    if (programme.channelId !== channelId || programme.startMs <= atMs) continue;
    if (!best || programme.startMs < best.startMs) best = programme;
  }
  return best;
}

export function programmesForChannel(programmes: EpgProgramme[], channelId: string): EpgProgramme[] {
  return programmes.filter((programme) => programme.channelId === channelId);
}

/** Sendungen, die in den nächsten `windowMs` beginnen – Grundlage der Erinnerungen. */
export function upcomingProgrammes(
  programmes: EpgProgramme[],
  fromMs: number,
  windowMs: number,
): EpgProgramme[] {
  const until = fromMs + windowMs;
  return programmes
    .filter((programme) => programme.startMs > fromMs && programme.startMs <= until)
    .sort((a, b) => a.startMs - b.startMs);
}

export function formatTime(ms: number, locale = "de-DE"): string {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
}

export function formatDateTime(iso: string | undefined, locale = "de-DE"): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}
