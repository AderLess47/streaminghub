# StreamingHub

Website, customer portal and admin console for the StreamingHub IPTV player
(Fire TV, Android TV, Android phones/tablets).

StreamingHub is a **technical media player only**. The product does not provide
channels, films, series, playlists or any other streaming content; customers
import their own lawfully accessible sources.

- Domain: `https://streaminghub.org`
- Support: `service@streaminghub.org`
- Premium: **2,49 € / Monat (Endpreis; keine USt. gemäß § 19 UStG)**

## Stack

| Area | Implementation |
| --- | --- |
| Framework | Next.js 15 (App Router), React 19, TypeScript (strict) |
| Styling | Tailwind CSS v4 with a custom design-token layer (`src/app/globals.css`) |
| Database | SQLite via Node's built-in `node:sqlite` (relational schema in `src/lib/schema.ts`) |
| Auth | scrypt password hashes, opaque session tokens (SHA-256 stored), HTTP-only cookies |
| MFA | RFC 6238 TOTP + one-time recovery codes for `support`/`admin` roles |
| Validation | Zod schemas shared by every form and API route |
| Rate limiting | SQLite fixed-window limiter (`src/lib/rate-limit.ts`) |
| i18n | Central dictionaries (`src/i18n`) with `de`/`en` complete, 6 more scaffolded |
| Payments | Stripe-compatible adapter with server-side webhook confirmation (not configured) |
| Email | Resend-compatible HTTP adapter + admin outbox fallback |

## Quick start

```bash
npm ci
cp .env.example .env.local     # then set ADMIN_EMAIL / ADMIN_PASSWORD
npm run dev                    # http://localhost:3000
```

The database file is created automatically (`data/streaminghub.db`), including
schema, FAQ seed and the initial administrator. `npm run db:init` only creates
the schema; content seeds on first request.

Production:

```bash
npm run build
npm start                      # or: docker build -t streaminghub . && docker run -p 3000:3000 -v sh-data:/app/data streaminghub
```

Local review credentials live in the git-ignored `.env.local` (seeded admin).
Never reuse them outside local development.

## Android release

1. Bump `versionCode` and `versionName` in `android/app/build.gradle.kts`.
2. Configure Cloudflare R2 credentials once: either set
   `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` (R2 Object Read & Write
   for `streaminghub-downloads`) in the shell or in the git-ignored
   `.env.release`, or run `npx wrangler login`.
3. Run `npm run release:apk`.

The command builds the signed release APK, verifies the signature, uploads
`streaminghub-<version>.apk` to R2, verifies the public URL and SHA-256, and
updates `src/content/release.ts`, `fly.toml`, `.env.example` and `.env.local`.
Use `--apk <path>` to publish an existing APK or `--dry-run` to validate without
uploading or writing. For production, publish the same values as Fly secrets
(`APK_VERSION`, `APK_VERSION_CODE`, `APK_FILE_NAME`, `APK_SHA256`,
`APK_SIZE_BYTES`, `APK_URL`) or run the release workflow, which does it for you.

### GitHub Actions release

`.github/workflows/android-release.yml` is a manual release workflow
(**Actions → Android release → Run workflow**). It builds and verifies the APK,
uploads it to R2, and publishes the release metadata as Fly secrets
(`APK_VERSION`, `APK_VERSION_CODE`, `APK_FILE_NAME`, `APK_SHA256`,
`APK_SIZE_BYTES`, `APK_URL`). `src/lib/android-release.ts` reads them at request
time and falls back to the generated `src/content/release.ts`, so a new APK goes
live without a commit and without a deploy. The workflow needs `contents:
write`, `pull-requests: write` and `FLY_API_TOKEN`; branch protection stays
enabled throughout. A final step polls `https://streaminghub.org/download` until
the new version is served, then parks the regenerated metadata on the stable
`release/metadata-sync` branch and keeps a single **draft pull request** open,
so syncing the repository is one merge. Pull requests created with
`GITHUB_TOKEN` start no workflows, so that draft carries no `Typecheck and
tests` check and has to be merged by an administrator (the bypass); this needs
the repository setting *Allow GitHub Actions to create and approve pull
requests*.

### Keeping the local fallback current

`src/content/release.ts` is only used when the `APK_*` variables are absent
(local builds, a fresh deployment). `npm run release:sync` refreshes it from the
production endpoint `GET /api/release`, and `--check` exits non-zero when it
lags behind. `npm run dev` and `npm run build` run the sync best-effort first,
so a checkout or image never carries metadata older than what was live when it
was built; if the endpoint is unreachable the committed file stays untouched.
The sync deliberately never writes to Git: branch protection rejects automated
commits to `main`, and a pull request created with `GITHUB_TOKEN` cannot satisfy
the required check, because such events start no workflows.

Configure these repository or `production` environment secrets:

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account containing the R2 bucket |
| `CLOUDFLARE_API_TOKEN` | R2 Object Read & Write for `streaminghub-downloads` |
| `FLY_API_TOKEN` | Deploy token from `flyctl tokens create deploy -a streaminghub-org` |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 android/keystore/streaminghub-release.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | Password for the release keystore |
| `ANDROID_KEY_ALIAS` | Key alias inside the release keystore |
| `ANDROID_KEY_PASSWORD` | Password for the release key |

Never commit these values. The workflow checks all seven secrets before it
starts building.

## Routes

**Public:** `/` · `/premium` · `/download` · `/activate` · `/help` · `/faq` ·
`/contact` · `/status` · `/docs/api` · `/imprint` · `/privacy` · `/terms` ·
`/subscription-terms` · `/withdrawal`

