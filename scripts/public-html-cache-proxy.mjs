#!/usr/bin/env node
/**
 * A small cache in front of the Next standalone server for anonymous public
 * HTML. Next marks every page private/no-store because the root layout reads
 * the session and locale cookies. This proxy caches only requests without a
 * session cookie and only public pages in their logged-out form.
 *
 * Requests with `sh_session` always bypass the cache, so a logged-in page can
 * never be stored under an anonymous key. `Vary: Cookie` also keeps browser
 * and shared-cache entries separate for locale/consent cookie variants.
 */
import http from "node:http";
import { pathToFileURL } from "node:url";

const SESSION_COOKIE = "sh_session";
const CACHE_CONTROL = "public, max-age=60, s-maxage=60, stale-while-revalidate=300";

// Every path here must pass the audit in docs/PUBLIC_CACHE_AUDIT.md.
export const PUBLIC_CACHE_PATHS = new Set([
  "/",
  "/premium",
  "/download",
  "/faq",
  "/help",
  "/contact",
  "/imprint",
  "/privacy",
  "/account-deletion",
  "/terms",
  "/subscription-terms",
  "/barrierefreiheit",
  "/withdrawal",
  "/widerruf",
  "/kuendigung",
  "/docs/api",
]);

export function isPublicCachePath(pathname) {
  const normalized = pathname !== "/" && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return PUBLIC_CACHE_PATHS.has(normalized);
}

export function hasSessionCookie(cookieHeader) {
  return (
    typeof cookieHeader === "string" &&
    cookieHeader
      .split(";")
      .some((part) => part.trim().split("=", 1)[0] === SESSION_COOKIE)
  );
}

function acceptsHtml(request) {
  return (request.headers.accept ?? "").includes("text/html");
}

function isRscRequest(request) {
  return Boolean(
    request.headers.rsc ||
      request.headers["next-router-state-tree"] ||
      request.headers["next-router-prefetch"],
  );
}

function wantsFreshResponse(request) {
  const cacheControl = request.headers["cache-control"] ?? "";
  return /(?:^|,)\s*(?:no-cache|no-store|max-age=0)\b/i.test(cacheControl);
}

function isHtmlResponse(headers) {
  return (headers["content-type"] ?? "").startsWith("text/html");
}

function appendCookieVary(vary) {
  const parts = (vary ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.includes("*")) return "*";
  if (!parts.some((part) => part.toLowerCase() === "cookie")) parts.push("Cookie");
  return parts.join(", ");
}

function cacheKey(request) {
  return [
    request.method,
    request.headers.host ?? "",
    request.url ?? "",
    request.headers.cookie ?? "",
    request.headers["accept-encoding"] ?? "",
  ].join("\n");
}

/**
 * Creates the proxy server without starting it. `upstreamPort` points at the
 * Next standalone server. The test suite uses a fake upstream.
 */
export function createPublicCacheProxy({
  upstreamPort,
  ttlMs = 60_000,
  maxEntries = 100,
  maxBodyBytes = 2 * 1024 * 1024,
} = {}) {
  if (!upstreamPort) throw new Error("upstreamPort is required");
  const cache = new Map();

  const server = http.createServer((request, response) => {
    let pathname = "/";
    try {
      pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    } catch {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      response.end("Bad Request");
      return;
    }

    const publicPath = isPublicCachePath(pathname);
    const sessionRequest = hasSessionCookie(request.headers.cookie);
    const cacheableRequest =
      publicPath &&
      !sessionRequest &&
      request.method === "GET" &&
      acceptsHtml(request) &&
      !isRscRequest(request) &&
      !wantsFreshResponse(request);
    const key = cacheableRequest ? cacheKey(request) : "";

    if (cacheableRequest) {
      const hit = cache.get(key);
      if (hit && hit.expiresAt > Date.now()) {
        response.writeHead(hit.statusCode, hit.headers);
        response.end(hit.body);
        return;
      }
      if (hit) cache.delete(key);
    }

    const upstream = http.request(
      {
        hostname: process.env.UPSTREAM_HOST ?? "127.0.0.1",
        port: upstreamPort,
        path: request.url ?? "/",
        method: request.method,
        headers: request.headers,
      },
      (upstreamResponse) => {
        const statusCode = upstreamResponse.statusCode ?? 502;
        const headers = { ...upstreamResponse.headers };
        const html = isHtmlResponse(headers);
        const canPublish =
          publicPath &&
          !sessionRequest &&
          request.method === "GET" &&
          !isRscRequest(request) &&
          !wantsFreshResponse(request) &&
          html &&
          statusCode === 200 &&
          !headers["set-cookie"];

        if (canPublish) {
          headers["cache-control"] = CACHE_CONTROL;
          headers.vary = appendCookieVary(headers.vary);
        }

        if (!cacheableRequest || !canPublish) {
          response.writeHead(statusCode, headers);
          upstreamResponse.pipe(response);
          return;
        }

        const chunks = [];
        upstreamResponse.on("data", (chunk) => chunks.push(chunk));
        upstreamResponse.on("end", () => {
          const body = Buffer.concat(chunks);
          // Oversized bodies are sent in full but not retained in this small
          // in-process cache.
          if (body.length <= maxBodyBytes) {
            cache.set(key, {
              statusCode,
              headers,
              body,
              expiresAt: Date.now() + ttlMs,
            });
            while (cache.size > maxEntries) {
              const oldest = cache.keys().next().value;
              if (oldest === undefined) break;
              cache.delete(oldest);
            }
          }
          response.writeHead(statusCode, headers);
          response.end(body);
        });
      },
    );

    upstream.on("error", () => {
      if (!response.headersSent) {
        response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      }
      response.end("Bad Gateway");
    });
    request.pipe(upstream);
  });

  return server;
}

function main() {
  const port = Number(process.env.PORT ?? 3000);
  const upstreamPort = Number(process.env.UPSTREAM_PORT ?? 3001);
  if (!Number.isInteger(port) || !Number.isInteger(upstreamPort)) {
    throw new Error("PORT and UPSTREAM_PORT must be integers");
  }
  const server = createPublicCacheProxy({ upstreamPort });
  server.listen(port, "0.0.0.0", () => {
    console.log(`[public-cache] listening on :${port}, upstream :${upstreamPort}`);
  });

  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
