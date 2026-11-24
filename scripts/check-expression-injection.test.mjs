import assert from "node:assert/strict";
import test from "node:test";
import { audit, inspect, WORKFLOWS_DIR } from "./check-expression-injection.mjs";

const FILE = ".github/workflows/fixture.yml";

// Fixtures als Zeilen: so bleibt im Test lesbar, welche Zeile geprueft wird.
const text = (...rows) => rows.join("\n");
const findings = (...rows) => inspect(FILE, text(...rows)).findings;
const expressions = (...rows) => findings(...rows).map((finding) => finding.expression);

test("meldet einen Ausdruck in einem einzeiligen run", () => {
  const found = findings('      - run: echo "PR: ${{ github.event.pull_request.title }}"');
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 1);
  assert.equal(found[0].expression, "${{ github.event.pull_request.title }}");
  assert.match(found[0].snippet, /pull_request\.title/);
});

test("meldet einen Ausdruck in einem run-Block", () => {
  const found = findings(
    "    steps:",
    "      - name: Titel ausgeben",
    "        run: |",
    "          set -euo pipefail",
    '          echo "Titel: ${{ github.event.pull_request.title }}"',
  );
  assert.deepEqual(
    found.map((finding) => finding.line),
    [5],
  );
});

test("meldet mehrere Ausdruecke in einer Zeile einzeln", () => {
  assert.deepEqual(expressions('        run: echo "${{ github.head_ref }}" "${{ github.ref_name }}"'), [
    "${{ github.head_ref }}",
    "${{ github.ref_name }}",
  ]);
});

test("akzeptiert den Umweg ueber env", () => {
  assert.deepEqual(
    findings(
      "      - name: Titel ausgeben",
      "        env:",
      "          TITLE: ${{ github.event.pull_request.title }}",
      "        run: |",
      '          echo "Titel: $TITLE"',
    ),
    [],
  );
});

test("zählt env-Ausdruecke außerhalb des run-Blocks nicht", () => {
  const result = inspect(
    FILE,
    text("      - name: Schritt", "        env:", "          X: ${{ github.sha }}", "        run: echo ok"),
  );
  assert.deepEqual(result.findings, []);
  assert.equal(result.blocks, 1);
});

test("ignoriert run als Job-Output", () => {
  const result = inspect(
    FILE,
    text(
      "  canary:",
      "    outputs:",
      "      run: ${{ steps.decide.outputs.run }}",
      "    steps:",
      "      - run: echo ok",
    ),
  );
  assert.deepEqual(result.findings, []);
  assert.equal(result.blocks, 1);
});

test("ignoriert Ausdruecke in if und with", () => {
  assert.deepEqual(
    findings(
      "      - name: Schritt",
      "        if: ${{ github.event_name == 'push' }}",
      "        uses: actions/upload-artifact@0000000000000000000000000000000000000000",
      "        with:",
      "          name: ${{ github.head_ref }}",
      "          path: out",
    ),
    [],
  );
});

test("ignoriert reine Kommentarzeilen im Block", () => {
  const result = inspect(
    FILE,
    text("      - run: |", "          # Beispiel: ${{ github.head_ref }}", "          echo ok"),
  );
  assert.deepEqual(result.findings, []);
  assert.equal(result.blocks, 1);
});

test("erkennt gefaltete Bloecke", () => {
  const found = findings("      - run: >-", '          echo "${{ github.event.issue.title }}"');
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 2);
});

test("beendet den Block am naechsten Schluessel", () => {
  const found = findings(
    "    steps:",
    "      - name: eins",
    "        run: |",
    "          echo erster",
    "        env:",
    "          X: 1",
    "      - run: echo \"${{ github.head_ref }}\"",
  );
  assert.deepEqual(
    found.map((finding) => finding.line),
    [7],
  );
});

test("zaehlt nur echte Schritte als run-Bloecke", () => {
  const result = inspect(
    FILE,
    text(
      "  job:",
      "    outputs:",
      "      run: ${{ steps.x.outputs.run }}",
      "    steps:",
      "      - run: echo eins",
      '      - run: echo "${{ github.head_ref }}"',
      "      - run: echo drei",
    ),
  );
  assert.equal(result.blocks, 3);
  assert.equal(result.findings.length, 1);
});

test("kommt mit Windows-Zeilenenden zurecht", () => {
  const found = inspect(FILE, text("      - run: |", "          echo ${{ github.head_ref }}").replace(/\n/g, "\r\n"));
  assert.equal(found.findings.length, 1);
  assert.equal(found.blocks, 1);
});

test("liest den Schluessel auch in Listenform", () => {
  const found = findings("      - run: |", "          echo ${{ github.head_ref }}", "      - name: danach");
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 2);
});

test("Pruefmuster deckt die Dokumentation ab", () => {
  assert.equal(WORKFLOWS_DIR, ".github/workflows");
  const found = findings('      - run: echo ${{ github.event.comment.body }}');
  assert.equal(found.length, 1);
  assert.match(found[0].expression, /\$\{\{.*\}\}/);
});

test("dieses Repository haelt Ausdruecke aus dem Shell-Text", async () => {
  const { findings: found, files, blocks } = await audit();
  assert.deepEqual(found, []);
  assert.ok(files.length > 0, "keine Workflow-Dateien gefunden");
  assert.ok(blocks > 0, "keine run-Bloecke gefunden");
});
