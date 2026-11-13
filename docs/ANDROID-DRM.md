# DRM auf Android: Secure Buffers und Gerätetest

Gegenstück zu Abschnitt 8 in `VEGA-RUNNER.md`. Die Vega-App hat einen Schalter
**Secure Buffers**, weil Amazons Shaka-Wrapper den geschützten Pfad ausdrücklich
angefordert bekommen muss. Android braucht diesen Schalter nicht.

## Braucht Android Secure Buffers (Widevine L1)?

**Nein, kein App-Schalter – und keine Codeänderung.** Die Gründe:

- ExoPlayer/Media3 fragt die geöffnete DRM-Sitzung, ob sie einen sicheren Decoder
  verlangt (`requiresSecureDecoder`), und wählt ihn dann selbst. Ist keiner
  vorhanden, fällt der Player auf einen unsicheren Decoder zurück und schreibt
  eine Warnung ins Log (`Drm session requires secure decoder … but no secure
  decoder available`). Das ist Media3-Verhalten, kein Zustand, den die App setzt.
- Ob L1 überhaupt verlangt wird, entscheidet die **Lizenzrichtlinie des
  Anbieters** (Security-Level, HDCP, Output Protection), nicht der Client. Eine
  App kann L1 nicht „einschalten“, sie kann nur scheitern oder abspielen.
- Der Player nutzt `PlayerView` mit dem Standard-`SurfaceView`
  (`surface_type` nicht gesetzt). Nur `SurfaceView` unterstützt geschützte
  Ausgabe; ein Wechsel auf `TextureView` würde DRM-Ausgabe brechen. Das ist der
  einzige Punkt, den eine spätere UI-Änderung nicht kaputt machen darf.
- Ein Schalter wie bei Vega wäre auf Android also irreführend: Er würde eine
  Wahl vortäuschen, die das System und die Lizenz treffen.

Was die App stattdessen tut: Sie reicht Lizenz-URL und Lizenz-Header aus
`#KODIPROP` an `DrmConfiguration` weiter (siehe `android/README.md`) und übersetzt
Fehler in verständliche Sätze (`PlaybackErrors`), darunter „Verfahren nicht
unterstützt“, „Lizenz abgelehnt“, „Lizenz abgelaufen“ und „Ausgabe nicht
erlaubt“.

Bekannte Grenze: PlayReady ist laut Media3-Tabelle nur auf Android TV
(SL2000) verfügbar; auf Telefonen und Tablets endet ein PlayReady-Sender im
Text „Dieses Gerät unterstützt das DRM-Verfahren des Senders nicht.“

## Gerätetest-Checkliste für DRM-Sender

Nicht automatisierbar: Emulatoren haben kein Widevine, L1 gibt es nur auf
zertifizierter Hardware. Mindestens prüfen:

1. **Unverschlüsselter Sender:** Wiedergabe, Ton und Fortschritt unverändert –
   die DRM-Erkennung darf klare Quellen nicht beeinflussen.
2. **Widevine-Sender auf einem L3-Gerät** (Telefon/Tablet): Lizenz wird geholt,
   Bild erscheint, im Log steht keine Warnung über einen fehlenden sicheren
   Decoder, die App bleibt bedienbar.
3. **Widevine-Sender auf einem L1-Gerät** (Fire TV / Android TV mit L1): Der
   Player wählt den sicheren Decoder selbst; HDCP-Kette (TV/AV-Receiver) prüfen.
4. **L1-Pflicht auf einem L3-Gerät:** Die Lizenz wird abgelehnt oder die Ausgabe
   verweigert – erwartet wird eine Meldung („Lizenzserver hat die Wiedergabe
   abgelehnt“ bzw. „Ausgabe nicht erlaubt“) und ein funktionierender Rückweg,
   kein schwarzes Bild.
5. **Fehlerfälle:** ungültige oder abgelaufene Lizenz, Lizenzserver nicht
   erreichbar, HTTP 401/403 – jeweils Meldung im Player, `Zurück` funktioniert.
6. **Lizenz-Header:** Ein Anbieter mit `Authorization`-Header im `license_key`
   spielt ab; im Diagnose-Protokoll tauchen weder Header-Wert noch Lizenz-URL
   auf (protokolliert wird nur der Sendername mit gekürzter URL und das
   DRM-Verfahren).
7. **Bedienung unter DRM:** Pause, ±10 s, Fortsetzen aus dem Fortschritt und die
   Fortschrittsmeldung an die API funktionieren.
8. **Lange Wiedergabe:** Lizenz-Ablauf und Renewal, falls der Anbieter kurze
   Lizenzen ausstellt; App in den Hintergrund und zurück.
9. **Ton:** Geschütztes Video mit ungeschütztem Audio – Ton läuft und bleibt
   lippensynchron.
10. **Bildschirmwechsel:** HDMI-Trennung oder Wechsel auf einen nicht
    HDCP-fähigen Ausgang führt zu einer verständlichen Meldung statt zu einem
    Absturz.

## Was hier nicht geprüft ist

- Kein Gerätelauf in dieser Umgebung: Widevine-Lizenzen und L1-Verhalten sind
  offen, die Checkliste ist die Vorlage dafür.
- Die Repo-CI baut kein Android; die Unit-Tests decken Parser, Ablage und
  Fehlertexte ab, nicht die Wiedergabe.
