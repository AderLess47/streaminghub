# Amazon IAP and the web subscription

Whether StreamingHub can ship the current premium model to the Amazon Appstore,
what the policy actually says, and the options for the Amazon build.

## What we sell and what it unlocks today

| Fact | Evidence |
| --- | --- |
| Premium costs €2.49/month, sold on the website via Stripe checkout | `src/app/premium/page.tsx`, `src/lib/payments.ts`, `src/app/api/subscription/checkout/route.ts` |
| The app has no in-app purchase, no billing SDK, no price or checkout UI | `android/app/build.gradle.kts` (no Appstore/Billing dependency) |
| Premium gates **nothing** in the app: playback, playlist, EPG and pairing work without it | `premiumActive` appears only in `StreamingHubApi` and `SettingsScreen`; no playback path reads it |
| The app shows the subscription status and links to `/dashboard` | `SettingsScreen` → „Konto im Web verwalten“ |
| The dashboard leads to checkout | `/dashboard/subscription` renders `CheckoutButton` |
| Premium features are still marked **in development** (VPN/proxy, cross-device resume) | `src/i18n/de.ts` → `premium.features` |
| The website stated "Amazon Appstore version: Amazon In-App Purchasing only" (now: premium not available in that build) | `src/i18n/de.ts` → `premium.channels.amazon` |

So today the Amazon build is a free player that neither sells nor unlocks paid
content, but it does lead a user to a page where a subscription can be bought.

## What Amazon requires

From the Monetization and Advertising Policy and the IAP FAQ:

- If you make **digital content available for purchase that can be used in your
  app**, you must use Amazon In-App Purchasing (IAP).
- If you do that, you **may not direct customers to other payment methods**, and
  you may not enable account creation inside the app unless you use IAP.
- Subscriptions (music streaming, magazines, cloud storage) are explicitly named
  as IAP-eligible digital content.
- Payment methods other than IAP are for **physical goods and services used
  outside the app** — the inverse of our case.
- Amazon states plainly that there is **no exception** to the IAP policy.

Under a strict reading, a web-sold subscription that unlocks app functionality is
"digital content available for purchase that can be used in the app". Linking an
Amazon user from the app to `/dashboard/subscription` is exactly the "direct
customers to other methods of paying" case, so shipping the current build as-is
carries a rejection risk.

## Options

### A. Ship the Amazon build without premium (recommended for the first submission)

Remove every premium touchpoint from the Amazon variant: no premium status row,
no "Konto im Web verwalten" link into the checkout flow, no price copy. The app
stays a fully functional free player; accounts and the web subscription remain
available to users who find the website on their own.

- **Effort:** small — a `amazon` product flavour with a `BuildConfig` flag, conditional
  composables in `SettingsScreen`, adjusted strings, one unit test for the flag.
- **Risk:** low. Nothing is sold or advertised in the app, so the IAP rules do not
  apply. Account pairing stays, because accounts are created on the website, not
  in the app.
