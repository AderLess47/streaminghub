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
| `STRIPE_TEST_SECRET_KEY` | Test key for canary cleanup and direct test cancellation |
| `STAGING_CANARY_EMAIL` | Test recipient used by the canary |

## 4. Deploy

Start **Actions → Deploy staging → Run workflow**. The workflow:

1. validates that `fly.staging.toml` names `streaminghub-staging`, uses the
   staging URL and does not contain a live Stripe key;
2. deploys with the staging-scoped token;
3. waits for `/status` to return HTTP 200.

The workflow is deliberately manual for the first rollout. Once staging secrets
and the canary are stable, a `push` trigger on `main` can be added without
changing the isolation rules.

## 5. Planned purchase canary

The canary creates a synthetic account, opens a real Stripe test-mode Checkout
session with Playwright, pays with `4242 4242 4242 4242`, waits for the redirect
and webhook, and checks inside the staging container that:

- `subscriptions.status = 'active'`;
- `current_period_end` is in the future;
- exactly one purchase confirmation was stored in `outbox_emails`;
- its status is `sent`;
- the marker `mail:purchase-confirmation:<subscriptionId>` exists exactly once;
- a duplicate webhook or repeated confirmation does not create a second mail;
- cancellation sets `cancel_at_period_end = 1`;
- `customer.subscription.deleted` ends the subscription as `canceled`.

The canary refuses to run if the base URL is production, the Stripe key does not
start with `sk_test_`, or Stripe reports `livemode: true`.

### Fallback if Playwright becomes too flaky

Flaky means: two failures in three scheduled runs, or more than 10% failed runs
over the last 20 runs. Business assertions are never retried automatically.

**Level 1 — reduce cadence, keep coverage.** Keep the full Playwright canary but
run it weekly and manually before a release. Remove it from the automatic
production gate until it is stable again. Document each skipped day.

**Level 2 — provider-contract canary with reduced coverage.** Replace the
browser step with a deterministic contract test:

1. create a Checkout Session through the app in Stripe test mode;
2. verify mode, currency, amount, price and `livemode: false`;
3. replay a signed `checkout.session.completed` fixture;
4. assert subscription state, one purchase mail and the idempotency marker;
5. replay `customer.subscription.deleted` and assert the final state.

This is explicitly **not** a full purchase canary: it does not prove that the
hosted Checkout page completes a payment. The workflow name and summary must say
"provider-contract, reduced coverage". The production gate stays disabled until
a manual test purchase has passed.

**Level 3 — manual release check.** Before a production release, a human
completes one test-mode purchase with the official test card and checks the
dashboard, webhook and outbox. This is the last resort, not an automated pass.

Never fix flakiness by using live keys, weakening assertions, hiding failures or
retrying the business checks. If the canary cannot be made reliable, the correct
outcome is "no automated purchase gate", not a green check with unknown coverage.

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
