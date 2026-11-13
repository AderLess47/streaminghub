# StreamingHub Android

Universelle Android-App für Fire TV, Android TV, Smartphones und Tablets.
Eine APK, ein gemeinsames Compose-Design, Media3/ExoPlayer-Wiedergabe.

## Funktionen

- M3U-/M3U8-Import per URL oder Datei
- Automatische Einordnung in Live-TV, Filme und Serien
- Suche, Kategorien, Favoriten
- Fokusführung für Fernbedienungen und adaptive Karten für Touch-Geräte
- Wiedergabe von HLS- und VOD-Quellen über Media3/ExoPlayer
- DRM aus `#KODIPROP` (Widevine, PlayReady) inklusive Lizenz-URL und Lizenz-Headern; verständliche DRM-Fehlermeldungen im Player (Gerätetest: `../docs/ANDROID-DRM.md`)
- Lokaler Wiedergabefortschritt für Filme und Serien
- Playlist aktualisieren und lokal entfernen
- Gerätekopplung über einen Einmalcode auf `streaminghub.org/activate`
- Anzeige von Konto, Gerät und Premium-Status über die StreamingHub-API
- Automatische Übernahme einer vom Admin hinterlegten M3U-URL für gekoppelte Geräte
- Verschlüsselte lokale Speicherung des Aktivierungstokens (Android Keystore)
- XMLTV-EPG-Import per URL oder Datei
- Programmführer mit laufender und nächster Sendung
- Lokale Sendungserinnerungen per Benachrichtigung
- Low-Spec-Modus mit kürzeren Listen, ohne Logo-Vorladen und kleineren Wiedergabepuffern
- Dauerhafter Playlist-Cache: letzter Stand beim Start sofort verfügbar, Hintergrundaktualisierung nach 15 Minuten
- Diagnose-Protokoll für Fehler und Hardware: ansehen, teilen, löschen (Einstellungen → Diagnose)

## Demo-Modus

Für Store-Tests und zum Ausprobieren ohne eigene Playlist lädt die App unter
*Einstellungen → Demo-Modus* (oder direkt auf dem Startbildschirm) sechs
Beispiel-Einträge mit öffentlichen Teststreams und passende Programmdaten. Die
Demo ist keine Inhaltsauslieferung: keine echten Sender, keine Fremdlogos,
keine Kontodaten. Der Ablauf für Amazon-Reviewer steht in
`docs/DEMO-REVIEW.md`.

StreamingHub stellt keine Sender, Filme, Serien oder Playlists bereit. Die
App verarbeitet ausschließlich die vom Nutzer hinzugefügten Quellen.

Die Konto-Kopplung ist optional. Für die Aktivierung werden nur Gerätename,
Plattform und App-Version an StreamingHub übertragen; Playlist-Inhalte, EPG und
Wiedergabedaten bleiben lokal. Eine vom Admin hinterlegte M3U-URL wird beim
Kontoabruf empfangen und die Playlist anschließend lokal geladen. Zahlungen,
VPN/Proxy, Profile und weitere Sprachpakete sind noch nicht Teil dieser
Version.

## Diagnose

Unter *Einstellungen → Diagnose* liegt ein Protokoll für Fehler und Hardware. Es
schreibt einmal je Start einen Kopf mit Modell, Android-Version, Bildschirm,
Sprache und App-Version und danach jeden Fehler aus Playlist-, EPG-, Konto-,
Kopplungs- und Wiedergabepfaden. Die Datei bleibt im privaten App-Verzeichnis
(`files/diagnostics/diagnostics.log`), ist auf 64 000 Zeichen begrenzt und wird
nie automatisch übertragen. Tokens, E-Mail-Adressen und URL-Query-Parameter
stehen nicht darin. Format und Grenzen: `docs/APP-PARITAET.md`.

## Voraussetzungen

- JDK 17
- Android SDK Platform 35 und Build-Tools 35.0.0
- Gradle 8.11.1 oder das mitgelieferte Wrapper-Skript

`local.properties` mit `sdk.dir` muss lokal vorhanden sein. Sie wird nicht
versioniert.

## Bauen

```bash
cd android
./gradlew assembleDirectDebug
./gradlew assembleDirectRelease
```

Die Release-APK liegt danach unter
`app/build/outputs/apk/direct/release/app-direct-release.apk`.
The Amazon build is `./gradlew assembleAmazonRelease` (same code, no premium
surface; see `docs/IAP-AMAZON.md`).

Für Updates muss derselbe Release-Schlüssel verwendet werden. Der Schlüssel
liegt lokal unter `android/keystore/`, die Zugangsdaten in
`android/keystore.properties`. Beides ist über `.gitignore` ausgeschlossen und
muss vom Betreiber sicher gesichert werden. Ohne diesen Schlüssel können
bestehende Installationen nicht aktualisiert werden.

## Installieren

- **Android TV / Fire TV:** APK per Downloader-App oder Sideload übertragen,
  Installation aus unbekannten Quellen für die verwendete Datei-App erlauben.
- **Smartphone / Tablet:** APK öffnen und Installation bestätigen.

Die App benötigt Internetzugriff. HTTP-Quellen sind aktiviert, damit auch
ältere IPTV-Anbieter funktionieren.
