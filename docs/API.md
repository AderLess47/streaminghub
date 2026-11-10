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

## 3. Account / subscription status (app)

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
  }
}
```

Returns **403** once the device has been unlinked in the portal or by support –
revocation is immediate despite the stateless token.

## 4. Website-side redemption (already implemented)

`POST /api/devices/activate` with the customer session cookie:

```json
{ "code": "AB12-CD34", "deviceName": "Wohnzimmer TV" }
```

Validates TTL, single use and attempt limits, enforces the device limit
(free 2 / premium 5, configurable in `settings`) and links the device to the
logged-in account.

## 5. Security requirements for the app

- Never store credentials or playlist data on StreamingHub servers.
- Treat `pollToken` and `activationToken` as secrets; keep them in secure storage.
- Poll no faster than every 3 seconds; stop on `claimed`/`expired`.
- Show a clear error after 10 minutes and offer a new code.
- Do not implement external checkout links in Amazon Appstore builds.

## 6. Not provided by this API

- No content, playlist, EPG or stream URLs are served.
- No payment initiation from the app (web checkout only for sideload builds).
