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

Staging deploys itself: once CI on `main` is green, the **Deploy staging**
workflow starts through `workflow_run` and deploys exactly the commit that
passed, not the current default-branch head. A red, cancelled or
pull-request run deploys nothing, so staging keeps its previous commit instead
of moving to an untested state.

Manual runs stay available for staging-only rollbacks: **Actions → Deploy
staging → Run workflow** with a `ref`.

The workflow:

1. validates that `fly.staging.toml` names `streaminghub-staging`, uses the
   staging URL and does not contain a live Stripe key;
2. deploys with the staging-scoped token;
3. waits for `/status` to answer HTTP 200 **and to name the deployed commit**;
4. on any failure, reports which commit staging still serves.

The deploy itself is capped at 8 minutes. A healthy rollout needs about two
minutes; on 2026-11-18 the remote builder hung and Fly only aborted after 16
minutes with `deadline_exceeded`, so staging kept running the old commit while
nothing on the run said so. A cap that fires during the build now fails the step
with an explicit error instead of waiting for Fly's own deadline.

HTTP 200 alone is not proof of a rollout: a rolled-back or half-finished deploy
can answer 200 while serving the previous commit. Because `/status` names its
commit, the health step requires that commit to equal the one being deployed, so
a silent rollback cannot pass. When the job fails after the commit was resolved,
the last step prints `Staging serves <old> instead of <new>` into the run summary
and as an error annotation — the drift is named at the deploy, not discovered by
a canary failure days later.

The isolation rules are unchanged by the automatic trigger: the workflow still
deploys only `streaminghub-staging` with the staging-scoped token and never
receives production Stripe or email credentials.

### Geräte-Vorwarnung im Konto

`Device notice smoke` prüft die Karte, die im Konto vor dem Ablauf warnt – die
Seite selbst, nicht nur den Commit. Der Lauf startet nach jedem erfolgreichen
`Deploy staging` (Job **Staging**) und nach jedem erfolgreichen `Deploy` in
Produktion (Job **Produktion**), außerdem auf Zuruf (**Actions → Device notice
smoke → Run workflow** mit `target`).

Der Test läuft in der jeweiligen Maschine (`flyctl ssh console`) und braucht
keine Zugangsdaten: Er legt dort ein Wegwerf-Konto
`device-notice-smoke+…@example.invalid` mit Trial und mehr Geräten als dem
Gratis-Limit an, ruft `/dashboard` über HTTP mit einer eigenen Sitzung auf und
löscht das Konto am Ende wieder. Die Adresse ist auf Loopback festgelegt (Staging
127.0.0.1:3001 hinter dem Cache-Proxy, Produktion 127.0.0.1:3000), damit der
Lauf niemals eine öffentliche Instanz trifft.

Der Produktionslauf schreibt dafür kurz in die Produktionsdatenbank (Konto,
Sitzung, Abo, vier Geräte) und löscht alles im selben Lauf; es werden keine
Mails verschickt. Bricht die Maschine mitten im Lauf ab, räumt der nächste Lauf
die Reste mit demselben E-Mail-Präfix weg.

Geprüft werden vier Zustände:

| Zustand | Erwartung |
| --- | --- |
| Trial | „Dein Testzeitraum endet am …“ |
| Stripe gekündigt | „Dein Abo endet am …“ |
| Stripe läuft weiter | „Dein Abo verlängert sich am … automatisch“ |
| Store-Abo (Amazon) | Karte mit Markierungen, aber **kein** Datum |

In allen Fällen müssen der Titel „Beim Ablauf bleiben N Geräte aktiv“, die
Gerätezahl und die Markierung „wird abgemeldet“ je überzähligem Gerät
erscheinen. Schlägt der Lauf fehl, weicht die gerenderte Seite von den Texten in
`dashboard.devices.preNotice*` bzw. vom Gratis-Limit aus den Einstellungen ab.

### Rote Deploy- und Smoke-Läufe

