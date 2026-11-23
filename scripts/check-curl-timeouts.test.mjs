import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { audit, inspect, inspectFile, ROOTS } from "./check-curl-timeouts.mjs";

const FILE = path.join("scripts", "fixture.sh");

// Fixtures zeilenweise als Strings: so steht im Test selbst kein "curl" am
// Zeilenanfang, das die Pruefung (die auch scripts/ durchsucht) als Aufruf
// lesen wuerde.
const text = (...rows) => rows.join("\n");
const findings = (...rows) => inspect(FILE, text(...rows)).findings;

// Baut code="$(...)" so, dass im Testquelltext kein "curl" direkt hinter
// "$(" steht: die Repo-Pruefung liest scripts/ mit und wuerde das Fixture
// sonst als echten, ungedeckelten Aufruf werten.
const commandSubstitution = (command) => `code="$(${command})"`;

test("akzeptiert --max-time im selben Aufruf", () => {
  assert.deepEqual(findings("#!/usr/bin/env bash", "curl -fsSL --max-time 30 https://example.test/a -o /tmp/a"), []);
});

test("akzeptiert --max-time in einer Fortsetzungszeile", () => {
  const found = findings(
    "curl -fsSL \\",
    "  --connect-timeout 10 --max-time 180 \\",
    "  -o /tmp/a https://example.test/a",
  );

  assert.deepEqual(found, []);
});

test("akzeptiert die Kurzform -m", () => {
  assert.deepEqual(findings("curl -fsSL -m 30 https://example.test/b -o /tmp/b"), []);
});

test("akzeptiert einen Deckel aus einem einzeiligen Array", () => {
  const found = findings(
    "MY_CURL=(--connect-timeout 2 --max-time 9)",
    'curl "${MY_CURL[@]}" -fsSL https://example.test/c -o /tmp/c',
  );

  assert.deepEqual(found, []);
});

test("akzeptiert einen Deckel aus einem mehrzeiligen Array", () => {
  const found = findings(
    "CURL_PROBE=(",
    "  --connect-timeout 2",
    "  --max-time 10",
    ")",
    'curl "${CURL_PROBE[@]}" -sS -D - -o /dev/null https://example.test/',
  );

  assert.deepEqual(found, []);
});

test("akzeptiert einen Deckel aus einer einfachen Zuweisung", () => {
  const found = findings(
    'CURL_LIMIT="--connect-timeout 5 --max-time 15"',
    "curl $CURL_LIMIT https://example.test/d -o /tmp/d",
  );

  assert.deepEqual(found, []);
});

test("meldet einen ungedeckelten Aufruf in einer Zeile", () => {
  const found = findings("#!/usr/bin/env bash", "curl -fsSL https://example.test/a -o /tmp/a");

  assert.equal(found.length, 1);
  assert.equal(found[0].file, FILE);
  assert.equal(found[0].line, 2);
  assert.match(found[0].command, /example\.test\/a/);
});

test("meldet einen ungedeckelten Aufruf ueber mehrere Zeilen", () => {
  const found = findings("curl -fsSL \\", "  --retry 5 \\", "  -o /tmp/a https://example.test/a");

  assert.equal(found.length, 1);
  assert.match(found[0].command, /--retry 5/);
});

test("meldet einen ungedeckelten Aufruf in einer Kommandosubstitution", () => {
  const fixture = commandSubstitution("curl -sS -o /dev/null -w '%{http_code}' https://example.test/status || true");
  const found = inspect(FILE, fixture).findings;

  assert.equal(found.length, 1);
  assert.match(found[0].command, /example\.test\/status/);
});

test("meldet ein Array ohne Deckel", () => {
  const found = findings("MY_CURL=(--connect-timeout 2)", 'curl "${MY_CURL[@]}" -fsSL https://example.test/c');

  assert.equal(found.length, 1);
});

test("ignoriert Kommentarzeilen mit curl", () => {
  assert.deepEqual(findings("#!/usr/bin/env bash", "# curl -fsSL https://example.test/a", "  # curl ohne Deckel"), []);
});

