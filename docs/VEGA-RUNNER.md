# Selbst gehosteter Runner für den Vega-Shaka-Test

[`.github/workflows/vega-shaka.yml`](../.github/workflows/vega-shaka.yml) baut Amazons
Shaka-Player, die App und prüft eine HLS-Wiedergabe. Der Job braucht die Vega-CLI,
JDK 21 und ein Gerät oder das Vega Virtual Device (VVD) – auf GitHub-gehosteten
Runnern ist das nicht verfügbar. Deshalb läuft er auf einem eigenen Rechner mit
dem Label `vega` und wird nur von Hand gestartet.

## 1. Rechner vorbereiten

| Anforderung | Warum |
| --- | --- |
| Ubuntu 20.04, 22.04 oder 24.04, x86_64 (oder macOS) | Windows und WSL unterstützt das Vega SDK nicht |
| mindestens 20 GB frei | SDK plus VVD-Abbilder |
| KVM (`/dev/kvm` vorhanden) | das VVD ist eine virtuelle Maschine; ohne KVM startet es nicht |
| Node 18+ (der Workflow installiert Node 20 selbst) | Build und Skripte |
| Netzwerkzugang zu `amzndevresources.com` | Amazons Shaka-Paket |

KVM prüfen:

```bash
ls -l /dev/kvm
sudo apt install -y cpu-checker && kvm-ok
```

In Cloud-VMs muss verschachtelte Virtualisierung eingeschaltet sein; viele
Standard-Instanzen haben kein `/dev/kvm`. Bare Metal oder eine Instanz mit
Nested Virtualization verwenden.

## 2. Vega SDK installieren

```bash
curl -fsSL https://sdk-installer.vega.labcollab.net/get_vvm.sh | bash
source ~/vega/env
vega --version
vega update          # SDK-Manager aktuell halten
```

Der Installer legt die CLI unter `~/vega/bin` ab und ergänzt `~/.bashrc`. Ein
`source ~/vega/env` gilt nur für die aktuelle Shell; Dienste und Cronjobs sehen
den Pfad nicht (siehe Schritt 4).

Ubuntu-Abhängigkeiten laut Amazon-Doku (Kurzfassung):

```bash
sudo apt install -y curl build-essential lz4 python3.8 libpython3.8-dev
```

Im Projekt einmal prüfen, ob SDK und Manifest zusammenpassen:

```bash
cd vega
vega project doctor
```

Amazon-Konto: Für Build und VVD ist keine Anmeldung nötig. `vega devmode login`
braucht es nur für ein physisches Fire-TV-Gerät im Developer Mode, und für die
Appstore-Einreichung ein Amazon-Developer-Konto.

## 3. VVD einmal von Hand starten

Damit der erste CI-Lauf nicht an einer Kleinigkeit scheitert:

```bash
vega virtual-device start --no-gui     # headless; ohne --no-gui öffnet sich ein Fenster
vega device list                       # erwartet VirtualDevice:Tv
vega virtual-device stop
```

Ohne `--no-gui` braucht der Start eine grafische Sitzung (X11/VNC). Auf einem
headless Runner deshalb immer `--no-gui`; der Workflow setzt das über die
Eingabe `vvd_no_gui` (Standard `true`) und das Skript-Flag `--vvd-no-gui`.

## 4. GitHub-Runner einrichten

Im Repository: **Settings → Actions → Runners → New self-hosted runner → Linux
x64**. GitHub zeigt die Befehle mit einem Token an; das Token ist kurzlebig und
gehört nicht ins Repository.

```bash
mkdir -p ~/actions-runner && cd ~/actions-runner
curl -o actions-runner.tar.gz -L <Download-URL aus der GitHub-Anzeige>
tar xzf actions-runner.tar.gz
./config.sh --url https://github.com/AderLess47/streaminghub \
            --token <TOKEN aus der GitHub-Anzeige> \
            --labels vega --unattended
./run.sh          # Probelauf im Vordergrund, mit Ctrl+C beenden
```

Dauerbetrieb als Dienst:

```bash
sudo ./svc.sh install "$USER"
sudo ./svc.sh start
sudo ./svc.sh status
```

Der Dienst liest `~/.bashrc` nicht. Damit `vega` im Job gefunden wird, entweder
symlinken:

```bash
sudo ln -s "$HOME/vega/bin/vega" /usr/local/bin/vega
```

oder in `~/actions-runner/.env` ergänzen:

```bash
PATH=/home/<user>/vega/bin:/usr/local/bin:/usr/bin:/bin
```

Prüfen, ob der Runner auftaucht: **Settings → Actions → Runners** zeigt ihn als
`Idle` mit dem Label `vega`.

## 5. Workflow einmal starten

```bash
gh workflow run "Vega Shaka smoke test" \
  -f device=VirtualDevice:Tv \
  -f smoke_url=https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8 \
  -f start_vvd=true -f vvd_no_gui=true -f skip_build=false

gh run watch
```

Oder über die Weboberfläche: **Actions → Vega Shaka smoke test → Run workflow**.
Der Lauf dauert je nach SDK-Cache 20–60 Minuten (Shaka-Bau plus App-Build).