`Red run issue` öffnet bei einem fehlgeschlagenen (`failure` oder `timed_out`)
Lauf von `Deploy`, `Deploy staging` oder `Device notice smoke` das Issue
„Roter Lauf: <Workflow>“ mit Lauf-Link, Commit, Branch, Auslöser und den
fehlgeschlagenen Jobs. Ein weiterer roter Lauf für denselben Commit kommentiert
nicht doppelt; der nächste grüne Lauf desselben Workflows kommentiert und
schließt das Issue.

Abgebrochene Läufe (`cancelled`) erzeugen kein Issue – das ist meist ein
abgelöster Lauf, kein Fehler. Die Meldung nutzt bewusst das Skript vom
Default-Branch, nicht Code aus dem roten Lauf. Formatierung und Dedupe sind mit
`npm run test:red-run-issue` abgedeckt.

Ist das Repository-Secret `DISCORD_WEBHOOK_URL` gesetzt, geht bei einem roten
Lauf zusätzlich eine Nachricht in den Channel – mit Workflow, Ergebnis, Commit,
Lauf-Link und Issue-Link. Ohne Secret läuft der Job weiter und warnt nur; eine
ungültige URL bricht mit einer klaren Meldung ab. Die URL selbst wird nie
geloggt, und `allowed_mentions` ist leer, damit die Nachricht niemanden pings.
Nur Fehlschläge melden sich; ein grüner Lauf schließt still das Issue – so wie
beim Staging-Canary.

Der Zustand des optionalen Teils steht im Lauf-Summary, nicht nur im Log: dort
steht `Discord: Nachricht gesendet (HTTP 204)`, `Discord: nicht gesendet –
Repository-Secret \`DISCORD_WEBHOOK_URL\` fehlt` oder – bei einer abgelehnten URL
– `Discord: Senden fehlgeschlagen – …`. Wer einen roten Lauf im Actions-Tab
öffnet, sieht damit sofort, ob der Issue-Weg der einzige Alarm war. Ein grüner
Lauf schreibt nur `Issue #… geschlossen`; ohne offenes Issue bleibt das Summary
leer.

### Anonymous public HTML cache

Staging can enable a small cache in front of the Next server with
`ENABLE_PUBLIC_HTML_CACHE=1` and `UPSTREAM_PORT=3001` (both are set only in
`fly.staging.toml`; production stays direct). The cache is intentionally
limited to the allowlisted public content pages and to `GET` HTML requests
without a `sh_session` cookie. Those responses get a 60-second public lifetime
and `Vary: Cookie`.

A request carrying any `sh_session` cookie bypasses the cache completely, and
so do RSC requests, non-public paths and responses with `Set-Cookie`. The cached
anonymous shell therefore contains only the logged-out navigation; a logged-in
shell is never stored under a shared key. Cached responses contain the same
anonymous Next HTML and never account data.

The cache is in-process and bounded; it is a latency experiment, not a CDN.
Admin content changes become visible after the 60-second lifetime at the latest.
The request-dependency review for the allowlist is recorded in
[PUBLIC_CACHE_AUDIT.md](PUBLIC_CACHE_AUDIT.md). Re-run it before adding a path or
introducing a nonce-based CSP.

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

The two mismatches are deliberately not the same failure:

- a **wrong environment** is an ordinary failure (`exit 1`), because the canary
  is pointed at something it must never test;
- a **different commit** is deploy drift (`exit 3`): staging serves an older,
  rolled-back or half-deployed image, no billing check ran, and billing is not
  implicated. The workflow reports it on the separate issue `Staging deploy
  drift` and leaves `Staging canary failing` alone. This separation exists
  because the first real scheduled run failed on a stale staging commit and
  opened `Staging canary failing`, which named the wrong problem.

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

Or use **Actions → Staging billing canary → Run workflow**. The workflow also
runs automatically after any successful **Deploy staging** run, including custom
`ref` values and non-`main` deploys. The deploy checks out the requested ref,
records the resolved `git rev-parse HEAD` in a `deployed-commit` artifact, and
builds with that exact SHA. The automatic canary downloads the artifact, checks
out the same SHA and uses it as `CANARY_EXPECT_COMMIT`; it does not trust the
default-branch tip or the workflow-run head SHA. Failed deploys do not trigger
it, and production is not involved. Until the test secrets exist, an automatic
run will fail rather than silently skip. Add the daily `schedule` only after a
green run. The database assertion helper is covered by
`npm run test:staging-canary`.

