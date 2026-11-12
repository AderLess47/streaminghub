# Amazon listing: English copy

English version of the Amazon Appstore listing for StreamingHub
(`de.streaminghub.app`, version 1.2.5). Keep it in sync with
[`listing.md`](listing.md); the German file stays the reference for wording and
legal statements. Plain text only, no HTML.

| Field | Limit | Used |
| --- | --- | --- |
| Display title | 80 characters | 38 |
| Short description | 1,200 characters / 2,000 bytes | 643 characters / 645 bytes |
| Long description | 4,000 characters | 1720 |
| Product feature bullets | 3–5 lines | 5 |
| Keywords | 30 terms | 20 |

## Display title

```
StreamingHub – IPTV Player for Fire TV
```

## Short description

```
StreamingHub is a technical IPTV player for Fire TV, Android TV, phones and tablets. Add your own M3U playlist by URL or from a file – the app sorts entries into live TV, movies and series, remembers favorites and plays directly on the device.

It also includes an XMLTV program guide with the current and next show, reminders, local playback progress and a low-spec mode for slower devices. The app does not provide any channels, films or series; you are responsible for the rights to your own sources. An account is optional and playback works without signing in. To try it without a playlist, load the demo library with public test streams.
```

## Long description

```
StreamingHub is a technical IPTV player for Fire TV, Android TV, phones and tablets – an app for the sources you already have.

YOUR PLAYLIST, YOUR CHANNEL LIST
Import an M3U or M3U8 playlist by URL or from a file. StreamingHub sorts entries into live TV, movies and series automatically. Search, filters and favorites help you find the right item quickly in large lists.

PLAYBACK
HLS and VOD sources play through Media3/ExoPlayer directly on the device. For movies and series the app stores playback progress locally, so you can continue where you stopped.

PROGRAM GUIDE
With an XMLTV file or URL, the guide shows the current and the next show. You can set a reminder for an upcoming show.

REMOTE AND LOW-SPEC DEVICES
The interface is built for D-pad focus navigation. Low-spec mode shortens lists, skips logo loading and shrinks playback buffers – useful on older Fire TV and Android TV devices.

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
Playback through Media3/ExoPlayer including HLS, local playback progress and favorites
XMLTV program guide with the current and next show, plus reminders for upcoming shows
D-pad-friendly focus navigation and a low-spec mode for older Fire TV and Android TV devices
Works without an account, optional pairing, and a demo library with public test streams
```

## Keywords

Comma-separated, no duplicates:

```
iptv player, m3u player, m3u8, playlist player, iptv, streaming player, xmltv, epg, tv guide, program guide, channel list, fire tv player, android tv player, hls player, media player, favorites, reminders, own playlist, iptv for fire tv, player for android tv
```

## Reviewer instructions

Amazon checks that the in-app content is testable. Paste this into the reviewer
field:

```
The app ships no content of its own. Tap “Demo-Inhalte ansehen” on the home screen (or Settings → Demo-Modus) to load six sample entries from public test streams, then play one. No account and no payment required.
```

```
Die App enthält keine eigenen Inhalte. Tippe auf dem Startbildschirm auf „Demo-Inhalte ansehen“ (oder Einstellungen → Demo-Modus), um sechs Beispiel-Einträge mit öffentlichen Teststreams zu laden, und spiele einen Eintrag ab. Kein Konto und keine Zahlung nötig.
```

The full walkthrough is in `docs/DEMO-REVIEW.md`.

## Notes for submission

- The copy deliberately promises no content: StreamingHub is a player for
  sources the user adds. This matches the website and `android/README.md`.
- No price, availability or performance claims. Premium is a website feature
  and is not advertised here while Amazon In-App Purchasing is not integrated.
- No Amazon logos and no wording that suggests a partnership; "for Fire TV"
  only describes compatibility.
- Assets live in `store/amazon/`; the demo walkthrough is in
  `docs/DEMO-REVIEW.md`.
