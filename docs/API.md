# StreamingHub App API

Base URL: `https://streaminghub.org` · Version: `1.0.0` ·
Machine-readable spec: [`/api/v1/openapi.json`](/api/v1/openapi.json)

All endpoints return JSON with `cache-control: no-store`. Errors use:

```json
{ "error": { "code": "invalid_request", "message": "…", "fields": [] } }
```

Codes: `invalid_request` (400), `unauthorized` (401), `forbidden` (403),
`not_found` (404), `conflict` (409), `rate_limited` (429), `not_configured` (503),
`server_error` (500).

## 1. Request a pairing code (app)

`POST /api/v1/pairing/request`

```json
{ "deviceName": "Wohnzimmer TV", "platform": "firetv", "appVersion": "1.0.0" }
```

`platform`: `firetv` | `androidtv` | `android` | `ios` | `web`.

201 response:

```json
{
  "requestId": "…",
  "code": "AB12-CD34",
  "pollToken": "…",
  "expiresAt": "2026-11-09T21:55:00.000Z",
  "expiresInSeconds": 600,
  "verificationUrl": "/activate",
  "pollIntervalSeconds": 3
}
```

The plaintext code is returned **once**; only its SHA-256 hash is stored.
Limit: 15 requests per IP per hour.

## 2. Poll the result (app)

`GET /api/v1/pairing/status?requestId=…` with `Authorization: Bearer <pollToken>`

```json
{ "status": "pending", "expiresAt": "…", "activationStatus": "inactive" }
```

After the customer redeems the code:

```json
{
  "status": "claimed",
  "activationStatus": "active",
  "activatedAt": "2026-11-09T21:50:12.000Z",
  "device": { "id": "…", "name": "Wohnzimmer TV", "platform": "firetv" },
  "activationToken": "<HMAC-signed token, 30 days>"
}
```

`status` is one of `pending`, `claimed`, `expired`.

## 3. Account / subscription / managed playlist status (app)

`GET /api/v1/me` with `Authorization: Bearer <activationToken>`

```json
{
  "account": { "email": "kunde@example.com", "displayName": "Kunde" },
  "device": { "id": "…", "name": "Wohnzimmer TV", "platform": "firetv", "activationStatus": "active" },
  "subscription": {
    "plan": "premium",
    "status": "none",
    "channel": "web",
    "currentPeriodEnd": null,
    "premiumActive": false
  },
  "playlist": {
    "url": "https://anbieter.example/playlist.m3u",
    "updatedAt": "2026-11-10T12:00:00.000Z"
  }
}
```

`playlist` is `null` when no customer-confirmed, admin-managed M3U URL is stored
for the customer, or when the stored URL is assigned to a different device. If
present, the selected active paired device may use the URL to load the playlist;
legacy rows without a device assignment are available to all active devices.
The playlist content itself remains on the device.

Returns **403** once the device has been unlinked in the portal or by support –
revocation is immediate despite the stateless token.

## 3a. Cross-device resume (premium)

`GET /api/v1/progress` lists the watch positions a premium account keeps:

```json
{ "items": [{ "url": "https://anbieter.example/vod/folge-1.mp4", "positionMs": 124000, "durationMs": 2700000, "updatedAt": "2026-11-12T10:00:00.000Z" }] }
```

`PUT /api/v1/progress` with `{ "url", "positionMs", "durationMs" }` stores a
position; a finished title (within the last 10 seconds) or one below five
seconds is removed instead of resumed. Both methods need the device bearer token
and an active subscription – without premium the answer is `402
premium_required`. Positions belong to one account and are never shared across
accounts. A device resumes at the later of its local and the synced position, so
offline progress is never lost. Playlist content and stream URLs stay on the
device.

## 3b. App Store purchase (premium, Apple platforms)

`POST /api/v1/apple/purchase` with `Authorization: Bearer <activationToken>`

```json
{ "jws": "<StoreKit 2 signed transaction>" }
```

The server verifies the JWS signature chain against Apple Root CA G3, checks
`bundleId`, `productId`, `type = Auto-Renewable Subscription`, the sandbox flag
and the validity period, and only then stores the subscription. The app never
unlocks premium on its own. Answer:

```json
{ "ok": true, "subscription": { "plan": "premium", "status": "active", "channel": "apple", "currentPeriodEnd": "2026-12-13T10:00:00.000Z", "premiumActive": true } }
```

`409` means the subscription already belongs to another account or another
channel is active; both are resolved by support, never by silently merging.

`POST /api/v1/apple/refresh` re-evaluates the stored period (no body). A renewal
arrives as a new signed transaction via `/api/v1/apple/purchase`; an elapsed
period without a reported renewal ends premium here.

## 3c. App Store Server Notifications (webhook)

`POST /api/v1/apple/notifications` – called by Apple, not by the app, and
therefore without a bearer token. The body is what Notifications V2 deliver:

```json
{ "signedPayload": "<JWS>" }
```

The outer notification, the signed transaction inside it and the optional signed
renewal info are each verified against Apple Root CA G3, together with
`bundleId`, `productId`, subscription type and environment. `200` is returned for
messages that were applied **and** for those intentionally skipped (unknown
transaction, other channel, duplicate, older period), so Apple stops retrying.
`400` marks a payload that failed verification.

| Notification | Effect |
| --- | --- |
| `SUBSCRIBED`, `DID_RENEW`, `OFFER_REDEEMED`, `RENEWAL_EXTENDED`, `REFUND_REVERSED`, `TEST` | subscription follows the transaction |
| `REFUND`, `REVOKE` | premium ends immediately |
| `EXPIRED`, `GRACE_PERIOD_EXPIRED` | premium ends once the period is over |
| `DID_CHANGE_RENEWAL_STATUS`, `DID_FAIL_TO_RENEW`, `CONSUMPTION_REQUEST`, `PRICE_INCREASE` | acknowledged, no change |

## 4. Website-side redemption (already implemented)

`POST /api/devices/activate` with the customer session cookie:

```json
{ "code": "AB12-CD34", "deviceName": "Wohnzimmer TV" }
```

Validates TTL, single use and attempt limits, enforces the device limit
(free 2 / premium 5, configurable in `settings`) and links the device to the
logged-in account.

## 5. Security requirements for the app

- Never store playlist content or EPG data on StreamingHub servers. Admins may optionally store an M3U source URL that the customer provided and expressly requested; it is returned only to the selected active paired device through `/api/v1/me`. Playlist content remains local.
- Treat `pollToken` and `activationToken` as secrets; keep them in secure storage.
- Poll no faster than every 3 seconds; stop on `claimed`/`expired`.
- Show a clear error after 10 minutes and offer a new code.
- Do not implement external checkout links in Amazon Appstore builds.

## 6. Not provided by this API

- No content, EPG or stream URLs are served.
- The only playlist-related value is the optional admin-managed M3U source URL returned to the selected active paired device; playlist content is not served.
- No payment initiation from the app. Store purchases are verified server-side
  (`apple`) or via Amazon RVS (`amazon`); the web checkout stays on the website.
- The webhook is public by design; it trusts nothing but the signed payload.