**Auth:** `/login` · `/register` · `/forgot-password` · `/reset-password?token=…`

**Customer portal (protected):** `/dashboard` (devices, pairing, overview) ·
`/dashboard/subscription` · `/dashboard/support` · `/dashboard/support/[id]` ·
`/dashboard/settings`

**Admin (protected, MFA):** `/admin` · `/admin/customers` · `/admin/customers/[id]` ·
`/admin/devices` · `/admin/subscriptions` · `/admin/pairing` · `/admin/tickets` ·
`/admin/emails` · `/admin/content` · `/admin/roles` · `/admin/status` · `/admin/audit`

**App API:** `POST /api/v1/pairing/request` · `GET /api/v1/pairing/status` ·
`GET /api/v1/me` (see `/docs/api` and `/api/v1/openapi.json`)

## Implementation status

### Fully functional

- Public marketing pages (German + English, responsive, SEO metadata, sitemap, robots)
- Registration, sign-in, sign-out, email verification tokens, password reset
- Session security, rate limits, audit logging, account settings
- Device pairing codes (single use, 10 min TTL, attempt limits, IP/account limits)
- Device list, activation date, unlinking, device limits by plan
- Support tickets with customer replies and staff replies
- GDPR data export (JSON) and deletion requests
- Admin console with RBAC (`customer` / `support` / `admin`), TOTP MFA,
  customer/device/subscription oversight, pairing code blocking, FAQ and
  announcement editing, email outbox, security log, status checks
- Live system status page (real checks; no invented uptime figures)
- Cookie consent banner; no optional trackers are loaded

### Prepared integration points (NOT active)

| Integration | State | What is required |
| --- | --- | --- |
| Payment provider (Stripe) | Checkout, signed webhooks, status mapping, cancellation and server-side success confirmation implemented and stub-tested; **configured** | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`; 2,49 € final price (no VAT under § 19 UStG); webhook at `/api/webhooks/stripe` |
| Android app distribution | Signed APK served from Cloudflare R2; current version, size and SHA-256 come from `src/content/release.ts` | Amazon Appstore listing / future signed releases |
| Amazon In-App Purchasing | Channel modelled and separated from web | Amazon IAP in the app + store reconciliation process |
| App ↔ website API | Endpoints live and tested | Client implementation in the StreamingHub app |
| Transactional email | Provider adapter, outbox, retry, delivery webhook and bounce/complaint suppression implemented and stub-tested | `EMAIL_API_KEY`, verified sending domain, `EMAIL_WEBHOOK_SECRET` |
| Appme account SSO | **Not integrated** | Appme issuer URL, client ID/secret, scopes, redirect URI and API documentation |
| VPN / proxy premium feature | Labelled "in development" | Product implementation, privacy review, activation |
| Cross-device resume | Labelled "in development" | Product implementation |

Payment UI never reports success without a server-side provider confirmation;
without keys the checkout returns HTTP 503 and states that no payment occurred.

## Security notes

- Passwords: scrypt (N=16384, r=8, p=1) with per-user salt; constant-time compare.
- Sessions: 32-byte opaque tokens, only SHA-256 hashes stored, HTTP-only +
  SameSite=Lax cookies, `Secure` in production, revocable per user.
- Pairing codes: 8 chars from an unambiguous alphabet, stored as SHA-256 only,
  10-minute TTL, single use, max 5 attempts, rate limited.
- Every state-changing route rejects foreign `Origin` headers and is CSRF-safe
  through SameSite cookies; server actions rely on Next.js origin checks.
- Admin access requires role **and** confirmed MFA; role changes are audited and
  the last administrator cannot be demoted.
- Security headers (HSTS, nosniff, frame options, referrer policy) in `next.config.ts`.
- Secrets are read server-side only; nothing sensitive is exposed to the browser.

## Verification

```bash
npm run typecheck
npm run build
npm start &                    # then:
npm run smoke                  # end-to-end checks against http://127.0.0.1:3000
```

`scripts/smoke-test.mjs` covers public pages, registration, dashboard access,
pairing code issuance/claim/status, device token access, contact form, data
export, checkout "not configured" behaviour, role-protected admin redirects and
the full admin flow including TOTP. `npm run email:smoke` exercises the mail
pipeline (HTML/text payload, retry on provider failure, signed delivery webhook)
against a local stub provider — see `docs/DEPLOYMENT.md` §6.5. With real Resend
test keys, `npm run email:resend-test` checks the official simulated recipients.
`npm run stripe:smoke` exercises checkout, signed webhooks, past-due mapping,
cancellation, idempotency and session ownership against a local Stripe stub;
`npm run stripe:live-test` validates a real test-mode Checkout Session.
Email-verification- and reset-link checks
run against `next dev` (where `SHOW_DEV_EMAIL_LINKS=1` exposes the link); in a
production server those two checks are skipped, since dev links are withheld.

## Documentation

- `docs/DEPLOYMENT.md` – hosting, HTTPS, DNS, environment, provider setup, backups
- `docs/API.md` – app integration contract
- `/docs/api` – rendered API documentation + OpenAPI 3.1 JSON

## Legal content disclaimer

The legal texts (`src/content/legal.ts`, `/imprint`) are prepared for a German
digital service and contain clearly marked placeholders for operator data that
was not provided. They are not legal advice and must be reviewed by a lawyer
before publication. No company, register or VAT data was invented.
