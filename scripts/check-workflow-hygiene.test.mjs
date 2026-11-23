import assert from "node:assert/strict";
import test from "node:test";
import { audit, inspect, REQUIRED_KEYS, WORKFLOWS_DIR } from "./check-workflow-hygiene.mjs";

const FILE = ".github/workflows/fixture.yml";

// Fixtures zeilenweise als Strings: so bleibt im Test lesbar, welche Zeile
// geprueft wird. audit() liest nur .github/workflows, die Fixtures hier melden
// sich also nicht gegenseitig.
const text = (...rows) => rows.join("\n");
const findings = (...rows) => inspect(FILE, text(...rows)).findings;
const reasons = (...rows) => findings(...rows).map((finding) => finding.reason);

const COMPLETE = [
  "name: Beispiel",
  "on:",
  "  workflow_dispatch:",
  "",
  "permissions:",
  "  contents: read",
  "",
  "concurrency:",
  "  group: beispiel-${{ github.ref }}",
  "  cancel-in-progress: false",
  "",
  "jobs:",
  "  build:",
  "    runs-on: ubuntu-latest",
  "    steps:",
  "      - run: echo ok",
];

test("akzeptiert einen Workflow mit permissions und concurrency", () => {
  assert.deepEqual(findings(...COMPLETE), []);
});

test("akzeptiert Werte in derselben Zeile", () => {
  assert.deepEqual(findings("permissions: read-all", "concurrency: beispiel"), []);
});

test("akzeptiert permissions als ausdruecklich leere Map", () => {
  assert.deepEqual(findings("permissions: {}", "concurrency: beispiel"), []);
});

test("meldet fehlende permissions am Dateianfang", () => {
  const found = findings("on: push", "concurrency:", "  group: beispiel");
  assert.equal(found.length, 1);
  assert.equal(found[0].reason, "permissions");
  assert.equal(found[0].key, "permissions");
  assert.equal(found[0].line, 1);
  assert.match(found[0].snippet, /permissions: fehlt/);
});

test("meldet fehlende concurrency", () => {
  assert.deepEqual(reasons("on: push", "permissions:", "  contents: read"), ["concurrency"]);
});

test("meldet beide Angaben in fester Reihenfolge", () => {
  assert.deepEqual(reasons("on: push", "jobs:", "  build:", "    runs-on: ubuntu-latest"), [
    "permissions",
    "concurrency",
  ]);
});

test("meldet permissions ohne Wert", () => {
  const found = findings("permissions:", "", "jobs:", "  build:", "    runs-on: ubuntu-latest");
  const empty = found.find((finding) => finding.reason === "permissions-empty");
  assert.ok(empty, "leeres permissions nicht gemeldet");
  assert.equal(empty.line, 1);
});

test("meldet concurrency ohne Wert", () => {
  const found = findings("permissions: {}", "concurrency:", "", "jobs:", "  build:");
  const empty = found.find((finding) => finding.reason === "concurrency-empty");
  assert.ok(empty, "leeres concurrency nicht gemeldet");
  assert.equal(empty.line, 2);
});

test("meldet permissions, das nur einen Kommentar traegt", () => {
  assert.deepEqual(reasons("permissions: # folgt spaeter", "concurrency: beispiel"), ["permissions-empty"]);
});

test("ignoriert auskommentierte Angaben", () => {
  assert.deepEqual(reasons("# permissions:", "#   contents: read", "# concurrency: beispiel"), [
    "permissions",
    "concurrency",
  ]);
});

test("zaehlt eingerueckte Angaben in Jobs nicht als Workflow-Kopf", () => {
  // Der klassische Fehler: Rechte nur am Job, der Rest des Workflows faellt
  // auf die Standardrechte zurueck.
  const found = findings(
    "on: push",
    "jobs:",
    "  build:",
    "    permissions:",
    "      contents: read",
    "    concurrency:",
    "      group: build",
  );
  assert.deepEqual(
    found.map((finding) => finding.reason),
    ["permissions", "concurrency"],
  );
});

test("erkennt einen Block auch hinter Leerzeilen und Kommentaren", () => {
  assert.deepEqual(
    findings(
      "permissions:",
      "",
      "  # nur lesen, mehr braucht der Lauf nicht",
      "  contents: read",
      "",
      "concurrency:",
      "  group: beispiel",
    ),
    [],
  );
});

test("verwechselt den naechsten Schluessel nicht mit einem Block", () => {
  const found = findings("permissions:", "  # folgt spaeter", "jobs:", "  build:");
  assert.deepEqual(reasons("permissions:", "  # folgt spaeter", "jobs:", "  build:"), ["permissions-empty", "concurrency"]);
  assert.equal(found[0].line, 1);
});

test("kommt mit Windows-Zeilenenden zurecht", () => {
  const crlf = COMPLETE.join("\r\n");
  assert.deepEqual(inspect(FILE, crlf).findings, []);
});

test("akzeptiert ein abschliessendes permissions ohne Zeilenumbruch", () => {
  assert.deepEqual(findings("concurrency: beispiel", "permissions:", "  contents: read"), []);
});

test("meldet eine leere Datei mit beiden Angaben", () => {
  assert.deepEqual(reasons(""), ["permissions", "concurrency"]);
});

test("zaehlt Dateien mit den Angaben fuer die Zusammenfassung", () => {
  const result = inspect(FILE, text(...COMPLETE));
  assert.equal(result.hasPermissions, true);
  assert.equal(result.hasConcurrency, true);
  const missing = inspect(FILE, text("on: push"));
  assert.equal(missing.hasPermissions, false);
  assert.equal(missing.hasConcurrency, false);
});

test("Pruefmuster deckt beide Angaben ab", () => {
  assert.equal(WORKFLOWS_DIR, ".github/workflows");
  assert.deepEqual(REQUIRED_KEYS, ["permissions", "concurrency"]);
});

test("dieses Repository hat ueberall permissions und concurrency", async () => {
  const { findings: found, files, permissions, concurrency } = await audit();
  assert.deepEqual(found, []);
  assert.ok(files.length > 0, "keine Workflow-Dateien gefunden");
  assert.equal(permissions, files.length);
  assert.equal(concurrency, files.length);
});