The schedule is written five times a day (`47 5`, `47 9`, `47 13`, `47 17`,
`47 21` UTC) because GitHub starts scheduled runs late and drops slots — in this
repository by hours, and some days not at all. Only the first slot is the
intended daily time; the rest are retries. The `guard` job reads the last
completed scheduled attempt and skips the canary when it is younger than 18 hours
(`MIN_INTERVAL_SECONDS`), so a late or repeated slot neither creates a second
canary nor a second failure comment on the same day. A retry slot still appears
as a run in which the `guard` job decided to skip; that is normal.

The one exception is deploy drift. When the last completed scheduled attempt
failed, the issue `Staging deploy drift` is open and `Staging canary failing` is
not, the `guard` lets the next slot run the canary again. A drift run stopped at
the commit comparison and never reached a billing check, so its slot proved
nothing about billing; the retry means a deploy fix restores the daily scheduled
success and its heartbeat on the same day instead of the next morning, and it
closes the drift issue with `Auslöser: Zeitplan`. A genuine billing failure keeps
its single daily run, because the open billing issue is the signal, and while the
drift persists every retried slot comments on the drift issue again so the
broken state stays visible.

Even five slots only help while GitHub delivers *some* slot. Nothing inside
Actions can notice that its own scheduler stopped, so the successful scheduled
run additionally pings an external heartbeat (see below). That ping is the only
signal that still reaches someone when a whole day of slots is dropped.

### Alarm overview

| Trigger | When it runs | What it produces on failure |
| --- | --- | --- |
| Schedule (`47 5`, `47 9`, `47 13`, `47 17`, `47 21` UTC, gated by `guard`) | at most one unattended run per day, plus a retry in each remaining slot while a drift issue is open | issue `Staging canary failing`, commented again every day so a persistent failure keeps its heartbeat |
| Successful **Deploy staging** (`workflow_run`) | after every green staging deploy | the same issue, without a second comment for a commit that is already reported |
| Manual (`workflow_dispatch`) | on demand | `::error::` annotation and a step summary only; it never touches the issue |
| Deploy drift (any unattended trigger) | when staging serves a commit other than the one being verified | its own issue `Staging deploy drift` with the expected and served commit; never `Staging canary failing` |
| External fallback (Cloudflare Worker, hourly) | when no canary ran for 22 hours | starts the canary as an unattended run, so the alarms above apply to it |
| External heartbeat (Healthchecks.io) | outside Actions entirely | e-mail once no successful scheduled ping arrived for 1 day + 12 hours |

The properties that hold across all of them:

- The issue is the primary alarm and needs nothing but the workflow's own
  `GITHUB_TOKEN`; it works without any chat or monitoring integration.
- `Staging canary failing` always means a billing, provider or cleanup check
  failed. A run that stops on the commit comparison never reaches a billing
  check, so it opens `Staging deploy drift` instead; that issue names the
  expected and the served commit and asks for a fresh deploy.
- `DISCORD_WEBHOOK_URL` and `CANARY_HEARTBEAT_URL` are optional. When they are
  missing the step logs a warning and skips, so a missing secret can never
  suppress or delay the issue.
- Only an automatic successful run comments on and closes the issue, and that
  comment names its trigger (`Zeitplan`, `Deploy` or `externer Auslöser`). A
  manual run from the Actions tab stays annotation-only; the fallback dispatch is
  not manual, it sends `source=external`.
- At most one canary run and one failure comment per day, even when several
  schedule slots fire or a deploy repeats an already reported commit. Only an
  unresolved drift reopens the schedule retries; those slots report on the drift
  issue, never on the billing issue.
- A failed deploy does not start the canary at all, so a red deploy never
  produces a second, misleading canary alarm.
