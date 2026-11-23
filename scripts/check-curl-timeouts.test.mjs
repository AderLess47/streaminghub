import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { audit, inspect, ROOTS } from "./check-curl-timeouts.mjs";

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
  assert.ok(!files.some((file) => file.startsWith(`src${path.sep}`)), "src/ mit Doku-Snippets bleibt aus");
});
