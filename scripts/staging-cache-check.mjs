#!/usr/bin/env node
/**
 * Post-deploy check against the real staging Fly host.
 *
 * A unique query key forces a cold anonymous request. The second request must
 * reuse the proxy's cached response, observed through an unchanged upstream
 * Date header and identical body. A request carrying sh_session must bypass the
 * cache: its private Date header must change between two requests.
 */
const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error("usage: node scripts/staging-cache-check.mjs <staging-base-url>");
  process.exit(2);
}

const parsed = new URL(baseUrl);
if (parsed.hostname !== "streaminghub-staging.fly.dev") {
  console.error(`[staging-cache] refusing non-staging host: ${parsed.hostname}`);
  process.exit(2);
}

const probe = `__post_deploy_cache_probe=${Date.now()}-${Math.random().toString(36).slice(2)}`;
const anonymousUrl = new URL(`/?${probe}`, parsed);
const sessionUrl = new URL(`/?${probe}&session=1`, parsed);
const sessionCookie = "sh_session=post-deploy-invalid";

function assert(condition, message) {
  if (!condition) throw new Error(`[staging-cache] ${message}`);
}

function cacheControl(response) {
  return (response.headers.get("cache-control") ?? "").toLowerCase();
}

function vary(response) {
  return (response.headers.get("vary") ?? "").toLowerCase();
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Ein einzelner Netzaussetzer darf einen erfolgreichen Rollout nicht rot
 * machen: Am 2026-11-20 scheiterte dieser Check direkt nach dem Deploy mit
 * `fetch failed`, während derselbe Check von Hand sofort grün war.
 *
 * Wiederholt werden nur Transportfehler (DNS, Reset, Timeout) und 502/503/504 –
 * also Antworten, die ein gerade ausrollender Proxy liefert. Fachliche
 * Abweichungen (200 mit falschem Cache-Header) werden weiterhin sofort geprüft
 * und gemeldet, nicht wiederholt.
 */
const ATTEMPTS = 4;
const RETRY_DELAYS_MS = [1_500, 3_000, 5_000];

function describe(error) {
  if (!(error instanceof Error)) return String(error);
  const code = error.cause?.code;
  return code ? `${error.message} (${code})` : error.message;
}

function isTransientStatus(status) {
  return status === 502 || status === 503 || status === 504;
}

async function fetchPage(url, cookie) {
  const headers = { accept: "text/html" };
  if (cookie) headers.cookie = cookie;

  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
      if (!isTransientStatus(response.status) || attempt === ATTEMPTS) return response;
      // Body leeren, damit der Socket frei wird, bevor der nächste Versuch startet.
      await response.text().catch(() => "");
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < ATTEMPTS) {
      const delay = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
      console.error(
        `[staging-cache] transient failure on attempt ${attempt}/${ATTEMPTS} (${describe(lastError)}) – retrying in ${delay / 1000}s`,
      );
      await wait(delay);
    }
  }

  throw new Error(
    `[staging-cache] request failed after ${ATTEMPTS} attempts: ${describe(lastError)}`,
  );
}

async function main() {
  const first = await fetchPage(anonymousUrl);
  const firstBody = await first.text();
  assert(first.status === 200, `anonymous request returned HTTP ${first.status}`);
  assert(cacheControl(first).includes("public"), "anonymous response is not public");
  assert(vary(first).includes("cookie"), "anonymous response does not vary by Cookie");
  const firstDate = first.headers.get("date");
  assert(firstDate, "anonymous response has no Date header");

  await wait(2_100);
  const second = await fetchPage(anonymousUrl);
  const secondBody = await second.text();
  assert(second.status === 200, `cached request returned HTTP ${second.status}`);
  assert(cacheControl(second).includes("public"), "cached response is not public");
  const secondDate = second.headers.get("date");
  assert(secondDate, "cached response has no Date header");
  assert(secondDate === firstDate, "anonymous response was not served from cache");
  assert(secondBody === firstBody, "cached response body changed");

  console.log(`[staging-cache] anonymous cache hit: Date=${firstDate}`);

  const firstSession = await fetchPage(sessionUrl, sessionCookie);
  await firstSession.text();
  assert(firstSession.status === 200, `session request returned HTTP ${firstSession.status}`);
  assert(cacheControl(firstSession).includes("private"), "session response is not private");
  assert(!cacheControl(firstSession).includes("public"), "session response is public");
  const firstSessionDate = firstSession.headers.get("date");
  assert(firstSessionDate, "session response has no Date header");

  await wait(2_100);
  const secondSession = await fetchPage(sessionUrl, sessionCookie);
  await secondSession.text();
  assert(secondSession.status === 200, `second session request returned HTTP ${secondSession.status}`);
  assert(cacheControl(secondSession).includes("private"), "second session response is not private");
  const secondSessionDate = secondSession.headers.get("date");
  assert(secondSessionDate, "second session response has no Date header");
  assert(
    secondSessionDate !== firstSessionDate,
    "session response was cached instead of bypassing the cache",
  );

  console.log(
    `[staging-cache] session bypass: Date ${firstSessionDate} -> ${secondSessionDate}`,
  );
  console.log("[staging-cache] anonymous hit and session bypass verified");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
