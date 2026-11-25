# Amazon IAP for the Fire TV build

How premium is sold in the Amazon Appstore build, how a receipt becomes an
entitlement, and what still has to happen in the Amazon Developer Console before
submission. Everything below describes `main` at version **1.6.0 (build 13)**.

## Status

Premium in the Amazon build is implemented and configured; the submission is
open. There is exactly one product: a monthly subscription.

| Fact | Evidence |
| --- | --- |
| The Amazon flavour bundles Appstore SDK IAP `com.amazon.device:amazon-appstore-sdk:3.0.9` | `android/app/build.gradle.kts` (`"amazonImplementation"(…)`), asserted in `android-release.yml` |
| One SKU: `premium_monthly` | `DEFAULT_PREMIUM_SKU` in `PremiumPurchaseController.kt`, `AMAZON_IAP_SKU` in `src/lib/env.ts` |
| The store receipt alone unlocks nothing | `PremiumPurchaseController` submits the receipt and only trusts `premiumActive` from the server |
| Receipts are verified against RVS | `src/lib/amazon-iap.ts`, `POST /api/v1/amazon/purchase` |
| Renewals and cancellations arrive as RTN and are re-verified | `src/lib/amazon-rtn.ts`, `POST /api/webhooks/amazon/rtn` |
| A pull sync covers missed notifications | `src/lib/amazon-sync.ts`, `POST /api/internal/amazon-sync`, `scripts/amazon-sync.mjs` |
| The app hides every web checkout link | `PREMIUM_SALES = true` + `PREMIUM_CHANNEL = "amazon"`; `SettingsScreen` renders `PremiumCard` only |
| Premium gates cross-device resume and the device limit | `src/lib/entitlements.ts`, `/api/v1/progress` |

The website still sells the Stripe subscription to sideload and web users; the
Apple iOS app uses the same monthly SKU through StoreKit
(`src/lib/apple-iap.ts`).

## Product model

| Channel | Product | Price | Billing |
| --- | --- | --- | --- |
| Web (Stripe) | `standard_monthly`, `standard_annual` | 3,49 € / 34,99 € | Stripe Checkout, invoices by e-mail |
| Amazon Appstore | `premium_monthly` | store price, displayed by the Amazon dialog | Amazon IAP |
| Apple App Store | `premium_monthly` | store price | StoreKit 2 |

**There is no yearly Amazon SKU.** `premium_yearly` does not exist in the client
or the server: `parseRvsResponse` rejects any `productId` that is not
`AMAZON_IAP_SKU`, and `subscriptions` rows written by Amazon keep the monthly
cadence. Adding a yearly plan means a second SKU in the console, an allowlist in
`src/lib/amazon-iap.ts`, an interval column for the entitlement and a product
picker in `PremiumCard` – a separate change, not a configuration detail.

Prices never appear in the listing copy; Amazon shows them in its own purchase
dialog, and a hard-coded price in the listing would go stale with the next
console change.

## Architecture

```
Fire TV (amazon flavour)
  PremiumCard → PremiumPurchaseController → AmazonPremiumBilling
                                              │ PurchasingService.purchase(sku)
                                              ▼
                                    PurchaseResponse (+ receiptId, appUserId)
                                              │
                        POST /api/v1/amazon/purchase  (device token)
                                              │
                               verifyReceipt → Amazon RVS (shared secret)
                                              │
                        receiptState → subscriptions + iap_receipts
                                              │
                              premiumActive in the response → UI state
                                              │
                              PurchasingService.notifyFulfillment(FULFILLED)

Amazon RTN (SNS)  →  POST /api/webhooks/amazon/rtn
                      signature + topic + freshness check → RVS re-verification
                      → same subscription write path (idempotent)

Daily/recovery sync → POST /api/internal/amazon-sync (token) → RVS per receipt
```

Key properties:

- **The server decides.** `POST /api/v1/amazon/purchase` answers with
  `subscription.premiumActive`; the client never sets a local premium flag.
- **Fulfilment after verification.** `notifyFulfillment(FULFILLED)` runs only
  after the server accepted the receipt, so a failed submission can be retried.
- **One receipt, one account.** A receipt already bound to another StreamingHub
  account returns `409`; a subscription row with `provider = 'amazon'` keeps its
  `provider_customer_id` (Amazon `appUserId`).
- **Replays are safe.** A receipt verified within the last 10 minutes with status
  `active` is answered from the database without another RVS call; `410` from RVS
  marks the receipt `canceled`, and a later re-purchase with the same receipt
  goes to RVS again.
