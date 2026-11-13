# Deployment guide – streaminghub.org

The application needs a **Node.js server with a persistent filesystem** because
it uses SQLite (`node:sqlite`) for sessions, devices and subscriptions.
Static-only hosts, Vercel/Netlify serverless functions and Cloudflare Workers are
therefore not suitable without replacing the data layer (see "Scaling" below).

## 1. Requirements

- Node.js **22.5+** (tested on Node 26); `node:sqlite` is built in
- ~200 MB RAM, 1 vCPU is enough for the expected load
- Persistent volume mounted at `/app/data` (or `DATABASE_PATH`)
- Reverse proxy with TLS (Caddy, nginx, Traefik)

## 2. Build and start

```bash
npm ci
npm run build
NODE_ENV=production APP_URL=https://streaminghub.org npm start
```

Or via Docker:

```bash
docker build -t streaminghub .
docker run -d --name streaminghub \
  -p 127.0.0.1:3000:3000 \
  -v streaminghub-data:/app/data \
  --env-file .env.production \
  streaminghub
```

The container binds `0.0.0.0:3000`; keep it behind the reverse proxy.

## 3. Environment

See `.env.example`. Required for production:

| Variable | Purpose |
| --- | --- |
| `APP_URL` | `https://streaminghub.org` (email links, canonical URLs) |
| `DATABASE_PATH` | e.g. `/app/data/streaminghub.db` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Initial admin, created once on first start – then remove from env |
| `SESSION_DAYS` | Session lifetime (default 30) |
| `EMAIL_API_KEY`, `EMAIL_FROM` | Transactional mail (Resend); without them mail stays in the outbox |
| `EMAIL_WEBHOOK_SECRET` | Svix signing secret for delivery events (`/api/webhooks/resend`) |

Operational variables for the legal notice (`OPERATOR_*`) and support address
must be filled before publishing. Placeholders are visible otherwise.

## 4. HTTPS, DNS and redirects

Only after DNS access is confirmed and the existing records have been inspected:

1. Point `A`/`AAAA` (or `CNAME`) for `streaminghub.org` to the host – do **not**
   overwrite existing MX/TXT records. Check with `dig streaminghub.org ANY`.
2. Issue a certificate (Caddy example):

```caddy
streaminghub.org {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
        X-Content-Type-Options nosniff
    }
}
```

3. Redirect `www` → apex (or the reverse) with a permanent 301.
4. Verify: `curl -I https://streaminghub.org` → 200, valid certificate, HSTS set.
5. Submit `https://streaminghub.org/sitemap.xml` in Google Search Console.

The app already sends HSTS and security headers; the proxy only needs TLS and
HTTP→HTTPS redirects.

## 5. Billing (Stripe)

The web checkout is implemented but **disabled without keys**. Subscription
state is only written after a verified webhook or a server-side Stripe lookup –
never from the browser.

### 5.1 Setup

1. Create a recurring monthly price of **2,49 € (final price)** in Stripe:
   interval `month`, currency `EUR`. The operator uses the German small
   business regulation (§ 19 UStG), so no VAT is added. Copy the price id
   (`price_...`).
2. Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`.
3. Add the webhook endpoint `https://streaminghub.org/api/webhooks/stripe` for
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.paid` and `invoice.payment_failed`.
4. Checkout redirects to `/dashboard/subscription?checkout=success&session_id=...`.
   The server fetches that session from Stripe, verifies it belongs to the
   signed-in user and only then advances the local status. The webhook remains
   authoritative for renewals, dunning and cancellations.
5. Cancellation uses `cancel_at_period_end=true`; access stays active until the
   period end and the deletion webhook ends it. Amazon subscriptions are
   rejected here and must be cancelled in the Amazon account.
6. Events are stored in `subscription_events` with a unique provider event id,
   so retries and duplicate deliveries are idempotent. Signatures (`t=`, `v1=`)
   are verified with a 5-minute tolerance.

`STRIPE_API_BASE` exists only for a Stripe-compatible proxy or the local test
stub; leave it unset in production.

### 5.2 Test mode

```bash
cp .env.stripe-test.example .env.stripe-test   # fill in sk_test_..., price_...
set -a; . ./.env.stripe-test; set +a
npm run dev

