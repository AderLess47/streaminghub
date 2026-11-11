# Demo mode for store review

Reviewers can exercise every screen of the Android app without an account, a
provider playlist or any personal data. The demo is not enabled automatically;
it is a single, reversible action inside the app.

## Reviewer steps

1. Install the submitted APK (Amazon Appstore install, or sideload
   `streaminghub-<version>.apk`).
2. Open the app. The home screen explains that the app does not provide any
   content and offers *M3U-Playlist hinzufügen*.
3. Tap **Demo-Inhalte laden** (home screen, empty state) or open
   *Einstellungen → Demo-Modus → Demo-Inhalte laden*.
4. The library fills with six demo entries: three live streams, two films and
   one series. Use the filter chips, the search field and the favourite button.
5. Start playback. The demo sources are public HLS/MP4 test streams (Mux, Apple,
   Blender Foundation open movies) and need an internet connection; no login is
   required at any point.
6. Open the guide (*Programmführer*). It shows a running and an upcoming demo
   show per live channel; a reminder can be scheduled for the upcoming one.
7. Optional: *Einstellungen → Konto & Gerät → Gerät koppeln* starts the pairing
   flow and produces a one-time code. Account pairing is optional and never
   required for playback.
8. Remove the demo again with *Einstellungen → Demo-Modus → Demo-Inhalte
   entfernen*.

No Amazon credentials, no StreamingHub account and no payment are needed.

## What the demo deliberately is not

- It does not contain channels, films or series offered by StreamingHub; the
  product stays a technical player for sources the user provides.
- It uses no broadcaster logos, no studio artwork and no third-party branding —
  only public test streams and open movies (Blender Foundation, CC BY).
- It stores nothing remotely. Playlist, guide and playback progress stay in the
  app's local storage on the device.

## Notes for the listing text

Suggested sentence for the reviewer-instructions field:

> The app is a player with no bundled content. Tap "Demo-Inhalte laden" on the
> home screen (or under Settings → Demo-Modus) to load six sample entries with
> public test streams, then play any entry. No account or payment is required.

## Implementation

- `android/app/src/main/java/de/streaminghub/app/data/DemoLibrary.kt` — demo
  playlist (parsed by the regular `M3uParser`) and guide data generated relative
  to the current time.
- `MainViewModel.loadDemoLibrary()` / `removeDemoLibrary()` — loads and clears
  playlist plus guide with the source label `Demo-Inhalte`.
- `android/app/src/test/java/de/streaminghub/app/data/DemoLibraryTest.kt` —
  verifies entry kinds, HTTPS sources, unique guide ids and a running show.

The demo data must keep working without StreamingHub infrastructure; do not
replace the public test streams with internal or account-gated sources.
