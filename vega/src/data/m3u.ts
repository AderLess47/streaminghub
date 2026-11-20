import type { Channel, ChannelDrm, MediaKind } from "../model/types";

/**
 * Liest das erweiterte M3U-Format der IPTV-Anbieter.
 *
 * Jede URL bleibt eine undurchsichtige Quelle: StreamingHub bündelt, proxyt oder
 * beansprucht keine Rechte an Playlist-Inhalten.
 */

const MAX_CHANNELS = 50_000;
const ATTRIBUTE = /([A-Za-z0-9_-]+)\s*=\s*"([^"]*)"/g;

const WIDEVINE = "com.widevine.alpha";
const PLAYREADY = "com.microsoft.playready";

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * `#KODIPROP:inputstream.adaptive.license_key` hat die Form
 * `https://lizenz.example/wv|Authorization=Bearer%20abc&X-Test=1`. Alles ab dem
 * ersten `|` sind Header, `&`-getrennt und URL-kodiert.
 */
function licenseHeaders(raw: string | undefined): [string, string][] | undefined {
  if (!raw) return undefined;
  const pairs: [string, string][] = [];
  for (const part of raw.split("&")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name = decode(part.slice(0, separator).trim());
    if (!name) continue;
    pairs.push([name, decode(part.slice(separator + 1))]);
  }
  return pairs.length > 0 ? pairs : undefined;
}

/** Baut aus den gesammelten `#KODIPROP`-Zeilen die DRM-Angaben des Senders. */
export function drmFromProperties(properties: Map<string, string>): ChannelDrm | undefined {
  const type = properties.get("inputstream.adaptive.license_type")?.trim().toLowerCase();
  const scheme = type === WIDEVINE || type === PLAYREADY ? type : undefined;
  if (!scheme) return undefined;

  const raw = properties.get("inputstream.adaptive.license_key")?.trim();
  if (!raw) return undefined;

  const [urlPart, headerPart] = raw.split("|");
  const licenseUrl = urlPart?.trim() ?? "";
  if (!licenseUrl) return undefined;

  const headers = licenseHeaders(headerPart);
  return headers ? { scheme, licenseUrl, headers } : { scheme, licenseUrl };
}

type PendingInfo = {
  name: string;
  logo?: string;
  group: string;
  tvgId?: string;
};

function attributes(metadata: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of metadata.matchAll(ATTRIBUTE)) {
    const key = match[1]?.toLowerCase();
    const value = match[2]?.trim();
    if (key && value !== undefined) result[key] = value;
  }
  return result;
}

export function inferKind(name: string, group: string, url: string): MediaKind {
  const haystack = `${name} ${group}`.toLowerCase();
  const path = url.toLowerCase();

  const looksLikeSeries =
    haystack.includes("serie") ||
    haystack.includes("series") ||
    haystack.includes("episode") ||
    haystack.includes("staffel") ||
    path.includes("/series/") ||
    path.includes("/serie/");
  if (looksLikeSeries) return "series";

  const looksLikeMovie =
    haystack.includes("film") ||
    haystack.includes("movie") ||
    haystack.includes("kino") ||
    haystack.includes("vod") ||
    haystack.includes("doku") ||
    haystack.includes("documentary") ||
    path.includes("/movie/") ||
    path.endsWith(".mp4") ||
    path.endsWith(".mkv") ||
    path.endsWith(".avi") ||
    path.endsWith(".webm");
  if (looksLikeMovie) return "movie";

  return "live";
}

export function parseM3u(content: string): Channel[] {
  // Map statt Array: doppelte URLs fliegen raus, die Reihenfolge bleibt erhalten.
  const channels = new Map<string, Channel>();
  let pending: PendingInfo | null = null;
  let extGroup = "";
  // KODIPROP-Zeilen gelten für den nächsten Eintrag; Anbieter setzen sie vor
  // oder nach #EXTINF, deshalb wird erst nach der URL geleert.
  let properties = new Map<string, string>();

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^\uFEFF/, "");
    if (!line) continue;

    if (line.toUpperCase().startsWith("#EXTINF")) {
      const info = line.slice(line.indexOf(":") + 1);
      const comma = info.lastIndexOf(",");
      const metadata = comma >= 0 ? info.slice(0, comma) : "";
      const title = comma >= 0 ? info.slice(comma + 1).trim() : "";
      const parsed = attributes(metadata);
      pending = {
        name: title || "Unbenannter Eintrag",
        logo: parsed["tvg-logo"] || undefined,
        group: parsed["group-title"] || extGroup,
        tvgId: parsed["tvg-id"] || undefined,
      };
      continue;
    }

    if (line.toUpperCase().startsWith("#EXTGRP:")) {
      extGroup = line.slice(line.indexOf(":") + 1).trim();
      continue;
    }

    if (line.toUpperCase().startsWith("#KODIPROP:")) {
      const body = line.slice(line.indexOf(":") + 1);
      const separator = body.indexOf("=");
      if (separator > 0) {
        properties.set(body.slice(0, separator).trim().toLowerCase(), body.slice(separator + 1).trim());
      }
      continue;
    }

    if (line.startsWith("#")) continue;
    if (!line.includes("://") && !line.startsWith("/")) continue;
    if (channels.size >= MAX_CHANNELS) break;

    const info = pending;
    const fallback = line.slice(line.lastIndexOf("/") + 1).split("?")[0] ?? "";
    const title = info?.name?.trim() || fallback || "Sender";
    const group = info?.group?.trim() || extGroup || "Ohne Kategorie";

    const channel: Channel = {
      name: title,
      url: line,
      logo: info?.logo,
      group,
      tvgId: info?.tvgId,
      kind: inferKind(title, group, line),
    };
    const drm = drmFromProperties(properties);
    if (drm) channel.drm = drm;
    if (!channels.has(channel.url)) channels.set(channel.url, channel);
    pending = null;
    properties = new Map();
  }

  return [...channels.values()];
}

/** Gruppen in der Reihenfolge ihres ersten Auftretens. */
export function groupsOf(channels: Channel[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const channel of channels) {
    if (seen.has(channel.group)) continue;
    seen.add(channel.group);
    result.push(channel.group);
  }
  return result;
}