- **Sandbox receipts never grant production premium.** `testTransaction: true`
  is accepted only while `AMAZON_RVS_SANDBOX` is set.

Data written per receipt (`iap_receipts`): `receipt_id`, `app_user_id`,
`product_id`, `term_sku`, `product_type`, `status`, `auto_renewing`,
`purchase_date`, `renewal_date`, `cancel_date`, `grace_period_end`,
`test_transaction`, `verified_at`. The subscription row carries
`channel = 'amazon'`, `provider = 'amazon'`, `provider_customer_id = appUserId`,
`provider_subscription_id = termSku`, `current_period_end` from
`renewalDate`/`cancelDate`/`gracePeriodEndDate`.

### Error codes the client sees

| Server answer | Cause | Client behaviour |
| --- | --- | --- |
| `503 not_configured` | `AMAZON_RVS_SHARED_SECRET` or `AMAZON_IAP_SKU` missing | error text from the server, no entitlement |
| `400 invalid_request` | product id differs from `AMAZON_IAP_SKU` | error, no retry |
| `409 conflict` | receipt bound to another account | error with support hint |
| `400 invalid_receipt` | RVS `400`, missing `receiptId`, wrong `productType` | error, no retry |
| `400 test_receipt` | App Tester receipt without `AMAZON_RVS_SANDBOX` | error, no entitlement |
| `503 provider_busy` / `provider_error` | RVS `429`/`5xx` after one retry | retry hint |
| `500 misconfigured` | RVS `496`/`497` (wrong secret or user id) | error, alert in the log |

## Sandbox test with the Amazon App Tester

The item data lives in [`../store/amazon/amazon.sdktester.json`](../store/amazon/amazon.sdktester.json):
one `SUBSCRIPTION` item, terms SKU `premium_monthly`, parent SKU `premium`,
`price` 3.49, `term` `Monthly`.

1. Build and install the Amazon debug build:
   ```bash
   cd android && ./gradlew :app:installAmazonDebug
   ```
2. Install *Amazon App Tester* from the Amazon Appstore on the Fire TV (or the
   Fire TV emulator) and open it once.
3. Push the item file and grant the overlay permission:
   ```bash
   adb push store/amazon/amazon.sdktester.json /sdcard/amazon.sdktester.json
   adb shell appops set com.amazon.sdktestclient SYSTEM_ALERT_WINDOW allow
   ```
4. Restart App Tester (changes are only picked up on relaunch), then open
   *IAP Items in JSON File* and confirm `premium_monthly` with 3.49.
5. Point the app at the RVS sandbox – the App Tester receipts are
   `testTransaction`, so the server must allow them:
   ```bash
   fly secrets set AMAZON_RVS_SANDBOX=1 --app streaminghub-org
   ```
   and make sure `AMAZON_RVS_SHARED_SECRET` and `AMAZON_IAP_SKU=premium_monthly`
   are set on the same app.
6. In the app: *Einstellungen → Premium* shows the store price from the item
   file, “Premium über Amazon abschließen” opens the App Tester purchase sheet.
7. Buy → the app submits the receipt → the card switches to the active state with
   the period end. Then: *Kauf wiederherstellen* after clearing app data, cancel
   in App Tester, and a second StreamingHub account on the same device (expect
   the conflict message).
8. Remove the JSON file (or set `AMAZON_RVS_SANDBOX=0`) before the LAT round, so
   no sandbox receipt can ever be verified against production rules.

Notes:

- `/.storekit`-style local testing does not exist for Amazon; App Tester *is* the
  local store.
- The App Tester only works with a debug build. Release builds talk to the real
  Appstore.
- Sandbox receipts are recorded with `test_transaction = 1`; wipe them from the
  test database before a production run if you reuse the same environment.

## Live App Testing (LAT)

1. Console → your app → *Live App Testing* → create a test, upload the signed
   `app-amazon-release.apk` produced by the `Android release` workflow, add the
   tester accounts, and start the round.
2. Testers install through the LAT link; purchases use Amazon test accounts, so
   no money moves even though the receipts are real.
3. Turn the sandbox flag off for the round: `fly secrets unset AMAZON_RVS_SANDBOX`.
4. Run [`../store/amazon/LAT-CHECKLIST.md`](../store/amazon/LAT-CHECKLIST.md):
   free account, purchase, restore, cancellation, second device, and the pending
   payment case.
