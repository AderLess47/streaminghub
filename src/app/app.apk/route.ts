import { androidRelease } from "@/lib/android-release";

export const dynamic = "force-dynamic";

/** Obergrenze für den Download-Pfad; schützt den Worker vor hängenden Quellen. */
const UPSTREAM_TIMEOUT_MS = 15_000;
const MAX_APK_BYTES = 250 * 1024 * 1024;

/**
 * Short, stable same-origin URL for the Fire TV Downloader app.
 * Serving the bytes directly avoids relying on a cross-origin redirect.
 */
export async function GET() {
  let upstream: Response;
  try {
    upstream = await fetch(androidRelease.path, {
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return unavailable();
  }

  if (!upstream.ok || !upstream.body) {
    return unavailable();
  }

  const contentLength = upstream.headers.get("content-length");
  if (contentLength) {
    const bytes = Number(contentLength);
    if (!Number.isFinite(bytes) || bytes > MAX_APK_BYTES) {
      await upstream.body.cancel().catch(() => undefined);
      return unavailable();
    }
  }

  const headers = new Headers({
    "content-type": "application/vnd.android.package-archive",
    "content-disposition": `attachment; filename="${androidRelease.fileName}"`,
    "cache-control": "public, max-age=300",
    "x-content-type-options": "nosniff",
  });
  if (contentLength) headers.set("content-length", contentLength);

  return new Response(upstream.body, { status: 200, headers });
}

function unavailable() {
  return new Response("APK is currently unavailable.", {
    status: 502,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
