# LAT checklist for build 11 (1.4.0)

Live App Testing is the only place where a real Amazon purchase happens before
customers see one. This list covers the three things build 11 changes: the
purchase itself, restoring it, and continuing a title on a second device.

Artifact, hashes and console steps live in [`UPLOAD.md`](UPLOAD.md). Money never
moves in LAT: testers pay with Amazon test accounts and the receipts are sandbox
receipts.

## Before the round starts

- [ ] IAP item `premium_monthly` exists in the console (subscription, 1 month) and
      is submitted with the app.
- [ ] `AMAZON_RVS_SHARED_SECRET` is set on the Fly app; `GET /api/v1/amazon/refresh`
      without a token answers `401` (not `503 not_configured`).
- [ ] `AMAZON_RTN_TOPIC_ARN` is set and the *Configure Amazon secrets* workflow ran,
      so renewals and cancellations arrive without polling.
- [ ] `AMAZON_RVS_SANDBOX=1` is set on the Fly app for the duration of the round.
- [ ] Two test accounts exist in App Tester (one for premium, one to prove that a
      fresh account gets nothing), each with a Fire TV device or a Fire TV Stick.
- [ ] The LAT round carries the build 11 artifact: `versionCode 11`,
      `versionName 1.4.0`, SHA-256 `ac2e1136…`.
- [ ] Website is on 1.4.0: `curl -s https://streaminghub.org/api/release`.

## A. Free account behaves as before

Device A, test account **without** purchase.

- [ ] Install from the LAT link, pair with the code from *Einstellungen → Konto &
      Gerät → Gerät koppeln*. Expected: the account row shows the email, no
      premium state.
- [ ] Open the premium card: price is shown, buttons “Premium über Amazon
      abschließen” and “Kauf wiederherstellen” are present.
- [ ] Play a title for about a minute and leave the player. Expected: no error
      appears, and no watch position reaches the server (`GET /api/v1/progress`
      answers `402 premium_required` for this account).
- [ ] Pair a second device on the same free account up to the free limit (2), then
      a third. Expected: the web activation stops with “Dein Gerätelimit ist
      erreicht”.

## B. Purchase

Device A, test account that will buy.

- [ ] Tap “Premium über Amazon abschließen”. Expected: the Amazon dialog opens with
      the store price for `premium_monthly`.
- [ ] Confirm with the test account. Expected: the card switches to “Premium aktiv”
      with the renewal date the **server** reported, not a date from the app.
- [ ] *Einstellungen → Konto & Gerät* now shows the premium state.
- [ ] Server view: `GET /api/v1/me` with the device token returns
      `"channel": "amazon"` and `"premiumActive": true`.
- [ ] `GET /api/v1/progress` now answers `200` with `{"items":[]}` instead of `402`.
- [ ] Kill and reopen the app: premium survives a restart.

## C. Continue watching on a second device

- [ ] Device A: start a title, watch ~2 minutes, leave the player. Wait 30 seconds.
      Expected: the position appears on the server (`GET /api/v1/progress` lists
      the URL with `positionMs` near 120000).
- [ ] Device B: pair the **same** account, open the same title.
      Expected: playback starts within ~30 seconds of where A stopped, not at 0.
- [ ] Reverse direction: watch two more minutes on B, reopen on A.
      Expected: A resumes at B's later position.
- [ ] Offline case: disconnect A, watch one minute, reconnect, then open the title
      on B. Expected: A's newer local position is not replaced by B's older one.
- [ ] Finished case: let a title run to the end on A. Expected: the entry
      disappears from `GET /api/v1/progress`, and B starts such a title at the
      beginning.

## D. Restore

- [ ] Device C (or B after *Einstellungen → Konto & Gerät → Lokale Kopplung
      entfernen* and a new pairing code): pair the same account, tap “Kauf
      wiederherstellen”. Expected: “Premium aktiv” appears without a second
      purchase.
- [ ] Restore on the **other** test account (no purchase): expected the error
      “Kein Kauf auf diesem Gerät gefunden.” or “Kein aktives Premium-Abo
      gefunden.”, never premium.
- [ ] Restore flow: watch position of that account still syncs after the restore.

## E. Layout on the round's devices

- [ ] On the Fire TV: cards are large (224 dp) with wide margins, the settings
      column is centred, focus moves cleanly through the grid.
- [ ] On a phone-sized window (Fire tablet or Android phone with the same APK):
      cards are compact, margins smaller, nothing is cut off.
- [ ] On a tablet or a resized window: settings stay at a readable width instead
      of stretching edge to edge.

## F. End of subscription

- [ ] Cancel the subscription in the Amazon test account, then trigger a sync
      (`npm run amazon:sync` or wait for the RTN notification).
- [ ] App: “Status aktualisieren” on the premium card. Expected: premium ends at
      the reported end of term, and `/api/v1/progress` answers `402` again.

## After the round

- [ ] Remove `AMAZON_RVS_SANDBOX` from the Fly app – sandbox receipts must be
      rejected in production.
- [ ] Remove the test devices from the test accounts (*Einstellungen → Konto &
      Gerät → Lokale Kopplung entfernen*, or in the web dashboard) so the device
      limit is free for real customers.
- [ ] Delete sandbox rows if a test account was promoted to a real one.
- [ ] Record the outcome below, then hand the same checklist to the submission
      review.

## Result

| Section | Result | Date | Notes |
| --- | --- | --- | --- |
| A free account | | | |
| B purchase | | | |
| C cross-device | | | |
| D restore | | | |
| E layout | | | |
| F end of term | | | |