# second terminal, same variables:
set -a; . ./.env.stripe-test; set +a
npm run stripe:live-test
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

`stripe:live-test` creates a real test-mode Checkout Session through the app and
verifies mode, currency, 2,49 € amount, monthly interval and the success URL via
the Stripe API. Complete the payment manually with test card
`4242 4242 4242 4242` (failed payment: `4000 0000 0000 0341`), then confirm in
**Dashboard → Abonnement** and in the webhook log. The script refuses live keys
unless `ALLOW_LIVE_STRIPE=1` is set.

Without any keys, the full flow can be exercised locally against a Stripe API
stub: start the app with `STRIPE_SECRET_KEY=sk_test_stub`,
`STRIPE_PRICE_ID=price_stub`, `STRIPE_WEBHOOK_SECRET=whsec_stub_secret` and
`STRIPE_API_BASE=http://127.0.0.1:4026`, then run:

```bash
STRIPE_WEBHOOK_SECRET=whsec_stub_secret STRIPE_PRICE_ID=price_stub npm run stripe:smoke
```

It
covers checkout creation, signed webhooks, past-due mapping, invoice payment,
cancellation, idempotency, forged signatures and session-ownership checks.

**Amazon Appstore:** external payment prompts are not allowed in the app. The
`subscriptions.channel` field separates `amazon` from `web`; Amazon purchases
must be reconciled via the admin "Subscriptions" page (audited) or a future
Amazon RVS/notification job. Never link from an Amazon build to the web checkout.

## 6. Email (transactional delivery)

The app sends verification, password-reset, contact and support mails through a
Resend-compatible HTTP API (`src/lib/mail.ts`). Every message is persisted in
`outbox_emails` first, so **Admin → Email outbox** always shows what was
generated, including failures and retry attempts.

### 6.1 Provider setup

1. Create a Resend account and add `streaminghub.org` as a sending domain.
2. Add the DNS records Resend shows (SPF `TXT`, DKIM `TXT`, and the `MX`/`TXT`
   records for the sending subdomain, usually `send`). Do not overwrite existing
   MX records for the root domain — inspect them first.
3. Wait for “Verified”, then create an API key with sending permission.
4. Set on the server:

```bash
EMAIL_API_KEY=re_...                       # server-side only, never in the repo
EMAIL_FROM="StreamingHub <service@streaminghub.org>"
EMAIL_REPLY_TO=service@streaminghub.org
EMAIL_WEBHOOK_SECRET=whsec_...             # from the webhook endpoint settings
```

`EMAIL_PROVIDER=resend` is the default; `RESEND_API_KEY` is still accepted as a
legacy alias. `EMAIL_API_BASE` and `EMAIL_TIMEOUT_MS` exist for staging proxies
and tests.

### 6.2 Delivery webhook

Add the endpoint `https://streaminghub.org/api/webhooks/resend` in Resend and
subscribe to `email.sent`, `email.delivered`, `email.delivery_delayed`,
`email.bounced`, `email.complained` and `email.failed`. Put the signing secret in
`EMAIL_WEBHOOK_SECRET`. Requests are verified with the Svix HMAC signature and a
5-minute timestamp tolerance; without the secret the endpoint answers 503, with
an invalid signature 401. Events update `outbox_emails.provider_status`
(`delivered`, `bounced`, …) for the matching provider message id.

### 6.3 Behaviour without configuration

Without `EMAIL_API_KEY`, mails stay `queued` in the outbox and the UI never
claims delivery. `SHOW_DEV_EMAIL_LINKS=1` exposes verification/reset links in the
UI; it is ignored when `NODE_ENV=production`, but keep it `0` there regardless.