- **Cost:** no Fire TV revenue from premium; the website copy ("Amazon version:
  IAP only") must change to "not available in the Amazon build" so marketing and
  binary agree.
- **Why now:** the paid tier currently delivers no shipped feature. Selling it on
  Fire TV before it exists would also collide with the rule that described
  functionality must work.

### B. Sell premium through Amazon IAP

Integrate the Amazon **Appstore SDK** (IAP, `com.amazon.device:amazon-appstore-sdk:3.0.9`)
with one auto-renewing subscription SKU, validate receipts against Amazon's RVS,
map the Amazon customer to a StreamingHub account, store `channel = 'amazon'`, and
let `/api/v1/me` return the entitlement. Keep Stripe for the web and sideload
users. The Appstore Billing Compatibility SDK is not an option: Amazon stopped
supporting it on 15 September 2026.

The concrete plan — endpoints, data model, SDK integration, account linking and
test cases — is in [Implementation plan for option B](#implementation-plan-for-option-b-amazon-iap).

- **Effort:** large — roughly three weeks, see the phase table in the plan.
- **Risk:** medium — billing bugs are customer-visible; entitlement duplication
  between channels must be resolved deterministically.
- **Cost:** 30 % revenue share to Amazon and a second billing integration to
  maintain.
- **When:** only once premium actually ships a feature (the VPN/proxy capability
  or cross-device resume), so the purchase buys something testable.

### C. Ship the current build unchanged

No code change, but the app links to a Stripe checkout for a subscription, which
the policy forbids for digital content used in the app. Not recommended: it risks
rejection after review, and a rejected submission also blocks the account-deletion
and privacy work already completed.

## Recommendation

**Option A for the first submission, option B once premium is real.** The Amazon
build becomes a free, complete player with no commercial surface; the web keeps
its Stripe subscription for users who install via the website. Revisit B when the
premium feature set leaves "in development", because that is the moment a paid
Fire TV tier starts to make sense — and the moment Amazon will expect IAP.

## Implementation sketch for option A (done)

1. Add a product flavour `amazon` (or `amazon`/`direct`) with
   `buildConfigField("boolean", "PREMIUM_SALES", "false")` for Amazon and `true` for
   the direct build.
2. Hide the premium status line, the price and the `/dashboard` link when
   `BuildConfig.PREMIUM_SALES` is false; keep account pairing and the deletion
   entry.
3. Adjust the website copy: Amazon channel = "Premium is not sold in this build".
4. Unit-test the flag wiring (`BuildConfig` value per variant is checked in the
   Gradle test run; UI conditionals stay covered by the compile plus the existing
   settings tests).
5. Re-run `testDirectDebugUnitTest testAmazonDebugUnitTest` and
   `assembleDirectRelease assembleAmazonRelease`, upload as build 9.

## Implementation plan for option B (Amazon IAP)

Status: P1 implemented — `src/lib/amazon-iap.ts` (RVS client and receipt rules),
`src/lib/amazon-subscriptions.ts` (persistence), `iap_receipts` and the two app
endpoints `POST /api/v1/amazon/purchase` and `POST /api/v1/amazon/refresh`
(`npm run test:amazon-iap`, also part of CI). P3 is in as well: the RTN webhook
(`src/lib/amazon-rtn.ts`, `POST /api/webhooks/amazon/rtn`), the pull sync
(`src/lib/amazon-sync.ts`, `POST /api/internal/amazon-sync`) and the scheduler
script `scripts/amazon-sync.mjs` (`npm run amazon:sync`). P2 is in as well: the
Amazon flavour integrates the Appstore SDK, renders the purchase card and
restores a purchase through `getPurchaseUpdates`. P4 is prepared as well: the
Amazon flavour now builds with `PREMIUM_SALES = true` and `PREMIUM_CHANNEL =
amazon`, version 1.3.0 (build 10), and the release workflow asserts both values
plus the bundled SDK.

**Premium value:** premium gates *Weiterschauen auf allen Geräten*. Positions are
stored locally as before and, for accounts the server reports as `premiumActive`,
synced through `PUT`/`GET /api/v1/progress`; free accounts receive
`402 premium_required` and stay local. That closes the "gates nothing" gap that
blocked submission.

### 0. Preconditions

| # | Precondition | Why it blocks the work |
| --- | --- | --- |
| 1 | Premium gates at least one shipped feature | **Done:** cross-device resume, enforced in `/api/v1/progress` |
| 2 | Amazon developer account with tax and bank details, app already listed | IAP items and the shared key live in the console |
| 3 | Release build signed with the upload key whose certificate hash is registered in the console | IAP refuses unsigned or unknown signers |
| 4 | Decision on the cross-channel rule (see §5) | Determines the conflict response the app has to handle |

### 1. Appstore SDK in the `amazon` flavor

Only the Amazon flavor gets the SDK; the direct build keeps Stripe and stays
free of Amazon classes.

```kotlin
// android/app/build.gradle.kts
amazonImplementation("com.amazon.device:amazon-appstore-sdk:3.0.9")
// in the amazon flavor block, next to PREMIUM_SALES:
buildConfigField("String", "PREMIUM_CHANNEL", "\"amazon\"")
// direct flavor: PREMIUM_CHANNEL = "web"
```

`PREMIUM_SALES` stays the single visibility switch. It flips to `true` for the
Amazon flavor only in the release that ships IAP, so build 9 remains correct.

New client code, all behind the flavor:

| File | Responsibility |
| --- | --- |
| `android/app/src/main/java/.../billing/PremiumBilling.kt` | Store interface, offer, receipt and outcome types; `UnavailablePremiumBilling` for the direct build |
| `android/app/src/main/java/.../billing/PremiumPurchaseController.kt` | State machine `Loading`/`Unavailable`/`Ready`/`Purchasing`/`Pending`/`Active`/`Error`; submits the receipt, acknowledges only after the server agreed |
| `android/app/src/amazon/java/.../billing/AmazonPremiumBilling.kt` | `registerListener`, `getProductData`, `purchase`, `getPurchaseUpdates`, `notifyFulfillment` |
| `.../billing/PremiumBillingProvider.kt` | Per-flavour factory (Amazon SDK vs. unavailable) |
| `android/app/src/main/java/.../ui/PremiumCard.kt` | Price, „Premium über Amazon abschließen“, „Kauf wiederherstellen“, renewal date, errors |

The UI must be reachable with the Fire TV remote: one focusable button, no text
input, no scroll trap. Purchase result handling:

| `PurchaseResponse.Status` | Behaviour |
| --- | --- |
| `SUCCESSFUL` | Send `receiptId` + `userId` to the server, grant nothing locally, call `notifyFulfillment(FULFILLED)` only after the server confirms |
| `ALREADY_PURCHASED` | Run the restore path (`getPurchaseUpdates(false)`) instead of an error |
| `PENDING` | Show „Zahlung wird geprüft“, re-check on next start |
| `INVALID_SKU`, `NOT_SUPPORTED`, `FAILED` | Localised error plus a support hint, no entitlement |

### 2. Server: RVS client (`src/lib/amazon-iap.ts`)

Request format (Amazon, `verifyReceiptId` operation version 1.0):

```
{base}/version/1.0/verifyReceiptId/developer/{sharedSecret}/user/{appUserId}/receiptId/{receiptId}
base = https://appstore-sdk.amazon.com          (production)
     = https://appstore-sdk.amazon.com/sandbox  (RVS Cloud Sandbox)
```

The shared secret is part of the **URL path**, so the client must never log the
request URL, and error messages must be built from the status code only.

Configuration goes into the `billing` block of `src/lib/env.ts`:

```ts
amazonRvsSharedSecret: process.env.AMAZON_RVS_SHARED_SECRET ?? "",
amazonRvsSandbox: bool(process.env.AMAZON_RVS_SANDBOX),
amazonIapSku: process.env.AMAZON_IAP_SKU ?? "premium_monthly",
amazonRtnTopicArn: process.env.AMAZON_RTN_TOPIC_ARN ?? "",
```

plus `isAmazonIapConfigured()`, mirroring `isBillingConfigured()`. Without the
secret every Amazon endpoint answers `not_configured` instead of pretending.

Client behaviour: 10 s timeout (`AbortSignal.timeout`), one retry with backoff on
HTTP 429 and 5xx, no retry on 4xx.

| RVS answer | Meaning | Server result |
| --- | --- | --- |
| 200, `productType = SUBSCRIPTION` | valid | continue with §4 mapping |
| 200, other product type | wrong item | `invalid_receipt` |
| 400 | unknown receipt | `invalid_receipt` (client 400) |
| 410 | receipt no longer valid | treat as cancelled, `status = canceled` |
| 429 | throttled | retry, then 503 `provider_busy` |
| 496 / 497 | wrong shared secret or user id | 500, `console.error` with status only, alert |
| 500 | Amazon error | 503 `provider_error` |

Fields used from the response: `receiptId`, `productId`, `termSku`, `productType`,
`autoRenewing`, `renewalDate`, `cancelDate`, `gracePeriodEndDate`,
`freeTrialEndDate`, `testTransaction`, `betaProduct`, `purchaseDate`.

`testTransaction = true` is accepted only while `AMAZON_RVS_SANDBOX` is set;
in production it is rejected with `test_receipt` so an App Tester receipt can
never grant a real entitlement.

### 3. Data model

The existing `subscriptions` row stays the single source for `/api/v1/me`:

| Column | Amazon value |
| --- | --- |
| `channel` | `'amazon'` |
| `provider` | `'amazon'` |
| `provider_customer_id` | Amazon `appUserId` from the receipt |
| `provider_subscription_id` | `termSku` |
| `current_period_end` | `renewalDate`, else `cancelDate`, else `gracePeriodEndDate` |
| `cancel_at_period_end` | `autoRenewing === false` |
| `status` | per §4 mapping |

New audit and idempotency table, added to `SCHEMA_SQL` and to the additive
`migrate()` helper in `src/lib/db.ts` (`PRAGMA table_info` + `ALTER TABLE` is not
needed here, the table is new):

```sql
CREATE TABLE IF NOT EXISTS iap_receipts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'amazon',
  receipt_id TEXT NOT NULL,
  app_user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  term_sku TEXT,
  product_type TEXT NOT NULL,
  status TEXT NOT NULL,            -- active | canceled | expired | invalid
  auto_renewing INTEGER NOT NULL DEFAULT 0,
  purchase_date TEXT,
  renewal_date TEXT,
  cancel_date TEXT,
  grace_period_end TEXT,
  test_transaction INTEGER NOT NULL DEFAULT 0,
  raw_response TEXT,
  verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_iap_receipt ON iap_receipts(provider, receipt_id);
CREATE INDEX IF NOT EXISTS idx_iap_user ON iap_receipts(user_id, provider);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subs_amazon_customer
  ON subscriptions(provider_customer_id) WHERE provider = 'amazon';
```

The partial unique index is what stops one Amazon customer from granting premium
to two accounts. `subscription_events` (already present, `provider_event_id`
unique) records every RVS result, so replays are idempotent.

### 4. Status mapping

| Receipt state | `subscriptions.status` | `premiumActive` |
| --- | --- | --- |
| `cancelDate = null`, `renewalDate > now`, no grace | `active` | true |
| `freeTrialEndDate > now` | `active` | true |
| `gracePeriodEndDate > now` | `active`, `current_period_end = gracePeriodEndDate` | true (grace) |
| `cancelDate > now` (auto-renew off, still paid) | `active`, `cancel_at_period_end = 1` | true until `cancelDate` |
| `cancelDate <= now` or HTTP 410 | `canceled`, `current_period_end = cancelDate` | false |
| `renewalDate <= now` with no newer receipt | `canceled` | false |

`effectiveStatus()` already downgrades an `active` row whose
`current_period_end` is in the past, so an out-of-date row can never keep premium
alive on its own.

### 5. Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/v1/amazon/purchase` | device bearer token | verify a receipt, bind it to the device's account |
| POST | `/api/v1/amazon/refresh` | device bearer token | re-verify the stored receipts of that account (pull model) |
| POST | `/api/webhooks/amazon/rtn` | SNS confirmation + topic check | push updates from Amazon (§7) |

The cancel route needs no change: `cancelSubscription()` already refuses
`channel = 'amazon'` and points the user to their Amazon account.

**`POST /api/v1/amazon/purchase`**

```json
{ "receiptId": "wE1EG1gs...", "appUserId": "wE1EG1gs...:1:11", "productId": "premium_monthly" }
```

1. `verifyDeviceToken` → `userId`; reject with `forbidden` if the device is not active.
2. Rate limit per user (`rateLimit`, `rateLimitKey("amazon:user", user.id)`, 10 / 600 s).
3. `productId` must equal `AMAZON_IAP_SKU`, otherwise `invalid_product`.
4. Look up `iap_receipts` by `receipt_id`. If it exists for the same user and was
   verified less than 10 minutes ago, return the stored entitlement (idempotent replay).
5. Verify with RVS. Any `496`/`497` is a server misconfiguration, never a user error.
6. Reject `200` responses whose `productId` differs from the receipt request.
7. Apply the conflict rules below, write `subscriptions` and `iap_receipts` in one
   transaction, append `subscription_events`, `logAudit`.
8. Answer `{ ok: true, subscription: { status, channel, premiumActive, currentPeriodEnd, autoRenewing } }`.

The app shows premium only after this response; the receipt alone grants nothing.

Conflict rules (deterministic, no silent merges):

| Current state | Rule |
| --- | --- |
| no subscription or `status` in `none`/`canceled` | activate Amazon |
| `channel = 'amazon'`, same `appUserId` | update dates and status |
| `channel = 'amazon'`, different `appUserId` | 409 `receipt_owned_by_other_account` |
| `channel = 'web'`, `status = 'active'` | 409 `already_active_web`, keep the web row; support resolves double billing |
| `channel = 'web'`, anything else | activate Amazon, keep the old row in `iap_receipts` history |

**`POST /api/v1/amazon/refresh`** – no body. Re-verifies the newest receipt per
`receipt_id` for the token's `userId`, applies §4, returns the same subscription
shape. The app calls it when the settings screen opens and after `getPurchaseUpdates`.

`/api/v1/me` keeps its current shape and only reports what the row says. Adding
auto-renewal fields to it would require checking that the app's JSON parser
ignores unknown keys — do that before extending the payload.

### 6. Account linking without Login with Amazon

The existing device pairing is the identity anchor: the receipt is submitted by
a paired device, so the server already knows which StreamingHub account it
belongs to. `provider_customer_id` records the Amazon customer for later
re-verification and for the partial unique index.

Consequences to accept and document in the help pages:

- A purchase made on a Fire TV that is **not** paired cannot be attached later,
  because Amazon only exposes the receipt on the buying device/account. The
  restore path (`getPurchaseUpdates(false)`) covers a reinstall on the same device
  and a second paired device of the same Amazon account.
- If a user pairs a second StreamingHub account on a device that already bought
  premium, the purchase endpoint returns `receipt_owned_by_other_account`; support
  moves the entitlement manually.
- Quick Subscribe (one-click account creation, Appstore SDK ≥ 3.0.5) is not part
  of this plan. It only makes sense once the website has a dedicated Amazon signup.

### 7. Renewals, grace period and cancellation

Amazon pushes state changes via **Real-Time Notifications** (SNS). Without RTN you
fall back to polling RVS.

`POST /api/webhooks/amazon/rtn`:

1. Parse the SNS envelope; on `SubscriptionConfirmation` fetch `SubscribeURL` and
   return 200 (this is the console's endpoint confirmation).
2. Check `TopicArn` against `AMAZON_RTN_TOPIC_ARN`, verify the SNS message
   signature against the Amazon certificate for the message's `SigningCertURL`,
   reject anything else with 403.
3. Return 200 immediately, then re-verify `receiptId` with RVS — the notification
   is only a trigger, RVS stays authoritative.
4. Apply §4 and record `subscription_events` with
   `provider_event_id = "amazon:<notificationType>:<receiptId>"`.

| Notification | Effect after RVS re-verification |
| --- | --- |
| `SUBSCRIPTION_PURCHASED`, `SUBSCRIPTION_RENEWED`, `SUBSCRIPTION_OUT_OF_GRACE_PERIOD`, `SUBSCRIPTION_CONVERTED_FREE_TRIAL_TO_PAID` | `active`, new `current_period_end` |
| `SUBSCRIPTION_AUTO_RENEWAL_OFF`, `SUBSCRIPTION_SCHEDULED_TO_END` | `cancel_at_period_end = 1` |
| `SUBSCRIPTION_IN_GRACE_PERIOD` | `past_due`, `current_period_end = gracePeriodEndDate` |
| `SUBSCRIPTION_CANCELLED`, `SUBSCRIPTION_EXPIRED` | `canceled` |
| `SUBSCRIPTION_AUTO_RENEWAL_ON` | re-verify, usually `active` + `cancel_at_period_end = 0` |
| `SUBSCRIPTION_MODIFIED_*` | re-verify, follow `deferredDate`/`deferredSku` |

Fallback sync: `scripts/amazon-sync.mjs`, run daily by the existing scheduler
pattern, re-verifies every receipt whose `renewal_date` or `cancel_date` lies
within ±3 days and marks overdue rows `canceled`. It logs counts only, never
receipt or customer identifiers.

The webhook lives in `src/app/api/webhooks/amazon/rtn`: it verifies the SNS
signature against the certificate from an allowlisted `amazonaws.com` host,
rejects stale messages and a foreign `TopicArn`, records each processed event in
`subscription_events` (so SNS retries are no-ops) and then re-verifies the
receipt with RVS. `SubscriptionConfirmation` fetches the confirmation URL once.

Cancellation stays in the Amazon account. The app shows „Abo verwalten“ linking
to Amazon's subscription page, and the dashboard already renders the Amazon
channel read-only.

### 8. Price and copy

- The price comes from `getProductData`, never from `PREMIUM_PRICE_EUR`; the
  Amazon price may differ per marketplace.
- `src/i18n/de.ts` → `premium.channels.amazon` becomes „Im Fire-TV-Build über
  Amazon abgeschlossen“ and `subscription-terms` gains the Amazon channel clause
  (30 % revenue share is Amazon's, not a customer-facing fact).
- The Amazon build keeps no link to `/dashboard/subscription` while
  `PREMIUM_CHANNEL = "amazon"`: the checkout link stays hidden as in build 9.

### 9. Console and configuration checklist

1. IAP item `premium_monthly`, type *Subscription*, term *1 Month*, price per
   marketplace; submit it for review.
2. Shared key page → value into `AMAZON_RVS_SHARED_SECRET` (Fly secret, never in
   the repo).
3. Register the release certificate hash under *Appstore Certificate Hashes*:
   SHA-256 `34aefdb6f9dc697f4e5cd85794e0cb3b39756ef1b0086b24637016c8774ed07e`
   (`CN=StreamingHub`, build 10).
4. Register the RTN endpoint URL and complete the confirmation flow; put the topic
   ARN into `AMAZON_RTN_TOPIC_ARN`, set `AMAZON_SYNC_TOKEN` and schedule
   `npm run amazon:sync` once a day as the pull fallback.
5. App Tester on a Fire TV device with the sandbox shared secret
   (`AMAZON_RVS_SANDBOX=1`).
6. Live App Testing run before submission; `betaProduct`/`testTransaction`
   receipts must be rejected in production.

### 10. Test cases

Server (`node --test`, RVS mocked via injected `fetch`):

| # | Case | Expectation |
| --- | --- | --- |
| 1 | valid monthly receipt | `active`, `channel = amazon`, `currentPeriodEnd = renewalDate`, `premiumActive = true` |
| 2 | unknown receipt (RVS 400) | 400 `invalid_receipt`, no subscription change |
| 3 | RVS 410 | `canceled`, `premiumActive = false` |
| 4 | same receipt submitted twice | one `iap_receipts` row, one event, second call 200 with same state |
| 5 | receipt for another `appUserId` than the bound account | 409 `receipt_owned_by_other_account`, no write |
| 6 | web subscription active | 409 `already_active_web`, web row untouched |
| 7 | `autoRenewing = false`, `cancelDate` in the future | `active`, `cancel_at_period_end = 1`, premium until `cancelDate` |
| 8 | `renewalDate` in the past | `canceled`, `premiumActive = false` |
| 9 | `testTransaction = true` in production | 400 `test_receipt`, no write |
| 10 | RVS 496 / 497 | 500, error log without secret, no subscription change |
| 11 | `/api/v1/me` after purchase | `subscription.channel = "amazon"`, `premiumActive = true` |
| 12 | `POST /api/subscription/cancel` with `channel = amazon` | refused with the Amazon hint |
| 13 | RTN with foreign `TopicArn` or bad signature | 403, no write |
| 14 | RTN `SUBSCRIPTION_RENEWED` replayed | idempotent, one event |

Android (Robolectric, fake `AmazonIapClient`):

| # | Case | Expectation |
| --- | --- | --- |
| 1 | `PREMIUM_SALES = false` (build 9) | no premium row, no purchase button, unchanged behaviour |
| 2 | Amazon flavour with price loaded | price text from `ProductData`, one focusable button |
| 3 | purchase `SUCCESSFUL` then server 409 | error state, no local premium flag |
| 4 | `ALREADY_PURCHASED` | restore path runs, server refresh called |
| 5 | server unreachable | retry hint, premium stays whatever the server last said |
| 6 | pairing and account deletion | still reachable, unchanged |

Manual (device required):

1. App Tester purchase → RVS sandbox → premium visible after server ack.
2. App Tester cancel / auto-renew off → status flips after refresh.
3. Live App Testing purchase with a real Amazon account.
4. Reinstall on the same device → restore grants premium again.
5. Second paired device, same Amazon account → restore works.
6. Second StreamingHub account on the same device → 409, support message.
7. Remote-only navigation: every purchase step reachable with D-pad, no touch.
8. Purchase with a pending payment method → pending copy, no premium.

### 11. Rollout phases

| Phase | Content | Gate |
| --- | --- | --- |
| P0 (done) | Premium feature exists and is gated | cross-device resume, server-enforced for every device |
| P1 | `amazon-iap.ts`, `iap_receipts`, `/purchase` + `/refresh`, tests 1–12 | suite green, no secret in logs |
| P2 (done) | SDK in the Amazon flavour, purchase UI, restore, 16 Robolectric/JVM tests | App Tester purchase end-to-end (needs a device) |
| P3 | RTN endpoint and daily sync | renewal and cancel reflected within minutes |
| P4 (code done) | `PREMIUM_SALES = true` for `amazon`, version 1.3.0 (build 10), workflow assertions | App Tester/LAT run and submission still open |

Until P4 the Amazon binary stays build 9 with `PREMIUM_SALES = false`.

### 12. Effort

| Part | Days |
| --- | --- |
| Server: RVS client, schema, three endpoints, tests | 5–6 |
| Android: SDK, state machine, purchase/restore UI, Robolectric tests | 5–6 |
| Console, RTN registration, App Tester and LAT runs | 3–4 |
| Review buffer and copy/legal updates | 2 |

About three weeks for one developer, plus Amazon's review time.

### 13. Open decisions

- Monthly only, or a yearly SKU with a discount (changes the state machine: two
  receipts, one entitlement).
- Whether a web subscriber may also buy on Amazon (double billing) or the app
  blocks it — §5 currently blocks it.
- Whether the premium feature is also unlocked on the web for Amazon buyers
  (the plan assumes yes, via the paired account).
- Enabling the grace period in the console (recommended: yes, 3 days).

## Open questions

- Does Amazon accept a free player with optional web account pairing when the
  website sells a subscription that has no in-app effect yet? Option A avoids
  needing the answer, which is part of why it is recommended.
- If premium later gates playback, the web subscription for Amazon users becomes
  a policy violation regardless of what the app links to — the entitlement itself
  must then come from IAP.

## Sources

- Monetization and Advertising Policy: `developer.amazon.com/docs/policy-center/monetization.html`
- IAP FAQ (Q5–Q7, "no exception"): `developer.amazon.com/docs/in-app-purchasing/iap-faqs.html`
- App submission compliance blog (2025): `developer.amazon.com/apps-and-games/blogs/2025/02/navigating-app-submission-and-compliance`
- Appstore SDK IAP (implementation, receipt flow): `developer.amazon.com/docs/in-app-purchasing/iap-implement-iap.html`
- RVS for Appstore SDK IAP (request/response, status codes, `renewalDate`/`cancelDate`): `developer.amazon.com/docs/in-app-purchasing/iap-rvs-for-android-apps.html`
- Real-Time Notifications (SNS push, notification types): `developer.amazon.com/docs/in-app-purchasing/real-time-notifications.html`
- Appstore SDK 3.0.9 and release notes: `developer.amazon.com/docs/appstore-sdk/release-notes.html`
- Appstore for Android discontinued on 20 August 2025: `developer.amazon.com/docs/app-submission/release-notes.html`
- Billing Compatibility SDK support ends 15 September 2026: `developer.amazon.com/docs/in-app-purchasing/iap-whats-new.html`