5. Keep the RTN subscription confirmed during the round (`AMAZON_RTN_TOPIC_ARN`
   set, SNS subscription confirmed) and verify that a cancellation flips the
   status without opening the app.
6. End the round, then submit the same binary for review with the listing copy
   from `store/amazon/listing.md` / `listing-en.md` and the screenshots from
   `store/amazon/screenshots/`.

## Amazon Developer Console checklist

- [ ] *In-App Items*: subscription `premium_monthly`, 1 month, price 3,49 €,
      title/description matching the app.
- [ ] *In-App Items → Export Multiple IAPs (JSON)*: compare with
      `store/amazon/amazon.sdktester.json`; SKU, price and term must match.
- [ ] *Shared Secret* from the console stored as `AMAZON_RVS_SHARED_SECRET`
      (`fly secrets set`), never in the repository.
- [ ] RTN: SNS topic subscribed to
      `https://streaminghub.org/api/webhooks/amazon/rtn`; topic ARN stored as
      `AMAZON_RTN_TOPIC_ARN`; the confirmation request must reach the endpoint
      (it auto-confirms only for allowed subscribe URLs).
- [ ] `AMAZON_IAP_SKU=premium_monthly` (default, but pin it).
- [ ] `AMAZON_SYNC_TOKEN` set if the recovery sync (`scripts/amazon-sync.mjs`) is
      scheduled.
- [ ] `AMAZON_STORE_URL` set after the listing is live (see below); until then it
      stays empty and `/download` shows the "listing in preparation" state.
- [ ] Device support: Fire TV, Fire TV Stick, Fire TV Cube; remote-only
      navigation checked for every purchase step.
- [ ] Content rating and privacy questionnaire from
      `store/amazon/content-rating.md` and `store/amazon/privacy-labels.md`.

### Website link

`/download` reads `AMAZON_STORE_URL` (`env.downloads.amazonStore`). Only an
`https://` URL renders the store button; anything else keeps the disabled
placeholder, so a half-written value can never produce a dead link.

```bash
fly secrets set AMAZON_STORE_URL="https://www.amazon.de/dp/<ASIN>" --app streaminghub-org
fly secrets set AMAZON_STORE_URL="https://www.amazon.de/dp/<ASIN>" --app streaminghub-staging
```

## Tests

| Suite | Command | Covers |
| --- | --- | --- |
| RVS rules, receipt state, application conflicts | `npm run test:amazon-iap` | status codes, `test_receipt`, replay window, account conflicts |
| Route level (purchase, refresh, RTN) | `npm run test:store-api` | real SQLite, local RVS stub, receipt replay, cancellation |
| Android purchase state machine | `./gradlew testAmazonDebugUnitTest` | controller states, acknowledgement rules, restore fallback, store/network errors, restore paging (`ReceiptCollector`) |

What no test can cover here: a real App Tester purchase and a real LAT purchase.
Those are steps in the sandbox and LAT sections above; the checklists name the
expected observations.

## Known limits

- **Video frames in screenshots.** The store screenshots are rendered from the
  app's real Compose UI (`store/amazon/screenshots/`), but a video frame cannot be
  produced without a decoder. `03-player.png` therefore shows the player chrome on
  the black frame; for the final submission capture that one screen on a device
  with `scripts/capture-amazon-screens.sh --device`.
- **One page size per restore.** `getPurchaseUpdates` has no offset parameter;
  `ReceiptCollector` follows `hasMore()` for at most 10 pages and then stops, so a
  pathological purchase history cannot block the UI.
- **No yearly SKU** (see product model).

## Sources

- Appstore SDK IAP implementation and purchase updates:
  `developer.amazon.com/docs/in-app-purchasing/iap-implement-iap.html`
- Appstore SDK 3.0.9 API reference (receipt, `PurchaseUpdatesResponse.hasMore`):
  `amzndevresources.com/iap/appstore-sdk-api-reference/3.0.9/`
- RVS request/response and status codes:
  `developer.amazon.com/docs/in-app-purchasing/iap-rvs-for-android-apps.html`
- Real-Time Notifications:
  `developer.amazon.com/docs/in-app-purchasing/real-time-notifications.html`
- App Tester setup and `amazon.sdktester.json`:
  `developer.amazon.com/docs/in-app-purchasing/iap-install-and-configure-app-tester.html`
- Monetization policy: `developer.amazon.com/docs/policy-center/monetization.html`
