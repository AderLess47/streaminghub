# StreamingHub Android

Universelle Android-App für Fire TV, Android TV, Smartphones und Tablets.
Eine APK, ein gemeinsames Compose-Design, Media3/ExoPlayer-Wiedergabe.

## Funktionen der Version 1.2

- M3U-/M3U8-Import per URL oder Datei
- Automatische Einordnung in Live-TV, Filme und Serien
- Suche, Kategorien, Favoriten
- Fokusführung für Fernbedienungen und adaptive Karten für Touch-Geräte
- Wiedergabe von HLS- und VOD-Quellen über Media3/ExoPlayer
- Lokaler Wiedergabefortschritt für Filme und Serien
- Playlist aktualisieren und lokal entfernen
- Gerätekopplung über einen Einmalcode auf `streaminghub.org/activate`
- Anzeige von Konto, Gerät und Premium-Status über die StreamingHub-API
- Verschlüsselte lokale Speicherung des Aktivierungstokens (Android Keystore)
- XMLTV-EPG-Import per URL oder Datei
- Programmführer mit laufender und nächster Sendung
- Lokale Sendungserinnerungen per Benachrichtigung
- Low-Spec-Modus mit kürzeren Listen, ohne Logo-Vorladen und kleineren Wiedergabepuffern
- Dauerhafter Playlist-Cache: letzter Stand beim Start sofort verfügbar, Hintergrundaktualisierung nach 15 Minuten

StreamingHub stellt keine Sender, Filme, Serien oder Playlists bereit. Die
App verarbeitet ausschließlich die vom Nutzer hinzugefügten Quellen.

Die Konto-Kopplung ist optional. Für die Aktivierung werden nur Gerätename,
Plattform und App-Version an StreamingHub übertragen; Playlist, EPG und
Wiedergabedaten bleiben lokal. Zahlungen, VPN/Proxy, Profile und weitere
Sprachpakete sind noch nicht Teil dieser Version.

## Voraussetzungen

- JDK 17
- Android SDK Platform 35 und Build-Tools 35.0.0
- Gradle 8.11.1 oder das mitgelieferte Wrapper-Skript

`local.properties` mit `sdk.dir` muss lokal vorhanden sein. Sie wird nicht
versioniert.

## Bauen

```bash
cd android
./gradlew assembleDebug
./gradlew assembleRelease
```

Die Release-APK liegt danach unter
`app/build/outputs/apk/release/app-release.apk`.

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
