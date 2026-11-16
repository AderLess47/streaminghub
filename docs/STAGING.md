# Staging and release safety

Staging is a **separate Fly app** (`streaminghub-staging`) with its own volume
(`streaminghub_staging_data`). It exists to exercise the checkout, webhook,
email and restore paths without touching production data or live billing keys.

## 1. Hard isolation rules

- Never copy, import or reuse production Fly secrets in staging.
- Never use `sk_live_...`, a live webhook secret or a production Stripe price.
- Never attach the production volume (`streaminghub_data`) to staging.
- Never copy the production database into staging. Staging starts empty and
  contains only synthetic test accounts.
- Use a separate, app-scoped Fly token for staging (`FLY_STAGING_API_TOKEN`).
- The staging URL is `https://streaminghub-staging.fly.dev`; production remains
  `https://streaminghub.org`.
- Staging is still a public hostname. Do not put real customer data, real email
  addresses or production credentials there.

## 2. One-time setup

Run these once with a Fly account that can create apps and volumes:

```bash
fly apps create streaminghub-staging
fly volumes create streaminghub_staging_data --size 1 --region fra -a streaminghub-staging
```

The deploy workflow expects the app and volume to exist. It does not create or
delete infrastructure.

## 3. Required secrets

Set these on the staging app only. Values belong in the password manager and Fly
secrets, never in `fly.staging.toml`, Git or the chat.

