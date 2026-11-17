# Public HTML cache allowlist audit

Date: 2026-11-17

Scope: every path in `PUBLIC_CACHE_PATHS` in
`scripts/public-html-cache-proxy.mjs`, plus the shared public layout and the
forms on cached pages.

## Decision

The staging allowlist remains enabled. The current pages contain no
per-request CSRF token, no CSP nonce and no content derived from request
headers or geo data. No allowlist or proxy change was needed.

This audit covers the staging cache only. Production still runs the Next server
directly and has no `ENABLE_PUBLIC_HTML_CACHE` setting.

## What was checked

- every allowlisted page under `src/app`;
- `src/app/layout.tsx`, `src/components/site-nav.tsx` and the shared footer;
- the client forms on `/contact`, `/widerruf` and `/kuendigung`;
- the form APIs and their validation;
- `next.config.ts` security headers;
- every use of `cookies()`, `headers()`, `searchParams` and client IP helpers;
- the proxy cache key, session bypass and `Set-Cookie` handling.

Commands used for the source review:

```bash
rg -n 'from "next/headers"|headers\(\)|nonce|csrf|searchParams|x-forwarded|cf-ipcountry' src
rg -n 'useRef|Date\.now|renderedAt' src/components/*form*.tsx
rg -n 'getSessionUser|isStaff|searchParams|process\.env|env\.' \
  src/app/page.tsx src/app/premium/page.tsx src/app/download/page.tsx \
  src/app/faq/page.tsx src/app/contact/page.tsx src/app/widerruf/page.tsx \
  src/app/kuendigung/page.tsx
```

## Findings

| Risk | Result |
| --- | --- |
| Per-request CSRF token in cached HTML | None. The three public forms are client components. They send a JSON request to `/api/contact`, `/api/withdrawal` or `/api/cancellation`; the APIs use `isSameOrigin`, rate limits and a honeypot. No server-rendered hidden token exists. |
| CSP nonce in cached HTML | None. `next.config.ts` sets static security headers only; no `Content-Security-Policy` and no nonce is generated. |
| Header-dependent content | None in the cached pages or shared layout. No public page/layout calls `headers()`. `client-ip.ts` reads `x-forwarded-for` only in API routes for rate limiting and audit data. |
| Geo-dependent content | None found. There is no country, currency or IP-country lookup in the public pages. Operator and product data come from process environment/static content. |
| Session-specific content | `/` and `/premium` pass `getSessionUser()` into the navigation/CTA, and the shared layout renders the signed-in navigation. Any request with a `sh_session` cookie bypasses the cache completely, so only the logged-out HTML can be stored. |
| Locale-dependent content | `getI18n()` reads the `sh_locale` cookie and a cookie named `accept-language` (not the HTTP `Accept-Language` header). The proxy key includes the full `Cookie` header and the response carries `Vary: Cookie`. |
| Query-dependent content | `/faq?category=...` reads `searchParams`. The proxy key includes the complete request URL, so category variants do not share an entry and are only public FAQ content. |
| `Host`-dependent content | The cache key includes `Host`. Public metadata uses `APP_URL`, not the request host. No cached page renders a request-derived absolute URL. |
| `Set-Cookie` / session response | The proxy never publishes a response with `Set-Cookie`; session requests never enter the lookup path. Covered by `npm run test:public-cache`. |
| Per-request timestamp in a form | The contact, withdrawal and cancellation forms create `renderedAt` with `useRef(Date.now())` in the browser. It is not embedded in the server-rendered HTML, so a cached page cannot stale the anti-bot check. |

## Residual risks and re-audit triggers

Re-run this audit and update the cache policy if any of the following is added:

- a new path to `PUBLIC_CACHE_PATHS`;
- a server-rendered CSRF/XSRF token or a server action on a cached page;
- a per-request CSP nonce or any nonce-based header;
- A/B testing, geo/currency lookups, personalization, or any other `headers()`
  read in a cached page or the shared layout;
- a new cookie that changes public HTML but is not covered by the existing
  cookie-keyed policy;
- a change to Next.js that changes the dynamic HTML or header behavior.

A CSP with per-request nonces is incompatible with this proxy as written: it
must either bypass the cache or obtain the nonce from a shared edge-generated
source that is part of the cache contract. Do not add a nonce-based CSP and
assume the existing cache remains safe.

The 60-second cache lifetime also means admin content changes on `/`, `/premium`
and `/faq` can be visible slightly later on staging. That is a freshness
trade-off, not a data-isolation issue.