### 6.4 Suppression list (bounces and complaints)

Hard bounces and spam complaints add the recipient to `email_suppressions`.
Before every provider call the outbox checks this list; suppressed messages are
stored with status `suppressed` and never reach the provider. Temporary bounces
are recorded but not suppressed. Administrators can review and release entries
in **Admin → Email outbox → Gesperrte Adressen** (audited). Resend maintains its
own suppression list as well; our list keeps the decision inside the app even if
the provider changes.

### 6.5 Local pipeline test (no real mail)

`scripts/email-smoke.mjs` starts a local stub provider and verifies success,
retry on provider errors, HTML/text payload, signed webhook events, bounce and
complaint suppression — including that a suppressed address never reaches the
provider:

```bash
# terminal 1 – app pointed at the stub
EMAIL_API_KEY=test EMAIL_API_BASE=http://127.0.0.1:4025 \
EMAIL_WEBHOOK_SECRET=whsec_MDEyMzQ1Njc4OWFiY2RlZg== npm run dev

# terminal 2
EMAIL_WEBHOOK_SECRET=whsec_MDEyMzQ1Njc4OWFiY2RlZg== npm run email:smoke
```

### 6.6 Live test with real Resend test keys

Use the official simulated recipients so no real person receives mail:
`delivered@resend.dev`, `bounced@resend.dev`, `complained@resend.dev`
(label suffixes such as `delivered+run1@resend.dev` are supported).

```bash
cp .env.email-test.example .env.email-test   # add key + sender, keep it untracked
set -a; . ./.env.email-test; set +a
npm run dev
# second terminal, same variables:
set -a; . ./.env.email-test; set +a
npm run email:resend-test
```

The script creates labelled test accounts, triggers real verification mails
through the app, reads the provider message id from the outbox and polls the
Resend API until it reports `delivered`, `bounced` or `complained`. Without a key
it exits with code 2 and a clear message. Real webhook delivery additionally
requires a publicly reachable `/api/webhooks/resend` and the signing secret; the
processing itself is covered by the local test above.

Failed outbox entries can be retried by an administrator in the outbox view
(each attempt is audited). Delivery itself is never faked: the outbox shows
`failed` with the provider’s HTTP error.

## 7. Backups and retention

The production container starts `scripts/backup-db.mjs` shortly after startup
and then every 24 hours. It creates a consistent online copy with SQLite's
`VACUUM INTO`, verifies the copy with `PRAGMA integrity_check`, writes
`streaminghub-<timestamp>.db` to `/app/data/backups`, and deletes backups older
than 30 days. The backup loop runs alongside the web server and never prevents
the app from starting.

Defaults can be overridden with:

| Variable | Default |
| --- | --- |
| `BACKUP_DIR` | `/app/data/backups` |
| `BACKUP_RETENTION_DAYS` | `30` |
| `BACKUP_INITIAL_DELAY_SECONDS` | `120` |
| `BACKUP_INTERVAL_SECONDS` | `86400` |

Run a backup manually in the container:

```bash
docker exec <container> node /app/scripts/backup-db.mjs
# or on Fly:
fly ssh console --user nextjs --app streaminghub-org -C "node /app/scripts/backup-db.mjs"
```

Backups in `/app/data/backups` live on the same Fly volume as the database and
protect against application/database corruption, not loss of the volume. Create
a Fly volume snapshot for an additional point-in-time copy, and copy backups to
object storage (for example Cloudflare R2) if off-site disaster recovery is
required:

```bash
fly volumes snapshots create vol_42k2gkdelj0xj904 --app streaminghub-org
```

Test a restore by copying a backup to a temporary path, opening it with SQLite
and running `PRAGMA integrity_check`; never overwrite the live database without
a maintenance window. Logs/audit retention: 90 days for `audit_log`, 30 days for
server logs, support tickets 24 months; admin-managed M3U URLs until account
deletion or removal. The privacy policy documents these periods.