- Nothing here touches production: the canary refuses non-`sk_test_` keys,
  `livemode: true` sessions and a non-staging base URL.

The subsections below describe each part in detail.

A run that fails on deploy drift opens (or updates) `Staging deploy drift` with
the expected commit, the commit staging actually served and the run link. It is
the same single-issue bookkeeping as the billing alarm: unattended triggers only,
repeated drift for the same expected commit adds no second comment, the daily run
comments again, and the next successful unattended run comments on and closes it
— a green run also closes the drift issue of an earlier failure.

A failed run opens (or updates) the issue `Staging canary failing` with the run
link and commit. Both unattended paths do this: the daily scheduled run and the
automatic run after a successful **Deploy staging**. A failed manual run
(`workflow_dispatch`) instead annotates its own run and writes a step summary,
because whoever started it is already watching it; it never opens, comments on
or closes the issue. A deploy failure that repeats the commit already reported on
an open issue adds no second comment, while the daily run still comments every
day so a persistent failure keeps its heartbeat. The next successful scheduled or
deploy-triggered run comments and closes the issue. This uses GitHub issue
notifications and works without any chat integration.

For an additional Discord alert, create a channel webhook (channel settings →
Integrations → Webhooks → New Webhook → Copy Webhook URL) and store its URL as
the **repository** secret `DISCORD_WEBHOOK_URL` (Settings → Secrets and variables
→ Actions → Repository secrets). The `notify` job does not use the `staging`
environment, so an environment-only secret is not visible to it. The webhook
posts to the channel it was created in; the step rejects anything that is not a
`https://discord.com/api/webhooks/…` (or legacy `discordapp.com`) URL. It only
posts for failed scheduled and deploy-triggered runs; if the secret is missing it
logs a warning and skips, and the GitHub issue is still created. The URL is never
printed or committed.

To check the webhook and the channel without waiting for a failed scheduled
run, send the same payload once from a local shell where the URL is exported
(never commit it, paste it into a workflow file or echo it into a log):

```bash
export DISCORD_WEBHOOK_URL='https://discord.com/api/webhooks/...'
curl --fail-with-body --silent --show-error --max-time 10 \
  -H 'Content-Type: application/json' \
  --data '{"content":"**:rotating_light: Staging-Billing-Canary fehlgeschlagen**\nLokale Prüfung des Webhooks.","allowed_mentions":{"parse":[]}}' \
  "$DISCORD_WEBHOOK_URL"
unset DISCORD_WEBHOOK_URL
```

A success answers `204 No Content` (so `--fail-with-body` prints nothing) and a
message appears in the channel the webhook was created in. Both together confirm
URL and channel. `gh secret list --repo AderLess47/streaminghub` then confirms
that the repository secret exists; secret values cannot be read back, so this
does not prove the stored value is the same URL. The step still only runs for
failed unattended runs, so a silent green scheduled run is expected.

### Heartbeat for a missing schedule run

GitHub starts scheduled runs late and sometimes drops them for a whole day, which
happened on 18 November 2026. Since no workflow can report its own absence, the
successful scheduled run pings an external dead-man's switch: [Healthchecks.io](https://healthchecks.io/)
is free for 20 checks and alerts by e-mail when the ping does not arrive.

Set it up once:

1. Create the free account and **Add Check**: name `staging-billing-canary`,
   **Period** `1 day`, **Grace Time** `12 hours` (the canary runs once per day,
   and GitHub often starts a scheduled run hours late, so a 12-hour grace keeps a
   late but healthy run from alerting).
2. Copy the **ping URL** (`https://hc-ping.com/<uuid>`) and store it as the
   **repository** secret `CANARY_HEARTBEAT_URL` under Settings → Secrets and
   variables → Actions → Repository secrets. The `notify` job does not use the
   `staging` environment, so an environment-only secret would be invisible here.
3. Leave the integrations at their default (e-mail to the account address) or
   add the channel you actually read.

