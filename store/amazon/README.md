# Amazon Appstore assets

Assets for the Amazon Appstore listing of the StreamingHub Android app
(`de.streaminghub.app`, version 1.6.0 / build 13). Sizes must match exactly —
Amazon rejects wrong dimensions without a useful error.

| File | Size | Format | Notes |
| --- | --- | --- | --- |
| `icon-114.png` | 114 × 114 | PNG, RGBA, transparent | Small icon, drawn natively at 114 px (not an upscale), heavier proportions so the mark survives thumbnailing |
| `icon-512.png` | 512 × 512 | PNG, RGBA, transparent | Large icon, no rounded corners, no border |
| `icon-firetv-1280x720.png` | 1280 × 720 | PNG, RGB, opaque | Fire TV app icon |
| `background-1920x1080.png` | 1920 × 1080 | PNG, RGB (24-bit) | Optional background image |
| `promotional-1024x500.png` | 1024 × 500 | PNG, RGB | Optional promotional image; all text ≥ 50 px from the edges and legible at 300 × 146 |
| `screenshots/01-live-tv.png` | 1920 × 1080 | PNG, RGB | Start screen in demo mode: header, demo banner, featured card, search, filters |
| `screenshots/02-programmfuehrer.png` | 1920 × 1080 | PNG, RGB | Programme guide with running and next show |
| `screenshots/03-player.png` | 1920 × 1080 | PNG, RGB | Player chrome (channel name, group, back) on the video surface |
| `screenshots/04-premium.png` | 1920 × 1080 | PNG, RGB | Settings → Premium card with the Amazon price and both buttons |
| `screenshots/05-kopplung.png` | 1920 × 1080 | PNG, RGB | Device pairing with the six-digit code |

`amazon.sdktester.json` in this folder is the App Tester item file (single
monthly subscription); see [`../../docs/IAP-AMAZON.md`](../../docs/IAP-AMAZON.md).

## Prices

| Plan | Web (Stripe) | Amazon build | Apple build |
| --- | --- | --- | --- |
| Monthly | 3,49 € | `premium_monthly`, price shown by the Amazon dialog | `premium_monthly` |
| Yearly | 34,99 € | **not sold** – no yearly SKU exists in client or server | not sold yet |

The listing copy therefore names the monthly subscription and never a price.
Do not add 3,49 €/34,99 € to the listing text: Amazon shows the store price in
its purchase dialog, and a duplicated price goes stale with the next console
change. The price is verified in the app (`PremiumCard`) and in
`amazon.sdktester.json`.

## Content safe areas

Amazon overlays badges and UI on some Fire TV assets, so the artwork keeps to
the documented safe areas:

- 1280 × 720 icon: main subject and title art inside **882 × 448 px**
  (x 199–1081, y 136–584). Current artwork ends at x = 1019.
- 1920 × 1080 background image: main subject inside **1214 × 830 px**
  (x 353–1567, y 125–955), placed on the **right**, with no app logo or title
  embedded — both are Amazon requirements for this asset.
- Screenshots are not badged and need no safe area.

Listing copy: [`listing.md`](listing.md) (German) and [`listing-en.md`](listing-en.md) (English).
Privacy-label answers: [`privacy-labels.md`](privacy-labels.md).
Content-rating answers: [`content-rating.md`](content-rating.md).
Amazon IAP architecture and console checklist: [`../../docs/IAP-AMAZON.md`](../../docs/IAP-AMAZON.md).
Upload checklist for the store binary: [`UPLOAD.md`](UPLOAD.md).
Account deletion page: `https://streaminghub.org/account-deletion`.

## Screenshots: real renders of the 1.6.0 UI

The five PNGs are produced by `scripts/capture-amazon-screens.sh`, which runs
`AmazonScreenshotsTest` on the `amazon` flavor:

- window qualifiers `w960dp-h540dp-television-xhdpi` → exactly **1920 × 1080 px**
  with the television UI mode, so cards are 224 dp with 40 dp margins, as on a
  Fire TV;
- the **real** composables (`HomeScreen`, `GuideScreen`, `PlayerTopBar`,
  `SettingsScreen`, `PairingScreen`) with the app's bundled demo library
  (`DemoLibrary`, public test streams);
- no drawn overlays, no invented version string, no third-party artwork. The
  pairing screen shows the Fire TV device profile (`Amazon Fire TV Stick`);
- `04-premium.png` renders `PremiumBillingState.Ready("3,49 €")` – the card with
  “Premium über Amazon abschließen” and “Kauf wiederherstellen”.

```bash
scripts/capture-amazon-screens.sh          # renders into this folder
scripts/capture-amazon-screens.sh --device # guided adb capture on a real Fire TV
```

**One screen still wants a device capture.** `03-player.png` shows the player
chrome on a black surface: the renderer has no video decoder, so the stream
itself is missing. Before submitting, capture that single screen on a Fire TV
with the `--device` mode (start a demo channel, show the controls). Everything
else matches the shipped layout.

The previous artwork (footer “StreamingHub 1.2.3”, six narrow columns, no
premium surface) is kept unchanged in `screenshots/archive-1.2.3/` for
reference and must **not** be submitted.

## Regenerating the icons and banner

The banner and launcher icons that ship inside the APK live under
`android/app/src/main/res/` and are unrelated to this folder. Icons, background
and promotional image carry no version string and no premium claim, so they do
not need a rebuild per release.
