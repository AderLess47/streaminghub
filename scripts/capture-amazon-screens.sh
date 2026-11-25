#!/usr/bin/env bash
#
# Erzeugt die fünf Store-Screenshots für die Amazon-Einreichung in 1920×1080.
#
# Zwei Wege:
#   scripts/capture-amazon-screens.sh            # test runner (ohne Gerät)
#   scripts/capture-amazon-screens.sh --device   # echte Fire-TV-Aufnahme via adb
#
# Der Test-Runner rendert die produktiven Compose-Screens (Demo-Modus, TV-Layout
# mit 224-dp-Karten) und schreibt sie direkt in `store/amazon/screenshots/`.
# Er braucht kein Gerät, aber ein JDK 17 und ein Android SDK (ANDROID_HOME).
#
# Die Gerätevariante nimmt echte Bildschirmfotos auf. Sie ist für die finale
# Einreichung gedacht, weil dort auch das laufende Videobild im Player zu sehen
# ist – der Test-Runner kann kein Video decodieren.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="${AMAZON_SCREENSHOT_DIR:-$root/store/amazon/screenshots}"
mode="${1:-test}"

mkdir -p "$out"

if [ "$mode" = "--device" ]; then
  if ! command -v adb >/dev/null 2>&1; then
    echo "adb fehlt. Installiere die Android platform-tools." >&2
    exit 1
  fi
  if [ -z "$(adb devices | sed '1d' | awk 'NF')" ]; then
    echo "Kein Gerät verbunden. Fire TV anschließen und USB-Debugging aktivieren." >&2
    exit 1
  fi

  # Reihenfolge und Navigationspfad je Screen; die Aufnahme passiert immer erst
  # auf Bestätigung, damit kein halb geladener Screen im Store landet.
  shots=(
    "01-live-tv.png|Start: Demo-Inhalte geladen (Einstellungen → Demo-Modus oder Startknopf)"
    "02-programmfuehrer.png|Programmführer: Taste „TV“/Guide in der Kopfzeile"
    "03-player.png|Wiedergabe: einen Demo-Sender starten, Steuerung einblenden"
    "04-premium.png|Einstellungen → Premium-Karte mit „3,49 € pro Monat“"
    "05-kopplung.png|Einstellungen → „Gerät koppeln“ mit sichtbarem Code"
  )

  for entry in "${shots[@]}"; do
    file="${entry%%|*}"
    hint="${entry#*|}"
    read -r -p "Bitte „$hint“ anzeigen, dann Enter drücken (ü = überspringen): " answer
    if [ "$answer" = "ü" ]; then
      echo "übersprungen: $file"
      continue
    fi
    adb exec-out screencap -p > "$out/$file"
    echo "aufgenommen: $out/$file"
  done

  echo
  echo "Prüfe die Bildgröße (Amazon erwartet 1920×1080):"
  for entry in "${shots[@]}"; do
    file="${entry%%|*}"
    [ -f "$out/$file" ] && python3 - "$out/$file" <<'PY'
import struct, sys
data = open(sys.argv[1], "rb").read(33)
print(sys.argv[1], *struct.unpack(">II", data[16:24]))
PY
  done
  exit 0
fi

cd "$root/android"
echo "Rendere Screenshots nach $out"
AMAZON_SCREENSHOT_DIR="$out" ./gradlew testAmazonDebugUnitTest --tests '*AmazonScreenshotsTest*' "$@"

echo
echo "Fertig. Kontrolle:"
ls -l "$out"/*.png
