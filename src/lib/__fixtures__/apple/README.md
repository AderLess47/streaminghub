# Test-Zertifikatskette für die App-Store-Prüfung

Diese Dateien existieren **nur für Tests**. Sie sind mit `openssl` erzeugt, mit
`CN=StreamingHub Test …` benannt, laufen 2036 ab und werden ausschließlich in
`src/lib/apple-iap.test.ts` verwendet – dort wird `root.pem` als vertrauenswürdige
Wurzel übergeben.

Im Produktivbetrieb ist die einzige vertrauenswürdige Wurzel Apples Root CA G3
(`src/lib/apple-root-ca.ts`). Wer diese Testkette nicht kennt, kann damit nichts
freischalten; die Schlüssel sind kein Geheimnis und schützen nichts.

Neu erzeugen (nur nötig, wenn die Kette abläuft):

```bash
openssl ecparam -name prime256v1 -genkey -noout -out root.key.pem
openssl req -x509 -new -key root.key.pem -sha256 -days 3650 \
  -subj "/CN=StreamingHub Test Root CA/O=StreamingHub Tests" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,keyCertSign,cRLSign" -out root.pem
# Zwischenzertifikat und Blatt analog, siehe Git-Historie von docs/IAP-APPLE.md
```
