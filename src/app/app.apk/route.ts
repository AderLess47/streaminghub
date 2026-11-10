import { androidRelease } from "@/content/release";

export const dynamic = "force-dynamic";

/**
 * Short, stable same-origin URL for the Fire TV Downloader app.
 * Serving the bytes directly avoids relying on a cross-origin redirect.
 */
export async function GET() {
  const upstream = await fetch(androidRelease.path, { cache: "no-store" });

  if (!upstream.ok || !upstream.body) {
    return new Response("APK is currently unavailable.", {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const headers = new Headers({
    "content-type": "application/vnd.android.package-archive",
    "content-disposition": `attachment; filename="${androidRelease.fileName}"`,
    "cache-control": "public, max-age=300",
    "x-content-type-options": "nosniff",
  });

  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("content-length", contentLength);

  return new Response(upstream.body, { status: 200, headers });
}