test("ignoriert curl in Meldungstexten", () => {
  const found = findings(
    'echo "::error::Download fehlgeschlagen (curl exit 22)."',
    'echo "curl exit 28 im Timeout"',
    'echo "$artifact konnte nicht geladen werden (curl exit $status)."',
  );

  assert.deepEqual(found, []);
});

test("ignoriert curl in einem Regex-Literal", () => {
  assert.deepEqual(findings("const CURL = /(?:^|;)\\s*curl[ \\t]/;"), []);
});

test("der Deckel eines spaeteren Kommandos deckt den frueheren Aufruf nicht", () => {
  const found = findings("curl -fsSL https://example.test/a | sh; curl --max-time 5 https://example.test/b");

  assert.equal(found.length, 1);
  assert.match(found[0].command, /example\.test\/a/);
});

test("prueft auch einen YAML-run-Block", () => {
  const found = findings(
    "jobs:",
    "  lint:",
    "    steps:",
    "      - run: |",
    "          curl -fsSL \\",
    "            --retry 3 \\",
    "            -o /tmp/a https://example.test/a",
  );

  assert.equal(found.length, 1);
  assert.equal(found[0].line, 5);
});

test("zaehlt nur echte Aufrufe", () => {
  const result = inspect(
    FILE,
    text("curl --max-time 5 https://example.test/a", "# curl ohne Deckel", 'echo "curl exit 22"'),
  );

  assert.equal(result.calls, 1);
  assert.deepEqual(result.findings, []);
});

// Wrapper: curl hinter sudo/env/timeout/xargs ist derselbe Download und braucht
// denselben Deckel.
test("erkennt curl hinter einem Wrapper", () => {
  const uncapped = [
    "sudo curl -fsSL https://example.test/a",
    "env HTTPS_PROXY=http://proxy curl -fsSL https://example.test/b",
    "timeout 30 curl -fsSL https://example.test/c",
    "xargs curl -fsSL https://example.test/d",
  ].flatMap((row) => findings(row));

  assert.equal(uncapped.length, 4, "jeder Wrapper-Aufruf ohne Deckel muss gemeldet werden");
  for (const finding of uncapped) assert.match(finding.command, /curl -fsSL/);
});

test("akzeptiert einen Wrapper-Aufruf mit Deckel", () => {
  assert.deepEqual(findings("sudo curl -fsSL --max-time 20 https://example.test/a"), []);
  assert.deepEqual(findings("timeout 60 curl -fsSL -m 20 https://example.test/b"), []);
});

test("erkennt curl nach if/while", () => {
  const found = findings("if curl -fsSL https://example.test/health; then", "  echo ok", "fi");

  assert.equal(found.length, 1);
  assert.match(found[0].command, /health/);
});

test("command -v curl ist kein Aufruf", () => {
  const result = inspect(FILE, text("command -v curl >/dev/null || exit 1", 'if ! command -v curl; then'));

  assert.equal(result.calls, 0);
  assert.deepEqual(result.findings, []);
});

// Variablen, die den ganzen Aufruf enthalten.
test("akzeptiert einen ganzen Aufruf in einer Variablen mit Deckel", () => {
  const found = findings(
    'CURL_CMD="curl -fsS --max-time 8"',
    '$CURL_CMD https://example.test/a -o /tmp/a',
  );

  assert.deepEqual(found, []);
});

test("meldet einen ganzen Aufruf in einer Variablen ohne Deckel", () => {
  const found = findings('CURL_CMD="curl -fsS"', "$CURL_CMD https://example.test/a -o /tmp/a");

  assert.equal(found.length, 1);
  assert.match(found[0].command, /CURL_CMD=/);
});

test("akzeptiert einen Deckel am Aufruf selbst", () => {
  const found = findings(
    'CURL_CMD="curl -fsS"',
    "$CURL_CMD --max-time 8 https://example.test/a -o /tmp/a",
  );

  assert.deepEqual(found, []);
});