## 8. Scaling

The rate limiter and sessions live in SQLite, so run **one** app instance.
For multiple instances:

- move sessions, rate limits and audit to PostgreSQL/Redis,
- replace `src/lib/db.ts` with a PostgreSQL client (Drizzle/Prisma) and port the
  SQL in `src/lib/schema.ts`,
- move file-based SQLite backups to database snapshots.

## 9. Appme account integration (checked – not implemented)

No Appme API documentation, issuer metadata, client credentials or callback
rules were provided with this project, so **no Appme login interface was
implemented or invented**. A safe integration needs:

- OIDC issuer/discovery URL or SAML metadata,
- client ID and secret (or PKCE public client),
- allowed redirect URIs and scopes/claims for email + subject,
- confirmation whether accounts may be linked by verified email.

Once available, the clean insertion points are `src/app/api/auth/login/route.ts`
(add an OIDC authorization-code flow) and the `users` table (store
`appme_subject` as an additional unique identity, keeping roles local).

## 10. Operations checklist

- [ ] `ADMIN_PASSWORD` changed/removed after first start
- [ ] MFA enrolled for every staff account
- [ ] Operator data and legal review completed
- [ ] TLS, HSTS and www redirect verified
- [ ] Backups scheduled and restore tested
- [ ] Payment + email providers configured (or intentionally left disabled)
- [ ] `APP_URL` matches the live domain
- [ ] Rate limits reviewed for expected traffic
- [ ] Amazon IAP secrets set and the daily sync green (once Fire TV IAP is live)

## 11. Amazon IAP sync

Amazon subscriptions are kept current in two ways: Real-Time Notifications push
every purchase, renewal and cancellation to `/api/webhooks/amazon/rtn`, and a
daily pull re-verifies receipts near their renewal date as a fallback. The pull
run is `npm run amazon:sync`, which calls the token-protected
`POST /api/internal/amazon-sync` on the deployed app.

`.github/workflows/amazon-sync.yml` runs it daily at 04:41 UTC and on demand via
*Actions → Amazon IAP sync → Run workflow*. Without `AMAZON_SYNC_TOKEN` the job
skips with a notice instead of failing, so the schedule stays quiet until IAP is
live.

### 11.1 Secrets

| Variable | Where | Purpose |
| --- | --- | --- |
| `AMAZON_RVS_SHARED_SECRET` | Fly secret | Shared key from the Developer Console (*Shared Key*), used by RVS |
| `AMAZON_RVS_BASE` | Fly env (optional) | Defaults to `https://appstore-sdk.amazon.com` |
| `AMAZON_RVS_SANDBOX` | Fly env (optional) | `1` while testing with App Tester (RVS Cloud Sandbox) |
| `AMAZON_IAP_SKU` | Fly env (optional) | Defaults to `premium_monthly`; must match the console IAP item |
| `AMAZON_RTN_TOPIC_ARN` | Fly env | SNS topic from the Real-Time Notifications registration; leave empty during registration (§ 11.5) |
| `AMAZON_SYNC_TOKEN` | Fly secret **and** GitHub Actions secret | Shared token for the internal sync endpoint (`openssl rand -hex 32`) |

The easiest path needs no local tooling: add the values under *GitHub → Settings
→ Secrets and variables → Actions* as `AMAZON_RVS_SHARED_SECRET`,
`AMAZON_SYNC_TOKEN` (and later `AMAZON_RTN_TOPIC_ARN`), then run *Actions →
Configure Amazon secrets → Run workflow*. That workflow copies them to Fly with
the existing `FLY_API_TOKEN` and prints only their names.

```bash
# Alternative from a machine that has flyctl and gh:
TOKEN=$(openssl rand -hex 32)
flyctl secrets set AMAZON_RVS_SHARED_SECRET=… AMAZON_SYNC_TOKEN="$TOKEN" -a streaminghub-org
printf '%s' "$TOKEN" | gh secret set AMAZON_SYNC_TOKEN   # same value as the Fly secret
```