The ping is sent by the `notify` job only when a **scheduled** canary run
succeeded, and it runs after the closing step so a healthchecks.io outage cannot
keep a recovered issue open. Deploy-triggered and manual runs never ping, so a green deploy cannot
hide a dead schedule; a failing scheduled run does not ping either, which makes
the heartbeat a second, slower alarm next to the issue. A missing secret only
logs a warning and skips, exactly like the Discord webhook. The ping URL is never
printed or committed, and the step rejects anything that is not a
`https://hc-ping.com/…` URL.

Check the wiring without waiting for the schedule. The real proof is a workflow
run, because it exercises the step exactly as it will run unattended: start one
with the external trigger's payload and the `notify` job pings and logs what the
check answered.

```bash
gh workflow run staging-canary.yml --ref main -f source=external
```

The step then logs `Heartbeat pinged (HTTP 200).` and the check shows **Up** with
a fresh ping. A rejected or unreachable URL fails the step instead, and the ping
URL itself never reaches the log. A manual run without `source=external`
deliberately pings nothing.

To check only the URL, ping once from a local shell where it is exported (never
commit it or paste it into a workflow):

```bash
export CANARY_HEARTBEAT_URL='https://hc-ping.com/...'
curl --fail --silent --show-error --max-time 10 -o /dev/null "$CANARY_HEARTBEAT_URL" && echo 'ping accepted'
unset CANARY_HEARTBEAT_URL
```

To prove the alarm path as well, set Period to `1 hour` and Grace to `5 minutes`
in the dashboard, let it sit without a ping, and confirm the e-mail arrives before
restoring `1 day`/`12 hours`.

### External fallback trigger

Even five slots are useless when GitHub delivers none of them for a day, which
happened on 18 November 2026. `ops/canary-dispatcher/` therefore contains a
Cloudflare Worker with an hourly Cron Trigger: it reads the last canary run and
dispatches the workflow through the API when that run is older than 22 hours. It
only starts a run — the issue, the closing comment and the heartbeat stay in the
workflow, because the dispatch sends `source=external` and the workflow treats
that exactly like an unattended run.

Deploy it once:

1. Create a fine-grained token: GitHub → Settings → Developer settings → Personal
   access tokens → Fine-grained tokens → *Generate new token*, repository access
   “Only select repositories” → `streaminghub`, permission **Actions: Read and
   write**. A classic token with `repo` and `workflow` also works.
2. `cd ops/canary-dispatcher && npx wrangler deploy`. Without wrangler, create a
   Worker in the Cloudflare dashboard, paste `worker.js`, and add the Cron Trigger
   `7 * * * *` from `wrangler.toml` under *Triggers*.
3. Store the token as the Worker secret `GH_TOKEN` (`npx wrangler secret put
   GH_TOKEN`, or dashboard → Worker → *Settings* → *Variables and Secrets* →
   *Add* → type **Secret**). Without it the Worker answers `GH_TOKEN is not
   configured` and starts nothing.
4. Check it: the Worker URL (or `npx wrangler tail`) answers
   `{"action":"none",...,"lastRun":"..."}` while the last run is recent and
   `{"action":"dispatched"}` once it started one. A wrong or missing token
   answers `{"action":"error",...,"status":401}` on dispatch.
5. Prove the dispatch path without waiting a day: add the plain variable
   `MAX_AGE_HOURS` with value `0` (dashboard → Worker → *Settings* →
   *Variables and Secrets*), open the Worker URL once — it answers
   `{"action":"dispatched"}` and a new run with `source=external` appears in the
   Actions tab — then **delete `MAX_AGE_HOURS` again**. While it is `0` every
   request would dispatch.

The token can only start workflows in this repository and never lives in the repo.
The Worker is a fallback, not the schedule: while GitHub delivers its slots it
does nothing, and it does not touch the issue or the heartbeat itself.

### Verifying the failure alert once

The issue is opened by scheduled and deploy-triggered runs only, and GitHub
cannot dispatch a scheduled run on demand (`gh workflow run` produces
`workflow_dispatch`, which merely annotates the run), so the issue path is
verified with one short-lived deliberate failure on `main`. The failing step sits
before every Stripe, flyctl and canary step, so no Staging data is touched and
there is nothing to clean up:

