import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import {
  createPublicCacheProxy,
  hasSessionCookie,
  isPublicCachePath,
} from "./public-html-cache-proxy.mjs";

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", resolve);
    server.once("error", reject);
  });
  return server.address().port;
}

async function close(server) {
  await new Promise((resolve) => server.close(resolve));
}

function get(port, pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      { hostname: "127.0.0.1", port, path: pathname, headers },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    request.on("error", reject);
  });
}

test("public cache policy only includes anonymous content pages", () => {
  assert.equal(isPublicCachePath("/"), true);
  assert.equal(isPublicCachePath("/faq/"), true);
  assert.equal(isPublicCachePath("/status"), false);
  assert.equal(isPublicCachePath("/dashboard"), false);
  assert.equal(isPublicCachePath("/login"), false);
  assert.equal(hasSessionCookie("sh_locale=en; sh_session=abc"), true);
  assert.equal(hasSessionCookie("sh_locale=en"), false);
  assert.equal(hasSessionCookie("sh_session"), true);
  assert.equal(hasSessionCookie("sh_session_extra=abc"), false);
});

test("anonymous public HTML is cached and session requests bypass it", async (t) => {
  let upstreamHits = 0;
  const upstream = http.createServer((_request, response) => {
    upstreamHits += 1;
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate",
      vary: "rsc, next-router-state-tree",
    });
    response.end("<html>public shell</html>");
  });
  const upstreamPort = await listen(upstream);
  const proxy = createPublicCacheProxy({ upstreamPort });
  const proxyPort = await listen(proxy);
  t.after(async () => {
    await close(proxy);
    await close(upstream);
  });

  const first = await get(proxyPort, "/", { accept: "text/html" });
  assert.equal(first.status, 200);
  assert.match(first.headers["cache-control"], /^public,/);
  assert.match(first.headers.vary, /Cookie/);
  assert.match(first.body, /public shell/);
  assert.equal(upstreamHits, 1);

  const second = await get(proxyPort, "/", { accept: "text/html" });
  assert.equal(second.body, first.body);
  assert.equal(upstreamHits, 1, "second anonymous request should be a cache hit");

  const withSession = await get(proxyPort, "/", {
    accept: "text/html",
    cookie: "sh_session=fake",
  });
  assert.match(withSession.headers["cache-control"], /private/);
  assert.equal(upstreamHits, 2, "session response must reach the upstream");

  const afterSession = await get(proxyPort, "/", { accept: "text/html" });
  assert.equal(afterSession.body, first.body);
  assert.equal(upstreamHits, 2, "the anonymous entry remains separate from the session request");

  const dashboard = await get(proxyPort, "/dashboard", { accept: "text/html" });
  assert.match(dashboard.headers["cache-control"], /private/);
  assert.equal(upstreamHits, 3, "non-public paths are never cached");

  const rsc = await get(proxyPort, "/", { accept: "text/html", rsc: "1" });
  assert.equal(rsc.status, 200);
  assert.equal(upstreamHits, 4, "RSC requests bypass the HTML cache");
});

test("responses that set cookies are never cached", async (t) => {
  let upstreamHits = 0;
  const upstream = http.createServer((_request, response) => {
    upstreamHits += 1;
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "set-cookie": "sh_session=should-not-be-shared; HttpOnly; Path=/",
    });
    response.end("<html>session response</html>");
  });
  const upstreamPort = await listen(upstream);
  const proxy = createPublicCacheProxy({ upstreamPort });
  const proxyPort = await listen(proxy);
  t.after(async () => {
    await close(proxy);
    await close(upstream);
  });

  const first = await get(proxyPort, "/", { accept: "text/html" });
  assert.match(first.headers["cache-control"], /private/);
  const second = await get(proxyPort, "/", { accept: "text/html" });
  assert.match(second.headers["cache-control"], /private/);
  assert.equal(upstreamHits, 2, "Set-Cookie responses must not enter the public cache");
});

test("cookie variants do not share an anonymous cache entry", async (t) => {
  let upstreamHits = 0;
  const upstream = http.createServer((_request, response) => {
    upstreamHits += 1;
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
    });
    response.end(`<html>${upstreamHits}</html>`);
  });
  const upstreamPort = await listen(upstream);
  const proxy = createPublicCacheProxy({ upstreamPort });
  const proxyPort = await listen(proxy);
  t.after(async () => {
    await close(proxy);
    await close(upstream);
  });

  await get(proxyPort, "/", { accept: "text/html", cookie: "sh_locale=de" });
  await get(proxyPort, "/", { accept: "text/html", cookie: "sh_locale=en" });
  assert.equal(upstreamHits, 2, "different locale cookies need different entries");
  await get(proxyPort, "/", { accept: "text/html", cookie: "sh_locale=de" });
  assert.equal(upstreamHits, 2, "the German entry should still be cached");
});