test("eine Variable ohne curl ist kein Aufruf", () => {
  const result = inspect(FILE, text('BASE_URL="https://example.test"', "$BASE_URL"));

  assert.equal(result.calls, 0);
  assert.deepEqual(result.findings, []);
});

// wget: wget selbst kennt keinen Gesamtdeckel, --timeout/-T deckelt nur DNS,
// Verbinden und Lesen; als Deckel zaehlt nur der timeout-Wrapper.
test("meldet wget, das nur --timeout oder -T hat", () => {
  for (const row of [
    "wget --timeout=30 -q -O /tmp/a https://example.test/a",
    "wget -T 30 -q -O /tmp/b https://example.test/b",
    "sudo wget --timeout=20 -q -O /tmp/c https://example.test/c",
  ]) {
    const found = findings(row);
    assert.equal(found.length, 1, row);
    assert.equal(found[0].kind, "wget", row);
    assert.match(found[0].command, /wget/, row);
  }
});

test("akzeptiert wget hinter einem timeout-Wrapper", () => {
  assert.deepEqual(findings("timeout 180 wget -q -O /tmp/a https://example.test/a"), []);
  assert.deepEqual(findings("sudo timeout 180 wget -q -O /tmp/b https://example.test/b"), []);
  assert.deepEqual(
    findings("env HTTPS_PROXY=http://proxy timeout 60 wget -q -O /tmp/c https://example.test/c"),
    [],
  );
});

test("meldet wget ohne Deckel", () => {
  const found = findings("wget -q -O /tmp/a https://example.test/a");

  assert.equal(found.length, 1);
  assert.equal(found[0].kind, "wget");
  assert.match(found[0].command, /example\.test\/a/);
});

test("akzeptiert einen wget-Aufruf aus einer Variablen mit timeout-Wrapper", () => {
  const found = findings(
    'WGET_CMD="timeout 60 wget -q"',
    "$WGET_CMD https://example.test/a -O /tmp/a",
  );

  assert.deepEqual(found, []);
});

test("ein --timeout aus einer Variablen deckt wget nicht ab", () => {
  const found = findings(
    'WGET_LIMIT="--timeout=60"',
    "wget $WGET_LIMIT -q -O /tmp/a https://example.test/a",
  );

  assert.equal(found.length, 1);
  assert.equal(found[0].kind, "wget");
});

test("meldet einen wget-Aufruf aus einer Variablen ohne Deckel", () => {
  const found = findings('WGET_CMD="wget -q"', "$WGET_CMD https://example.test/a -O /tmp/a");

  assert.equal(found.length, 1);
  assert.equal(found[0].kind, "wget");
});

// node fetch: als Download zaehlt nur, was die Antwort in eine Datei schreibt;
// der Deckel ist AbortSignal.timeout(...).
const fetchDownload = (call, prefix = []) =>
  text(
    ...prefix,
    "async function download(url, target) {",
    `  const response = await ${call};`,
    "  await pipeline(Readable.fromWeb(response.body), createWriteStream(target));",
    "}",
  );

test("akzeptiert fetch mit AbortSignal.timeout", () => {
  const fixture = fetchDownload("fetch(url, { signal: AbortSignal.timeout(120_000) })");

  assert.deepEqual(inspect(FILE, fixture).findings, []);
  assert.equal(inspect(FILE, fixture).fetch, 1);
});

test("akzeptiert fetch mit Deckel aus einer Konstante", () => {
  const fixture = fetchDownload("fetch(url, { signal: LIMIT })", ["const LIMIT = AbortSignal.timeout(60_000);"]);

  assert.deepEqual(inspect(FILE, fixture).findings, []);
});

test("meldet einen ungedeckelten fetch-Download", () => {
  const result = inspect(FILE, fetchDownload("fetch(url)"));

  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].kind, "fetch");
  assert.equal(result.findings[0].line, 2);
});

test("ein fetch ohne Dateizugriff ist kein Download", () => {
  const result = inspect(
    FILE,
    text(
      "async function check(url) {",
      "  const response = await fetch(url);",
      "  return response.json();",
      "}",
    ),
  );

  assert.equal(result.fetch, 0);
  assert.deepEqual(result.findings, []);
});

