import type { EpgProgramme } from "../model/types";

/**
 * Kleiner XMLTV-Leser für den Programmführer.
 *
 * Bewusst kein vollständiger XML-Parser: Es werden nur Kanalkennung, Start/Stop,
 * Titel und Beschreibung gelesen – also genau das, was die App anzeigt. Ein
 * DOM-Parser steht in React Native nicht zur Verfügung, und eine vollständige
 * Implementierung wäre für diese Datenmenge unverhältnismäßig.
 */

const MAX_PROGRAMMES = 50_000;

const CHANNEL_BLOCK = /<channel\b([^>]*)>([\s\S]*?)<\/channel>/g;
const PROGRAMME_BLOCK = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g;
const ATTRIBUTE = /([A-Za-z0-9_:-]+)\s*=\s*"([^"]*)"/g;

function decode(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, "&");
}

function attributes(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of raw.matchAll(ATTRIBUTE)) {
    const key = match[1];
    const value = match[2];
    if (key && value !== undefined) result[key] = decode(value).trim();
  }
  return result;
}

function childText(block: string, tag: string): string {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`).exec(block);
  return match?.[1] ? decode(match[1]).trim() : "";
}

/** XMLTV-Zeit: `YYYYMMDDhhmmss +HHMM`, die Zone ist optional. */
export function parseXmltvTime(raw: string): number | null {
  const value = raw.trim();
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?$/.exec(value);
  if (!match) return null;

  const [, year, month, day, hour, minute, second, zone] = match;
  const utc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? "0"),
  );
  if (!Number.isFinite(utc)) return null;

  let offsetMinutes = 0;
  if (zone) {
    const sign = zone.startsWith("-") ? -1 : 1;
    const hours = Number(zone.slice(1, 3));
    const minutes = Number(zone.slice(3, 5));
    offsetMinutes = sign * (hours * 60 + minutes);
  }
  return utc - offsetMinutes * 60_000;
}

export function parseXmltv(xml: string): EpgProgramme[] {
  const channelNames = new Map<string, string>();
  for (const match of xml.matchAll(CHANNEL_BLOCK)) {
    const id = attributes(match[1] ?? "")["id"];
    if (!id) continue;
    const name = childText(match[2] ?? "", "display-name");
    if (name) channelNames.set(id, name);
  }

  const result: EpgProgramme[] = [];
  for (const match of xml.matchAll(PROGRAMME_BLOCK)) {
    if (result.length >= MAX_PROGRAMMES) break;
    const attrs = attributes(match[1] ?? "");
    const channelId = attrs["channel"];
    if (!channelId) continue;

    const startMs = parseXmltvTime(attrs["start"] ?? "");
    const stopMs = parseXmltvTime(attrs["stop"] ?? "");
    if (startMs === null || stopMs === null || stopMs <= startMs) continue;

    const body = match[2] ?? "";
    const title = childText(body, "title");
    if (!title) continue;

    result.push({
      channelId,
      channelName: channelNames.get(channelId) ?? channelId,
      startMs,
      stopMs,
      title,
      description: childText(body, "desc") || undefined,
    });
  }

  return result.sort((a, b) => a.startMs - b.startMs || a.channelName.localeCompare(b.channelName));
}