1. Set `DISCORD_WEBHOOK_URL` and check the webhook as described above.
2. On a short-lived branch off `main`, make exactly three edits:
   - add a schedule about 15 minutes ahead in UTC next to the existing slots,
     e.g. `- cron: "10 15 * * *"`;
   - set `MIN_INTERVAL_SECONDS` in the `guard` step to `"0"`, otherwise the test
     slot counts as a retry slot and the canary is skipped;
   - add one first step to the `canary` job directly after
     `Check out repository`:

     ```yaml
      - name: Deliberate alert verification
        run: exit 1
     ```

3. Merge the branch once its CI is green. The CI workflow does not schedule the
   billing canary, so the deliberate step only runs from the cron.
4. The scheduled run fails there; `notify` then opens (or updates) the issue and
   posts to Discord. Confirm both: the message in the channel and the issue
   carrying the run link.
5. Revert all three edits on `main` immediately (revert PR, green CI). The next
   regular scheduled run comments on and closes the issue automatically.

Keep the window to a single run and do not merge this near 05:47 UTC: while the
deliberate step exists, a real failure would be masked, every scheduled run would
alert, and a successful Staging deploy would trigger a failing canary run too.
The temporary schedule must not survive the verification.

The canary removes the synthetic account, subscription, outbox rows, event rows
and canary audit rows even when registration, checkout or a later assertion
fails. Cleanup is restricted to `@resend.dev` recipients and uses a bounded
30-second command timeout. Failed Stripe cleanup calls (subscription, customer
or checkout session) count as canary failures, and the cleanup assertion must
report `cleaned=true`; a green run therefore means cleanup completed.

### Orphaned Stripe object sweeper

The canary creates a test PaymentMethod from Stripe's `tok_visa` test token
for each run and attaches it to that run's customer. Deleting the customer
detaches it again; Stripe keeps the unattached test PaymentMethod, but it
cannot be charged without a customer. The customer and subscription it creates carry
`metadata.canary` and a run-specific `metadata.canary_run_id`, and those create
calls use idempotency keys. The canary asserts that Stripe returns both metadata
fields on the customer and subscription responses before it relies on them. A
separate sweeper handles leftovers:

```bash
# Safe dry run: prints what would be deleted
npm run staging:canary:sweep

# Delete only old, exactly marked test-mode subscriptions and customers
CANARY_SWEEP_APPLY=1 npm run staging:canary:sweep
```

The sweeper refuses non-`sk_test_` keys, requires the exact
`metadata.canary=staging-billing-canary` marker, defaults to a 24-hour minimum
age, caps the number of objects, and uses Stripe's test-mode data only. The staging canary workflow runs it as a **dry-run preflight** and reports old IDs
in the step summary; it never applies deletions automatically. Cleanup remains
a separate manual `CANARY_SWEEP_APPLY=1` action.

### Orphaned database rows

If a canary process is killed after registration but before its cleanup, the
synthetic SQLite rows can remain even when the Stripe objects were swept. The
database sweeper handles only old customer accounts with the exact canary
registration fingerprint: `@resend.dev`, display name `Staging Canary` and
locale `de`. It removes only rows the canary creates: the user and cascaded
subscription/session/auth/legal rows, plus its outbox, subscription-event and
audit rows. Support tickets, contact messages, contract requests, email
suppressions and unrelated orphan outbox rows are not touched.

```bash
# Dry run: print candidate users and counts
node scripts/staging-canary-db-sweep.mjs

# Apply in one transaction inside the staging app container
CANARY_DB_SWEEP_APPLY=1 \
  DATABASE_PATH=/app/data/streaminghub.db \
  node scripts/staging-canary-db-sweep.mjs
```

The sweeper defaults to a 24-hour minimum age, caps candidates, refuses an age
below one hour, and does not touch non-canary accounts. The staging canary
workflow runs it as a **dry-run preflight** and reports candidate IDs and counts
in the step summary; it never passes `--apply` or enables deletions. Cleanup
remains a separate manual apply.

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