test("eine fetch-Methodendefinition ist kein Download", () => {
  const result = inspect(
    FILE,
    text(
      "export default {",
      "  async fetch(request, env) {",
      '    writeFileSync(target, "x");',
      "    return new Response();",
      "  },",
      "};",
    ),
  );

  assert.equal(result.fetch, 0);
  assert.deepEqual(result.findings, []);
});

// Deckel aus einer gesourcten Lib-Datei. read ist injiziert, damit die Tests
// ohne Dateisystem auskommen.
const fakeFs = (files) => async (target) => {
  const name = path.basename(target);
  if (files[name] === undefined) throw new Error(`ENOENT: ${target}`);
  return files[name];
};

const sourcedScript = text(
  "#!/usr/bin/env bash",
  "set -euo pipefail",
  "source lib/download-flags.sh",
  'curl "${CURL_PROBE[@]}" -fsS -o /tmp/a https://example.test/a',
);

test("akzeptiert einen Deckel aus einer gesourcten Lib-Datei", async () => {
  const result = await inspectFile(path.join("scripts", "run.sh"), {
    read: fakeFs({
      "run.sh": sourcedScript,
      "download-flags.sh": text("CURL_PROBE=(--connect-timeout 10 --max-time 180)", 'WGET_LIMIT="--timeout=60"'),
    }),
  });

  assert.deepEqual(result.findings, []);
  assert.equal(result.curl, 1);
});

test("akzeptiert einen wget-Wrapper aus einer gesourcten Lib-Datei", async () => {
  const result = await inspectFile(path.join("scripts", "run.sh"), {
    read: fakeFs({
      "run.sh": text(
        "#!/usr/bin/env bash",
        ". lib/download-flags.sh",
        "$WGET_LIMIT -q -O /tmp/a https://example.test/a",
      ),
      "download-flags.sh": text('WGET_LIMIT="timeout 60 wget -q"'),
    }),
  });

  assert.deepEqual(result.findings, []);
  assert.equal(result.wget, 1);
});

test("loest verschachtelte Lib-Dateien auf", async () => {
  const result = await inspectFile(path.join("scripts", "run.sh"), {
    read: fakeFs({
      "run.sh": sourcedScript,
      "download-flags.sh": text(". caps.sh"),
      "caps.sh": text("CURL_PROBE=(--max-time 45)"),
    }),
  });

  assert.deepEqual(result.findings, []);
});

test("ein Zyklus aus Einbindungen terminiert und meldet den fehlenden Deckel", async () => {
  const result = await inspectFile(path.join("scripts", "run.sh"), {
    read: fakeFs({
      "run.sh": sourcedScript,
      "download-flags.sh": text(". ../run.sh"),
    }),
  });

  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].kind, "curl");
});

test("eine fehlende Lib-Datei deckt nichts ab", async () => {
  const result = await inspectFile(path.join("scripts", "run.sh"), { read: fakeFs({ "run.sh": sourcedScript }) });

  assert.equal(result.findings.length, 1);
});

// Der eigentliche Zweck: dieses Repository bleibt vollstaendig gedeckelt.
test("dieses Repository ist vollstaendig gedeckelt", async () => {
  const { calls, findings: repoFindings, files } = await audit();

  assert.deepEqual(repoFindings, [], "kein curl-Aufruf in den Skript-Verzeichnissen ohne --max-time");
  assert.ok(calls > 0, "es muessen curl-Aufrufe gefunden werden");
  for (const root of ROOTS) assert.ok(files.length > 0 && root.length > 0);
  assert.ok(
    files.some((file) => file.startsWith(`scripts${path.sep}`)),
    "scripts/ wird durchsucht",
  );
  assert.ok(
    files.some((file) => file.startsWith(`vega${path.sep}`)),
    "vega/ wird durchsucht",
  );
  assert.ok(!files.some((file) => file.startsWith(`src${path.sep}`)), "src/ mit Doku-Snippets bleibt aus");
});
