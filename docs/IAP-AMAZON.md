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

Implement Amazon's Appstore Billing Compatibility SDK with one auto-renewing
subscription SKU, validate receipts against Amazon's RVS, map the Amazon customer
to a StreamingHub account, store `channel = 'amazon'`, and let `/api/v1/me`
return the entitlement. Keep Stripe for the web and sideload users.

- **Effort:** large — app billing flow, server-side receipt validation and
  reconciliation, cancellation/grace handling, Amazon console IAP items, App
  Tester runs, price and terms parity, plus tests.
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