Keep `AMAZON_SYNC_TOKEN` identical in both places – the app rejects any other
value, and a mismatch shows up as `403 forbidden` in the workflow log. Never put
these values in the repository, in `fly.toml` or in the chat.

### 11.6 App Store (iOS, iPadOS, macOS)

The Apple app sends its StoreKit transaction to `/api/v1/apple/purchase`; the
server verifies the signature chain against Apple Root CA G3. **No secret is
needed** – Apple's certificates are public and the root ships in
`src/lib/apple-root-ca.ts`.

| Variable | Where | Purpose |
| --- | --- | --- |
| `APPLE_IAP_BUNDLE_ID` | Fly env | Bundle id of the app, e.g. `org.streaminghub.app`. Without it the endpoint answers `503`, so a test deployment never accepts real receipts |
| `APPLE_IAP_PRODUCT_ID` | Fly env (optional) | Defaults to `premium_monthly`; must match the product in App Store Connect |
| `APPLE_IAP_ALLOW_SANDBOX` | Fly env (optional) | `1` only while testing with a sandbox account or TestFlight. Leave it unset in production |

```bash
flyctl secrets set APPLE_IAP_BUNDLE_ID=org.streaminghub.app -a streaminghub-org
```

These are not secrets; they can also live in `fly.toml` under `[env]`.

Then paste the endpoint into *App Store Connect → App Information → App Store
Server Notifications*: `https://streaminghub.org/api/v1/apple/notifications`,
for production and sandbox alike. Apple signs every delivery, so no shared
secret is involved. Sandbox deliveries are only accepted with
`APPLE_IAP_ALLOW_SANDBOX=1`. See [`IAP-APPLE.md`](IAP-APPLE.md) for the
verification rules, the conflict handling and the remaining gap (no App Store
Server API).

### 11.2 What the run does

The sync selects Amazon receipts whose `renewal_date`, `cancel_date` or grace
period ends within ±3 days (plus receipts with no date and an old verification),
re-verifies each one with RVS and updates the subscription row. It logs counts
only – never receipt ids, Amazon customer ids or tokens:

```json
{"checked":3,"updated":2,"canceled":1,"failed":0}
```

`failed > 0` marks the workflow with a warning; a non-zero exit code means the
endpoint was unreachable or rejected the token.

### 11.3 Behaviour without configuration

Without `AMAZON_RVS_SHARED_SECRET` both the app endpoints and the sync answer
`503 not_configured`, so nothing silently pretends to verify a purchase. The
Android Amazon build now ships with `PREMIUM_SALES = true` and shows the purchase
card, so `AMAZON_RVS_SHARED_SECRET` must be set before that build reaches users –
otherwise the card ends in `not_configured` instead of a purchase.

### 11.4 Real-Time Notifications registration

Registering the endpoint has a chicken-and-egg step: the topic ARN only exists
after the registration, but notifications are rejected without it. The webhook
handles that: with `AMAZON_RTN_TOPIC_ARN` empty it still verifies the SNS
signature and accepts a *SubscriptionConfirmation* (returning the topic ARN in
the response and in the log), and rejects every other message with `503`.

1. Set `AMAZON_RVS_SHARED_SECRET` first (the webhook stays disabled without it).
2. Register `https://streaminghub.org/api/webhooks/amazon/rtn` in the Amazon
   Developer Console and let it confirm.
3. Copy the topic ARN, add it as the `AMAZON_RTN_TOPIC_ARN` repository secret and
   run *Configure Amazon secrets* again.

From then on, notifications are processed; a foreign topic answers `403`.

### 11.5 Manual run

```bash
APP_URL=https://streaminghub.org AMAZON_SYNC_TOKEN=… npm run amazon:sync
```

The command prints the same JSON summary and exits non-zero when the endpoint
fails, which is what the workflow relies on.
