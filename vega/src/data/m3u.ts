import type { Channel, MediaKind } from "../model/types";

/**
 * Liest das erweiterte M3U-Format der IPTV-Anbieter.
 *
 * Jede URL bleibt eine undurchsichtige Quelle: StreamingHub bündelt, proxyt oder
 * beansprucht keine Rechte an Playlist-Inhalten.
 */

const MAX_CHANNELS = 50_000;
const ATTRIBUTE = /([A-Za-z0-9_-]+)\s*=\s*"([^"]*)"/g;

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
    if (!channels.has(channel.url)) channels.set(channel.url, channel);
    pending = null;
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
