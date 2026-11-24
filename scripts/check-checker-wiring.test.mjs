import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { audit, inspect, PACKAGE_FILE } from "./check-checker-wiring.mjs";

// 4 Leerzeichen Einrueckung wie package.json - davon haengen die Zeilennummern ab.
const packageText = (scripts) => `${JSON.stringify({ scripts }, null, 4)}\n`;
const lineOf = (text, name) => text.split("\n").findIndex((row) => row.includes(`"${name}":`)) + 1;

const WIRED = {
  "check:foo": "node scripts/check-foo.mjs",
  "test:foo": "node --test scripts/check-foo.test.mjs",
};
const WORKFLOW = ["jobs:", "  lint:", "    steps:", "      - name: Foo pruefen", "        run: npm run check:foo"].join("\n");
const WORKFLOW_BOTH = `${WORKFLOW}\n      - name: Foo testen\n        run: npm run test:foo`;
const CHECKER = "scripts/check-foo.mjs";
const TESTFILE = "scripts/check-foo.test.mjs";

const run = (overrides = {}) =>
  inspect({
    packageText: packageText(WIRED),
    workflows: [WORKFLOW_BOTH],
    checkers: [CHECKER],
    tests: [TESTFILE],
    ...overrides,
  });

test("akzeptiert ein vollstaendig verdrahtetes Repo", () => {
  assert.deepEqual(run(), []);
});

test("meldet ein check:-Skript ohne Workflow-Aufruf an seiner package.json-Zeile", () => {
  const text = packageText({ ...WIRED, "check:unused": "node scripts/check-unused.mjs" });
  const found = inspect({ packageText: text, workflows: [WORKFLOW_BOTH], checkers: [CHECKER], tests: [TESTFILE] });

  assert.equal(found.length, 1);
  assert.equal(found[0].file, PACKAGE_FILE);
  assert.equal(found[0].line, lineOf(text, "check:unused"));
  assert.match(found[0].snippet, /check:unused/);
  assert.match(found[0].hint, /npm run check:unused/);
});

test("meldet ein test:-Skript ohne Workflow-Aufruf", () => {
  const found = run({ workflows: [WORKFLOW] });

  assert.equal(found.length, 1);
  assert.match(found[0].snippet, /test:foo/);
});

test("laesst App- und Ops-Skripte in Ruhe", () => {
  const text = packageText({
    ...WIRED,
    dev: "next dev",
    smoke: "node scripts/smoke-test.mjs",
    "db:init": "node scripts/init-db.mjs",
    "stripe:live-test": "node scripts/stripe-live-test.mjs",
    prebuild: "node scripts/release-sync.mjs --best-effort",
  });

  assert.deepEqual(inspect({ packageText: text, workflows: [WORKFLOW_BOTH], checkers: [CHECKER], tests: [TESTFILE] }), []);
});

test("meldet eine Checker-Datei ohne Testdatei", () => {
  const found = run({ tests: [] });

  assert.equal(found.length, 1);
  assert.equal(found[0].file, CHECKER);
  assert.match(found[0].snippet, /check-foo\.test\.mjs fehlt/);
});

test("meldet eine Testdatei ohne test:-Skript", () => {
  const text = packageText({ "check:foo": "node scripts/check-foo.mjs", "test:foo": "node --test scripts/other.test.mjs" });
  const found = inspect({ packageText: text, workflows: [WORKFLOW_BOTH], checkers: [CHECKER], tests: [TESTFILE] });

  assert.equal(found.length, 1);
  assert.equal(found[0].file, TESTFILE);
  assert.match(found[0].snippet, /kein test:.*Skript erreichbar/);
});

test("erreichbar heisst nur ueber test:-Skripte, nicht ueber check:", () => {
  const text = packageText({ "check:foo": "node --test scripts/check-foo.test.mjs", "test:foo": "node --test scripts/other.test.mjs" });
  const found = inspect({ packageText: text, workflows: [WORKFLOW_BOTH], checkers: [CHECKER], tests: [TESTFILE] });

  assert.equal(found.length, 1);
  assert.equal(found[0].file, TESTFILE);
});

test("ein npm run im Kommentar erfuellt die Regel nicht", () => {
  const commented = ["jobs:", "  lint:", "    steps:", "      # npm run check:foo (auskommentiert)"].join("\n");
  const found = run({ workflows: [commented] });

  assert.equal(found.length, 2, "check:foo und test:foo sind dann unaufgerufen");
  assert.deepEqual(found.map((finding) => finding.file), [PACKAGE_FILE, PACKAGE_FILE]);
});

test("Ausnahmen greifen nur mit Eintrag", () => {
  const text = packageText({ ...WIRED, "check:unused": "node scripts/check-unused.mjs" });
  const exempt = { scripts: { "check:unused": "manuell auf einem Runner mit Lastprofil" }, checkers: {}, tests: {} };
  const found = inspect({ packageText: text, workflows: [WORKFLOW_BOTH], checkers: [CHECKER], tests: [TESTFILE], exempt });

  assert.deepEqual(found, []);
});

test("Ausnahmen fuer Dateien decken fehlende Testdatei und Waisen ab", () => {
  const orphan = "scripts/legacy.test.mjs";
  const exempt = { scripts: {}, checkers: { [CHECKER]: "Wrapper" }, tests: { [orphan]: "eigener Nightly-Lauf" } };
  assert.deepEqual(run({ tests: [orphan], exempt }), []);
});

test("zählt .test.mjs nicht als Checker-Datei", () => {
  const found = run({ checkers: [CHECKER], tests: [TESTFILE] });
  assert.equal(found.length, 0);
});

test("findet eine Testdatei in einem Unterverzeichnis ueber den Pfad", () => {
  const nested = "scripts/lib/foo.test.mjs";
  const text = packageText({ ...WIRED, "test:lib": "node --test scripts/lib/foo.test.mjs" });
  const workflow = `${WORKFLOW_BOTH}\n      - name: Lib testen\n        run: npm run test:lib`;
  const found = inspect({ packageText: text, workflows: [workflow], checkers: [CHECKER], tests: [TESTFILE, nested] });

  assert.deepEqual(found, []);
});

test("dieses Repository verdrahtet alle Checker", async () => {
  const { findings } = await audit();
  assert.deepEqual(findings, []);
});

test("findet unverdrahtete Skripte und Waisen im Temp-Repo", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "checker-wiring-"));
  try {
    await mkdir(path.join(root, ".github", "workflows"), { recursive: true });
    await mkdir(path.join(root, "scripts"));
    await writeFile(path.join(root, PACKAGE_FILE), packageText({ "check:orphan": "node scripts/check-orphan.mjs" }));
    await writeFile(path.join(root, ".github", "workflows", "ci.yml"), "jobs: {}\n");
    await writeFile(path.join(root, "scripts", "check-orphan.mjs"), "export {};\n");
    await writeFile(path.join(root, "scripts", "loser.test.mjs"), "export {};\n");

    const { findings } = await audit({ root });
    const snippets = findings.map((finding) => finding.snippet);
    assert.ok(snippets.some((snippet) => /check:orphan/.test(snippet)), "unaufgerufenes Skript fehlt");
    assert.ok(snippets.some((snippet) => /check-orphan\.mjs fehlt|check-orphan\.test\.mjs fehlt/.test(snippet)), "fehlende Testdatei fehlt");
    assert.ok(snippets.some((snippet) => /loser\.test\.mjs/.test(snippet)), "Waise fehlt");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