## 6. Ergebnis lesen

- Grün heißt: Voraussetzungen erfüllt, Shaka gebaut, Typprüfung grün, `.vpkg`
  entstanden und die Wiedergabe meldete `StreamingHub smoke: wiedergabe laeuft`.
- Rot mit `Kein .vpkg gefunden` oder `shaka-player.compiled.js fehlt`: Build
  oder Setup sind gescheitert, das Log oben im Schritt nennt den Grund.
- Rot mit `Nach 120s kein "wiedergabe laeuft"`: Die App startete, aber Shaka
  meldete keinen Fortschritt. Das Artefakt `vega-smoke-logs` enthält den
  Log-Stream; hilfreich sind die Zeilen `StreamingHub smoke: …`.
- `Gerät "…" ist nicht verbunden`: VVD läuft nicht oder heißt anders
  (`vega device list`).

Was der Lauf **nicht** beweist: Bild und Ton. Das Skript erkennt nur, dass ein
Manifest geladen und Wiedergabe gemeldet wurde. Ein Blick auf das VVD-Fenster
(oder ein Screenshot aus dem Log-Stream) bleibt nötig, wenn es um Bildqualität,
Ruckeln oder Ton geht.

## 7. Häufige Stolpersteine

| Meldung | Ursache |
| --- | --- |
| `Vega-CLI nicht gefunden` | `PATH` im Dienst fehlt (Schritt 4) |
| `Java … gefunden, nötig ist 21` | falsches JDK vor dem Workflow-JDK im `PATH`; `setup-java` setzt `JAVA_HOME`, ein globales `java` kann trotzdem greifen |
| VVD startet nicht | kein `/dev/kvm`, kein `--no-gui` auf headless, zu wenig Speicher |
| `avdmanager`/Emulator-Fehler | VVD-Abbild fehlt nach SDK-Update: `vega update` und `vega virtual-device start` erneut |
| Lauf bleibt in der Warteschlange | kein Runner mit Label `vega` verbunden |

## 8. Secure Buffers (DRM) prüfen

Die App kann Sender mit DRM-Angaben aus der Playlist über den geschützten Pfad
abspielen. Der Schalter **Einstellungen → Wiedergabe → Secure Buffers** ist
standardmäßig **aus** und wirkt nur auf Sender mit `#KODIPROP`-Lizenzangaben;
unverschlüsselte Sender bleiben unverändert. Ist er an, setzt der Adapter
`secure: "true"` im Content und in den Player-Settings, worauf Amazons Wrapper
`HW_SECURE_ALL` (Widevine) beziehungsweise `SL3000` (PlayReady) verlangt.

Das lässt sich hier nicht automatisch prüfen: Die Virtual Device kann auf Linux
kein DRM (`DRM.FAILED_TO_CREATE_CDM`), L3 gibt es nur auf Macs mit M-Serie, und
L1 nur auf echten Fire-TV-Sticks. Ein Gerätetest muss deshalb mindestens
abdecken:

1. **Unverschlüsselter Sender** mit Schalter aus und an: Wiedergabe, Ton und
   Fortschritt unverändert – der Schalter darf klare Quellen nicht beeinflussen.
2. **DRM-Sender mit Schalter aus:** Wiedergabe startet über den Standardpfad,
   oder es kommt eine verständliche Lizenzmeldung statt eines schwarzen Bildes.
3. **DRM-Sender mit Schalter an:** Lizenz wird geholt, Bild erscheint, im Log
   steht kein `Shaka Error DRM.FAILED_TO_CREATE_CDM`.
4. **Fehlerfall:** ungültige oder abgelaufene Lizenz, Lizenzserver nicht
   erreichbar, HTTP-Fehler – die Oberfläche zeigt eine Meldung und bleibt
   bedienbar (`Zurück` funktioniert).
5. **Bedienung unter DRM:** Pause, ±10 s, Resume aus dem Fortschritt und die
   Fortschrittsmeldung an die API funktionieren weiterhin.
6. **Gerät ohne L1** (älterer Stick oder VVD): Schalter an führt zu einer
   klaren Fehlermeldung, Schalter aus stellt die Wiedergabe wieder her.
7. **Lange Wiedergabe:** Lizenz-Renewal beziehungsweise Ablauf, falls der
   Anbieter kurze Lizenzen ausstellt; HDCP-Anforderungen der Lizenz.
8. **Ton:** Vega unterstützt Widevine L1 nur für Video, Audio bleibt bei
   `SW_SECURE_CRYPTO` – prüfen, dass Ton läuft und lippensynchron bleibt.

Beim Testen **Fast Refresh deaktivieren**; Amazon nennt das als Known Issue für
DRM-Wiedergabe.

Nicht im Log prüfbar und deshalb bewusst zurückhaltend: Lizenz-URLs und
Lizenz-Header werden nicht protokolliert, weil sie Tokens enthalten können. Für
Fehlersuche zählt deshalb die Fehlermeldung der Oberfläche, nicht der
Lizenzinhalt.