| Fly secret | Purpose |
| --- | --- |
| `STRIPE_SECRET_KEY` | Stripe test mode only (`sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Test-mode webhook endpoint (`whsec_...`) |
| `STRIPE_PRICE_ID` | Test price, 2.49 EUR / month |
| `EMAIL_API_KEY` | Dedicated staging/test Resend key |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Staging-only administrator, random password |

The staging Stripe webhook endpoint is:

```text
https://streaminghub-staging.fly.dev/api/webhooks/stripe
```

Subscribe it to the same events as production: `checkout.session.completed`,
`customer.subscription.created`, `customer.subscription.updated`,
`customer.subscription.deleted`, `invoice.paid` and
`invoice.payment_failed`.

Use only the official test recipients for mail, for example
`delivered+staging-canary@resend.dev`. A real inbox must never be used by the
canary.

GitHub environment `staging` needs:

| GitHub secret/variable | Purpose |
| --- | --- |
| `FLY_STAGING_API_TOKEN` | App-scoped Fly token for `streaminghub-staging` |
| `STAGING_BASE_URL` | `https://streaminghub-staging.fly.dev` |
| `STRIPE_TEST_SECRET_KEY` | Test key for the canary's Stripe API calls and cleanup |
| `STRIPE_WEBHOOK_SECRET` | Test-mode webhook signing secret |
| `STRIPE_PRICE_ID` | Test price, 2.49 EUR / month (variable) |
| `STAGING_CANARY_EMAIL` | Test recipient used by the canary (variable) |

## 4. Deploy

Start **Actions → Deploy staging → Run workflow**. The workflow:

1. validates that `fly.staging.toml` names `streaminghub-staging`, uses the
   staging URL and does not contain a live Stripe key;
2. deploys with the staging-scoped token;
3. waits for `/status` to return HTTP 200.

The workflow is deliberately manual for the first rollout. Once staging secrets
and the canary are stable, a `push` trigger on `main` can be added without
changing the isolation rules.

## 5. Billing canary

The implemented canary is a deterministic **provider-contract** check. It is
not a browser automation: Stripe's own automated-testing documentation says
hosted Checkout and Payment Element have security measures that prevent
automated testing. A Playwright test of the hosted card form would be an
unsupported selector race, not a trustworthy release gate.

Before creating the synthetic user, the canary calls the Stripe API and requires
exactly one enabled test-mode webhook endpoint for
`https://streaminghub-staging.fly.dev/api/webhooks/stripe` with the required
events. This catches a missing or misconfigured endpoint that the locally signed
test event alone would not reveal.

The `/status` page exposes its deployed environment and commit as
`data-deployment-environment` and `data-deployment-commit`. The canary requires
`CANARY_EXPECT_ENV=staging` (the default) and the commit from `GITHUB_SHA` or
`CANARY_EXPECT_COMMIT`; a stale or incorrectly targeted staging image fails
before a synthetic user is created.

The canary creates a real Stripe test-mode Checkout Session through the app,
creates a test subscription with a test payment method, and sends the signed
`checkout.session.completed` and `customer.subscription.deleted` events. It
first checks that the session is open and test-mode, uses the configured active
`STRIPE_PRICE_ID`, and binds both `metadata.userId` and `client_reference_id`
to the canary user. It then checks inside the staging container that:

- `subscriptions.status = 'active'` after the purchase event;
- `current_period_end` is stored;
- exactly one purchase confirmation is in `outbox_emails`;
- its status is the expected `sent`;
- the marker `mail:purchase-confirmation:<subscriptionId>` exists exactly once;
- a duplicate webhook does not create a second mail;
- cancellation sets `cancel_at_period_end = 1` locally and Stripe reports
  `cancel_at_period_end = true` on the subscription;
- `customer.subscription.deleted` ends the subscription as `canceled`.

The canary refuses to run if the base URL is production, the Stripe key does not
start with `sk_test_`, or the session reports `livemode: true`.

Run it manually after the staging app, Stripe test webhook and email key are
configured:

```bash
STAGING_BASE_URL=https://streaminghub-staging.fly.dev \
CANARY_EXPECT_COMMIT=$(git rev-parse HEAD) \
STRIPE_SECRET_KEY=sk_test_... \
STRIPE_PRICE_ID=price_... \
STRIPE_WEBHOOK_SECRET=whsec_... \
FLY_API_TOKEN=... \
npm run staging:canary
```

Or use **Actions → Staging billing canary → Run workflow**. The workflow is
manual until the test secrets exist; add the daily `schedule` only after a green
manual run. The database assertion helper is covered by
`npm run test:staging-canary`.

The canary removes the synthetic account, subscription, outbox rows, event rows
and canary audit rows even when registration, checkout or a later assertion
fails. Cleanup is restricted to `@resend.dev` recipients and uses a bounded
30-second command timeout. Failed Stripe cleanup calls (subscription, customer
or checkout session) count as canary failures, and the cleanup assertion must
report `cleaned=true`; a green run therefore means cleanup completed.

### Orphaned Stripe object sweeper

The canary uses Stripe's shared test PaymentMethod `pm_card_visa` instead of
creating a payment method per run, so a failed run cannot leave an unsweepable
PaymentMethod orphan. The customer and subscription it creates carry
`metadata.canary` and a run-specific `metadata.canary_run_id`, and those create
calls use idempotency keys. A separate sweeper handles leftovers:

```bash
# Safe dry run: prints what would be deleted
npm run staging:canary:sweep

# Delete only old, exactly marked test-mode subscriptions and customers
CANARY_SWEEP_APPLY=1 npm run staging:canary:sweep
```

The sweeper refuses non-`sk_test_` keys, requires the exact
`metadata.canary=staging-billing-canary` marker, defaults to a 24-hour minimum
age, caps the number of objects, and uses Stripe's test-mode data only. It is
not run automatically by the canary gate.

The canary requires a configured staging email provider, because `sent` is the
only passing mail state. `queued` is rejected by configuration, not treated as
a slow success. Without `EMAIL_API_KEY`, the outbox remains `queued` and the
canary fails; that is intentional, not a skipped check.

**What it does not cover:** the hosted Stripe card form itself. A human must
still complete one test-mode purchase with `4242 4242 4242 4242` before a
production release. This is documented as a manual release check, not an
automated pass.

### Fallback if a Playwright canary is added later

If Stripe later exposes a stable, supported test interface and a Playwright
canary is added, flakiness means two failures in three scheduled runs or more
than 10% failed runs over the last 20 runs. Business assertions are never
retried automatically.

**Level 1 — reduce cadence, keep coverage.** Run the browser check weekly and
manually before a release. Remove it from the automatic production gate until it
is stable again.

**Level 2 — keep the provider-contract canary.** The deterministic script in
this repository remains the gate. The browser check is additional evidence only;
it never replaces the contract checks.

**Level 3 — manual release check.** Before a production release, a human
completes one test-mode purchase and checks the dashboard, webhook and outbox.

Never fix flakiness by using live keys, weakening assertions, hiding failures or
retrying the business checks. If browser automation cannot be made reliable, the
correct outcome is "no browser gate", not a green check with unknown coverage.

## 6. Off-site backup freshness gate

A downloaded backup is only accepted for the off-site copy if **all** of these
checks pass. This prevents an old local file from being uploaded just because it
is the newest file in the directory.

After forcing a fresh backup in the production container:

```bash
flyctl ssh console --app streaminghub-org --user nextjs \
  -C "node /app/scripts/backup-db.mjs"
```

Capture the remote file, its modification time, size and SHA-256, then download
it:

```bash
REMOTE_FILE=$(flyctl ssh console --app streaminghub-org --user nextjs \
  -C "ls -1t /app/data/backups/streaminghub-*.db | head -1" | tr -d '\r')
REMOTE_MTIME=$(flyctl ssh console --app streaminghub-org --user nextjs \
  -C "stat -c %Y '$REMOTE_FILE'" | tr -d '\r')
REMOTE_SIZE=$(flyctl ssh console --app streaminghub-org --user nextjs \
  -C "stat -c %s '$REMOTE_FILE'" | tr -d '\r')
REMOTE_SHA=$(flyctl ssh console --app streaminghub-org --user nextjs \
  -C "sha256sum '$REMOTE_FILE' | cut -d' ' -f1" | tr -d '\r')
flyctl ssh sftp get --app streaminghub-org "$REMOTE_FILE" "$RUNNER_TEMP/latest.db"
```

Hard checks:

| Check | Failure means |
| --- | --- |
| Remote file name matches `streaminghub-<timestamp>-<pid>.db` | Reject; wrong or unexpected artifact |
| Remote mtime is at most 15 minutes old **after** the forced backup | Reject; backup command did not create a fresh file |
| `stat -c %s` remote equals the downloaded file size | Reject; truncated or wrong download |
| Remote SHA-256 equals the downloaded SHA-256 | Reject; download or source changed |
| `PRAGMA integrity_check` returns `ok` | Reject; corrupt backup |
| `PRAGMA foreign_key_check` returns no rows | Reject; inconsistent backup |
| The file name timestamp is at most 26 hours old | Reject; stale artifact |

If any check fails: **do not upload to R2, do not prune older snapshots, do not
continue the workflow**. Keep the local backup, fail the job and open an
operational alert. The same gate applies to the restore drill: it restores only a
snapshot that passed these checks when it was uploaded.

## 7. Stop conditions

Stop the canary or backup job immediately and do not deploy if:

- a live charge or `livemode: true` appears;
- staging points at production data or the production volume;
- a real recipient receives a canary mail;
- two consecutive canary or backup runs fail;
- a backup is stale, corrupt or its SHA-256 does not match;
- the R2 bucket becomes public or its token has broader access than the backup
  bucket;
- a restore would overwrite production data.

The incident is resolved only after the cause is fixed, credentials are rotated
if needed, and a clean run has passed.
