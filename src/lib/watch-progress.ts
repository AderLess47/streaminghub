/**
 * Cross-device resume ("Weiterschauen auf allen Geräten").
 *
 * The rules live here, apart from the HTTP route and the database, because the
 * client is untrusted: every position arrives from a device the user controls.
 * Only premium accounts sync positions at all – the route enforces that, these
 * functions only decide whether a submitted position is worth storing.
 */

export const PROGRESS_LIMIT = 100;
export const MIN_RESUME_MS = 5_000;
export const FINISH_MARGIN_MS = 10_000;

const MAX_URL_LENGTH = 2_048;
const MAX_DURATION_MS = 24 * 60 * 60 * 1_000;
const POSITION_SLACK_MS = 60_000;

export type ProgressInput = {
  url: string;
  positionMs: number;
  durationMs: number;
};

export type ProgressEntry = {
  url: string;
  positionMs: number;
  durationMs: number;
  updatedAt: string;
};

export type ProgressRow = {
  media_url: string;
  position_ms: number;
  duration_ms: number;
  updated_at: string;
};

export type ParsedProgress =
  | { ok: true; value: ProgressInput }
  | { ok: false; message: string };

function isSupportedUrl(url: string): boolean {
  return url.length >= 8 && url.length <= MAX_URL_LENGTH && /^https?:\/\//i.test(url);
}

function toMillis(value: unknown): number | null {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(number) || !Number.isInteger(number)) return null;
  if (number < 0 || number > MAX_DURATION_MS) return null;
  return number;
}

export function parseProgressInput(raw: unknown): ParsedProgress {
  if (!raw || typeof raw !== "object") {
    return { ok: false, message: "Der Wiedergabestand fehlt." };
  }
  const body = raw as Record<string, unknown>;
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!isSupportedUrl(url)) {
    return { ok: false, message: "Die Adresse des Titels ist ungültig." };
  }

  const positionMs = toMillis(body.positionMs);
  if (positionMs === null) {
    return { ok: false, message: "Die Wiedergabeposition ist ungültig." };
  }

  const durationMs = toMillis(body.durationMs);
  if (durationMs === null || durationMs === 0) {
    return { ok: false, message: "Die Laufzeit des Titels fehlt." };
  }

  if (positionMs > durationMs + POSITION_SLACK_MS) {
    return { ok: false, message: "Die Position liegt hinter dem Ende des Titels." };
  }

  return {
    ok: true,
    value: { url, positionMs: Math.min(positionMs, durationMs), durationMs },
  };
}

export function isFinished(positionMs: number, durationMs: number): boolean {
  if (durationMs <= 0) return false;
  return positionMs >= durationMs - FINISH_MARGIN_MS;
}

/**
 * A position is worth syncing once a few seconds were watched and the title was
 * not finished: watching to the end removes the entry instead of resuming it.
 */
export function shouldRemember(input: ProgressInput): boolean {
  if (input.positionMs < MIN_RESUME_MS) return false;
  return !isFinished(input.positionMs, input.durationMs);
}

/**
 * The device resumes at the later of the stored local and the synced position,
 * so a device going offline never loses its own progress.
 */
export function resumePosition(localMs: number, remoteMs: number | null | undefined): number {
  const local = Number.isFinite(localMs) && localMs > 0 ? Math.floor(localMs) : 0;
  const remote =
    typeof remoteMs === "number" && Number.isFinite(remoteMs) && remoteMs > 0
      ? Math.floor(remoteMs)
      : 0;
  return Math.max(local, remote);
}

export function toEntry(row: ProgressRow): ProgressEntry {
  return {
    url: row.media_url,
    positionMs: row.position_ms,
    durationMs: row.duration_ms,
    updatedAt: row.updated_at,
  };
}
