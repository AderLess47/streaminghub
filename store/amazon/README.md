# Amazon Appstore assets

Assets for the Amazon Appstore listing of the StreamingHub Android app
(`de.streaminghub.app`). Keep the sizes exactly as listed — Amazon rejects
wrong dimensions without a useful error.

| File | Size | Notes |
| --- | --- | --- |
| `icon-512.png` | 512 × 512, RGBA with transparency | Tablet/phone large icon, no rounded corners, no border |
| `icon-firetv-1280x720.png` | 1280 × 720, opaque | Fire TV store tile, no transparency |
| `screenshots/01-live-tv.png` | 1920 × 1080 | Channel grid with filters and search |
| `screenshots/02-filme.png` | 1920 × 1080 | Movie grid |
| `screenshots/03-programmfuehrer.png` | 1920 × 1080 | EPG with current programme and progress |
| `screenshots/04-player.png` | 1920 × 1080 | Playback with controls |
| `screenshots/05-kopplung.png` | 1920 × 1080 | Optional device pairing |

Small icon 114 × 114 and the optional 1920 × 1080 background image are not
included yet.

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

The images are generated artwork; the banner and launcher icons that ship
inside the APK live under `android/app/src/main/res/` and are unrelated to this
folder.
