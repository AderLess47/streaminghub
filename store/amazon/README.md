# Amazon Appstore assets

Assets for the Amazon Appstore listing of the StreamingHub Android app
(`de.streaminghub.app`). Sizes must match exactly — Amazon rejects wrong
dimensions without a useful error.

| File | Size | Format | Notes |
| --- | --- | --- | --- |
| `icon-114.png` | 114 × 114 | PNG, RGBA, transparent | Small icon, drawn natively at 114 px (not an upscale), heavier proportions so the mark survives thumbnailing |
| `icon-512.png` | 512 × 512 | PNG, RGBA, transparent | Large icon, no rounded corners, no border |
| `icon-firetv-1280x720.png` | 1280 × 720 | PNG, RGB, opaque | Fire TV app icon |
| `background-1920x1080.png` | 1920 × 1080 | PNG, RGB (24-bit) | Optional background image |
| `promotional-1024x500.png` | 1024 × 500 | PNG, RGB | Optional promotional image; all text ≥ 50 px from the edges and legible at 300 × 146 |
| `screenshots/01-live-tv.png` | 1920 × 1080 | PNG, RGB | Channel grid with filters and search |
| `screenshots/02-filme.png` | 1920 × 1080 | PNG, RGB | Movie grid |
| `screenshots/03-programmfuehrer.png` | 1920 × 1080 | PNG, RGB | EPG with current programme and progress |
| `screenshots/04-player.png` | 1920 × 1080 | PNG, RGB | Playback with controls |
| `screenshots/05-kopplung.png` | 1920 × 1080 | PNG, RGB | Optional device pairing |

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
Account deletion page: `https://streaminghub.org/account-deletion`.

## Important: these screenshots are renderings, not device captures

The screenshots were composed from the app's design tokens
(`ui/theme/Theme.kt`) and its real German UI labels, because no Fire TV device
or emulator was available. Channel names, film titles and programme data are
invented placeholders; no third-party logos, artwork or personal data are used.

Amazon requires screenshots that represent the submitted app. Before
submitting, either capture the same five screens on a real Fire TV device
(`adb exec-out screencap -p > shot.png`) or diff these renderings against the
running app and fix any deviation. Treat this folder as layout-ready artwork,
not as verified captures.

## Regenerating

The images are generated artwork. The banner and launcher icons that ship
inside the APK live under `android/app/src/main/res/` and are unrelated to this
folder.
