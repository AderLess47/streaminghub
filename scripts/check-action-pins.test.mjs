import assert from "node:assert/strict";
import test from "node:test";
import { audit, inspect, SHA_PIN, VERSION_COMMENT, WORKFLOWS_DIR } from "./check-action-pins.mjs";

const FILE = ".github/workflows/fixture.yml";
const SHA = "fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09";
const OTHER_SHA = "0723195856401067f7a2779048b490ace7a47d7c";

// Fixtures zeilenweise als Strings: so bleibt im Test selbst lesbar, welche
// Zeile geprueft wird. audit() liest nur .github/workflows, die Fixtures hier
// melden sich also nicht gegenseitig.
const text = (...rows) => rows.join("\n");
const findings = (...rows) => inspect(FILE, text(...rows)).findings;
const reasons = (...rows) => findings(...rows).map((finding) => finding.reason);

test("akzeptiert einen Commit-SHA mit Versionskommentar", () => {
  assert.deepEqual(findings(`      - uses: actions/checkout@${SHA} # v5`), []);
});

test("akzeptiert eine Punktversion im Kommentar", () => {
  assert.deepEqual(findings(`        uses: actions/upload-artifact@${SHA} # v7.0.2`), []);
});

test("akzeptiert Actions mit Unterpfad", () => {
  assert.deepEqual(findings(`        uses: gradle/actions/setup-gradle@${OTHER_SHA} # v5`), []);
});

test("akzeptiert eine Vorabversion im Kommentar", () => {
  assert.deepEqual(findings(`        uses: actions/cache@${SHA} # v6.0.0-rc.1`), []);
});

test("akzeptiert lokale Aktionen ohne Pin", () => {
  const result = inspect(FILE, text("      - uses: ./.github/actions/setup"));
  assert.deepEqual(result.findings, []);
  assert.equal(result.local, 1);
  assert.equal(result.remote, 0);
});

test("akzeptiert docker:// nur mit Digest und Kommentar", () => {
  const digest = `sha256:${"a".repeat(64)}`;
  assert.deepEqual(findings(`      - uses: docker://alpine:3.20@${digest} # v3.20`), []);
});

test("meldet einen beweglichen Tag statt Commit-SHA", () => {
  const found = findings(`      - uses: actions/checkout@v5`);
  assert.equal(found.length, 1);
  assert.equal(found[0].reason, "tag");
  assert.equal(found[0].line, 1);
  assert.match(found[0].snippet, /actions\/checkout@v5/);
});

test("meldet einen Zweig als Ref", () => {
  assert.deepEqual(reasons(`        uses: actions/setup-node@main`), ["tag"]);
});

test("meldet einen zu kurzen SHA", () => {
  assert.deepEqual(reasons(`        uses: actions/checkout@${SHA.slice(0, 7)}`), ["short"]);
});

test("meldet einen fehlenden Versionskommentar", () => {
  assert.deepEqual(reasons(`        uses: actions/checkout@${SHA}`), ["comment"]);
});

test("meldet einen Kommentar ohne Release-Tag", () => {
  assert.deepEqual(reasons(`        uses: actions/checkout@${SHA} # main`), ["comment"]);
  assert.deepEqual(reasons(`        uses: actions/checkout@${SHA} # Stand November`), ["comment"]);
});

test("meldet eine Zeile ohne Ref, die wie eine Action aussieht", () => {
  assert.deepEqual(reasons(`        uses: actions/checkout`), ["pin"]);
});

test("meldet docker:// mit Tag statt Digest", () => {
  assert.deepEqual(reasons(`      - uses: docker://alpine:3.20`), ["digest"]);
});

test("ignoriert Kommentarzeilen und Fliesstext", () => {
  assert.deepEqual(
    findings(
      `      # uses: actions/checkout@v5`,
      `      - name: Hinweis`,
      `        run: |`,
      `          uses: nur ein Beispiel im Text`,
    ),
    [],
  );
});

test("zaehlt Referenzen fuer die Zusammenfassung", () => {
  const result = inspect(
    FILE,
    text(
      `      - uses: actions/checkout@${SHA} # v5`,
      `      - uses: actions/setup-node@${OTHER_SHA} # v5`,
      `      - uses: ./.github/actions/setup`,
    ),
  );
  assert.equal(result.references, 3);
  assert.equal(result.remote, 2);
  assert.equal(result.local, 1);
});

test("Pruefmuster passen zur gepinnten Schreibweise", () => {
  assert.equal(WORKFLOWS_DIR, ".github/workflows");
  assert.ok(SHA_PIN.test(SHA));
  assert.ok(VERSION_COMMENT.test("# v5"));
  assert.ok(VERSION_COMMENT.test("# v7.0.2"));
  assert.ok(!VERSION_COMMENT.test("# v5.0.0.0.0."));
});

test("dieses Repository ist vollstaendig gepinnt", async () => {
  const { findings: found, references, files } = await audit();
  assert.deepEqual(found, []);
  assert.ok(references > 0, "keine uses-Referenzen gefunden");
  assert.ok(files.length > 0, "keine Workflow-Dateien gefunden");
});
