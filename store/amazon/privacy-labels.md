# Amazon privacy labels: questionnaire answers

Answers for the Amazon Appstore *User Data Privacy Questionnaire* for
StreamingHub (`de.streaminghub.app`, version 1.3.0, website
`streaminghub.org`). Every row below is derived from the shipped code, not from
intent — the evidence column names the file that collects or stores the value.

Privacy policy URL: `https://streaminghub.org/privacy`
Account deletion URL: `https://streaminghub.org/account-deletion`

## App-level answers

| Question | Answer |
| --- | --- |
| Does your app collect user data or transfer it to third parties? | **Yes.** |
| Does the app transfer user data to third parties for advertising or analytics? | **No.** No analytics, advertising or crash-reporting SDK is bundled. |
| Are accounts created inside the app? | No. Accounts are created on `streaminghub.org`; the app can optionally pair a device with an existing account. |
| Can users request account deletion? | Yes — dashboard plus the public page above. |

Processors that handle data on our behalf (not third-party transfers under
Amazon's definition): Fly.io (hosting), Resend-compatible email delivery
(`EMAIL_API_KEY`), Cloudflare R2 (APK downloads), Stripe (checkout, hosted by
Stripe; card data never reaches us).

## Data types collected

| Amazon category | Data type | Collected | Transferred to third parties | Required / optional | Purposes |
| --- | --- | --- | --- | --- | --- |
| User info | Name | Yes | No | Optional (display name) | App functionality, Account management |
| User info | Email address | Yes | No | Required for an account | App functionality, Account management, Developer communications |
| User info | User IDs | Yes | No | Required for an account | App functionality, Account management, Fraud prevention, security and compliance |
| Messages | Emails | Yes | No | Optional (support/contact only) | App functionality (support), Developer communications |
| Other user-generated content | Stored M3U source URL | Yes | No | Optional, only when explicitly stored for a device | App functionality |
| Device or other IDs | IP address, device name/model, platform, app version, activation token | Yes | No | Required for pairing; optional overall | App functionality, Fraud prevention, security and compliance |
| Financial info | Payment info | No | No | — | Subscription status is stored, card data is entered at Stripe only |
| App activity | Interactions, search history, installed apps | No | No | — | Search and filters run on the device; no telemetry is sent |
| App info and performance | Crash logs, diagnostics | No | No | — | No crash or diagnostics SDK is bundled |
| Location | Approximate / precise location | No | No | — | App requests no location permission |
| Contacts, calendar, photos, videos, audio, files | — | No | No | — | No such permission; a user-chosen M3U/XMLTV file is read locally and never uploaded |
| Advertising ID | — | No | No | — | No advertising SDK |
| Web browsing | Browsing history | No | No | — | No analytics or tracking pixels |

### What each collected value is used for

- **Device name, platform, app version** — shown in the customer dashboard so a
  user can tell devices apart; sent only when pairing is started
  (`StreamingHubApi.requestPairing`, `DeviceIdentity`).
- **Activation token** — bearer credential for `/api/v1/me`; stored encrypted
  with an Android Keystore key and never leaves the device except as the
  `Authorization` header (`SecureTokenStore`).
- **Account email, display name, subscription status** — read after pairing to
  show account and premium state (`StreamingHubApi.me`).
- **IP address** — rate limiting, abuse prevention and the audit trail on the
  server (`sessions.ip`, `pairing_requests.ip`, `audit_log.ip`,
  `contact_messages.ip`).
- **Support and contact messages** — answering requests
  (`support_tickets`, `ticket_messages`, `contact_messages`).

## Purposes (Amazon categories)

| Purpose | Used |
| --- | --- |
| App functionality | Yes — pairing, account display, support, stored playlist delivery |
| Account management | Yes — registration, sign-in, device list |
| Developer communications | Yes — verification, password reset, support replies |
| Fraud prevention, security and compliance | Yes — rate limits, audit log, MFA for staff |
| Developer advertising or marketing | Only with the optional opt-in checkbox; no marketing email is sent today |
| Analytics | No |
| Personalization | No |
| Other purposes | No |

## Security and retention

- **Encrypted in transit:** yes. The app talks to `streaminghub.org` over HTTPS
  only; the website sends HSTS and security headers. (Playlist URLs supplied by
  the user may be plain HTTP — that is the user's own source, not our
  collection.)
- **Deletion:** account deletion in the dashboard or without sign-in at
  `https://streaminghub.org/account-deletion`; data deletion without deleting
  the account by email to `service@streaminghub.org`.
- **Retention:** account data until deletion; security/audit logs 90 days;
  support requests at most 24 months; billing records while commercial and tax
  retention periods apply. Full wording in the privacy policy.

## Console-ready short answers

- Collects user data: **Yes**
- Third-party transfers for ads/analytics: **No**
- Data encrypted in transit: **Yes**
- Account deletion available: **Yes** — `https://streaminghub.org/account-deletion`
- Data deletion without account deletion: **Yes** — by email to `service@streaminghub.org`
- Privacy policy: `https://streaminghub.org/privacy`

## How this was verified

| Check | Result |
| --- | --- |
| Android permissions (`AndroidManifest.xml`) | only `INTERNET`, `ACCESS_NETWORK_STATE`, `POST_NOTIFICATIONS` |
| Android dependencies (`build.gradle.kts`) | AndroidX, Media3, Coil, coroutines, JUnit — no ads/analytics/crash SDK |
| Server calls in the app (`StreamingHubApi.kt`) | `/api/v1/pairing/request`, `/api/v1/pairing/status`, `/api/v1/me` |
| Server schema (`src/lib/schema.ts`) | stores email, display name, locale, session IP/UA, device name/platform/version, optional M3U URL, support messages |
| In-app deletion entry (`SettingsScreen`, `AccountDeletion`) | „Konto löschen“ opens `/account-deletion`; `AccountDeletionTest` pins the URL |
| Cookies (`session.ts`, `api/consent/route.ts`, `api/locale`) | `sh_session`, `sh_consent`, `sh_locale` — all necessary, no optional scripts shipped |

## Caveats

- The questionnaire wording changes; map these answers onto the current console
  labels instead of pasting blindly.
- Any new SDK (analytics, crash reporting, ads, push) invalidates the "No"
  rows — update the labels in the same pull request that adds it.
- Whether Amazon treats optional device pairing as "account sign-in" is a
  judgement call; we answer "collects user data: Yes" either way, so the
  stricter reading is already covered.
