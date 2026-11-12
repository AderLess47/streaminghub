# Amazon listing: English copy

English version of the Amazon Appstore listing for StreamingHub
(`de.streaminghub.app`, version 1.4.0). Keep it in sync with
[`listing.md`](listing.md); the German file stays the reference for wording and
legal statements. Plain text only, no HTML.

| Field | Limit | Used |
| --- | --- | --- |
| Display title | 80 characters | 38 |
| Short description | 1,200 characters / 2,000 Bytes | 970 characters / 972 Bytes |
| Long description | 4,000 characters | 2,442 |
| Product feature bullets | 3–5 lines | 5 |
| Keywords | 30 terms | 20 |

## Display title

```
StreamingHub – IPTV Player for Fire TV
```

## Short description

```
StreamingHub is a technical IPTV player for Fire TV, Android TV, phones, tablets and large screens. Add your own M3U playlist by URL or from a file – the app sorts entries into live TV, movies and series, remembers favorites and plays directly on the device.

It also includes an XMLTV program guide with the current and next show, reminders and a low-spec mode for slower devices. The interface detects whether it runs on a television, a phone, a tablet or a large screen, and adapts card size, spacing and reading width accordingly.

With a paired account and premium bought through Amazon In-App Purchasing, movies and series continue exactly where you stopped on a second device, and you can use five devices instead of two. Without an account everything stays on the device.

The app does not provide any channels, films or series; you are responsible for the rights to your own sources. To try it without a playlist, load the demo library with public test streams.
```

## Long description

```
StreamingHub is a technical IPTV player for Fire TV, Android TV, phones, tablets and large screens – an app for the sources you already have.

YOUR PLAYLIST, YOUR CHANNEL LIST
Import an M3U or M3U8 playlist by URL or from a file. StreamingHub sorts entries into live TV, movies and series automatically. Search, filters and favorites help you find the right item quickly in large lists.

PLAYBACK AND CONTINUE WATCHING
HLS and VOD sources play through Media3/ExoPlayer directly on the device. For movies and series the app stores playback progress locally. With a paired account and premium, the position is also kept in your account: start in the living room and pick up at the same spot on a second device – the app always resumes at the later of the two positions.

PREMIUM THROUGH AMAZON
Premium is bought inside the app through your Amazon account and renews monthly; it is cancelled in your Amazon account under subscriptions. Premium includes cross-device resume and a device limit of five instead of two. Without premium, playback stays local and nothing in the app is locked.

PROGRAM GUIDE
With an XMLTV file or URL, the guide shows the current and the next show. You can set a reminder for an upcoming show.

FOR EVERY SCREEN
The interface detects the device class itself: a television gets larger cards and generous spacing, a phone gets compact cards with narrow margins, and on tablets or large screens the content stays at a readable width. Controls are built for D-pad focus navigation. Low-spec mode shortens lists, skips logo loading and shrinks playback buffers for older Fire TV and Android TV devices.

FAST START
The last playlist is cached locally and is available immediately on start. If the source is older than 15 minutes, the app refreshes it in the background.

OPTIONAL ACCOUNT
Playback works without signing in. If you want device management and premium status, pair the device with a one-time code at streaminghub.org/activate. Only device name, platform and app version are transmitted.

TRY IT WITHOUT A PLAYLIST
Load the demo library with public test streams to explore playback and the program guide.

WHAT THIS APP IS NOT
StreamingHub does not provide channels, films, series or playlists, and it is not a streaming service. You choose which sources to add and you are responsible for the rights to them.

HELP AND LEGAL
Guides and answers: streaminghub.org/help. Privacy notice: streaminghub.org/privacy.
```

## Product feature bullets

One bullet per line, no list markers:

```
Import your own M3U/M3U8 playlist by URL or file, with automatic sorting into live TV, movies and series
Playback through Media3/ExoPlayer including HLS, favorites and local playback progress
Continue watching on every device: with premium, a movie or series resumes at the same spot on your second device
Interface adapts to Fire TV, phone, tablet and large screens automatically, including a low-spec mode for older devices
XMLTV program guide with the current and next show, reminders and a demo library of public test streams
```

## Keywords

Comma-separated, no duplicates:

```
iptv player, m3u player, m3u8, playlist player, iptv, streaming player, xmltv, epg, tv guide, program guide, channel list, fire tv player, android tv player, hls player, continue watching, cross-device, own playlist, iptv for fire tv, player for android tv, iptv premium
```

## Reviewer instructions

Amazon checks that the in-app content is testable. Paste this into the reviewer
field:

```
The app ships no content of its own. Tap “Demo-Inhalte ansehen” on the home screen (or Settings → Demo-Modus) to load six sample entries from public test streams, then play one. No account and no purchase are needed for this review; the optional premium subscription only changes the device limit and cross-device resume.
```

```
Die App enthält keine eigenen Inhalte. Tippe auf dem Startbildschirm auf „Demo-Inhalte ansehen“ (oder Einstellungen → Demo-Modus), um sechs Beispiel-Einträge mit öffentlichen Teststreams zu laden, und spiele einen Eintrag ab. Für diese Prüfung ist kein Konto und kein Kauf nötig; das Premium-Abonnement ist optional und ändert nur die Geräteanzahl und das geräteübergreifende Weiterschauen.
```

The full walkthrough is in `docs/DEMO-REVIEW.md`.

## Notes for submission

- The copy deliberately promises no content: StreamingHub is a player for
  sources the user adds. This matches the website and `android/README.md`.
- Since 1.4.0 premium is sold through Amazon In-App Purchasing (SKU
  `premium_monthly`, monthly). The listing therefore names the subscription
  instead of hiding it, but never a price – the Amazon dialog shows that. Console
  steps and the test round: [`UPLOAD.md`](UPLOAD.md) and
  [`LAT-CHECKLIST.md`](LAT-CHECKLIST.md).
- No performance or success promises ("guaranteed", "best"). Premium unlocks
  exactly two things, and both are named concretely above.
- No Amazon logos and no wording that suggests a partnership; "for Fire TV" and
  "through your Amazon account" only describe compatibility and the billing
  route.
- Assets live in `store/amazon/`; the demo walkthrough is in
  `docs/DEMO-REVIEW.md`.
