import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { audit, buildSnapshot, inspect, parseWorkflow } from "./check-job-names.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

const workflow = (name, jobs) => `name: ${name}\non: push\n\njobs:\n${jobs.join("\n")}\n`;

const job = (id, label) => `  ${id}:\n    name: ${label}\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi`;

const file = (pathname, text) => ({ path: pathname, text });

const CI = file(
  ".github/workflows/ci.yml",
  workflow("CI-Pruefungen", [job("checks", "Typecheck and tests"), job("lint", "Workflow-Lint")]),
);

const snapshotOf = (...workflows) => buildSnapshot(workflows);

test("unveraenderte Workflows stimmen mit ihrem Snapshot ueberein", () => {
  assert.deepEqual(inspect({ workflows: [CI], snapshot: snapshotOf(CI) }).findings, []);
});

test("fehlender Snapshot wird gemeldet", () => {
  const { findings } = inspect({ workflows: [CI], snapshot: null });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].reason, "snapshot-missing");
  assert.equal(findings[0].file, ".github/workflow-jobs.json");
});

test("neuer und entfernter Workflow werden gemeldet", () => {
  const other = file(".github/workflows/other.yml", workflow("Andere", [job("x", "X")]));

  const added = inspect({ workflows: [CI, other], snapshot: snapshotOf(CI) }).findings;
  assert.equal(added.length, 1);
  assert.equal(added[0].reason, "workflow-added");
  assert.equal(added[0].file, ".github/workflows/other.yml");

  const removed = inspect({ workflows: [CI], snapshot: snapshotOf(CI, other) }).findings;
  assert.equal(removed.length, 1);
  assert.equal(removed[0].reason, "workflow-removed");
});

test("umbenannter Workflow wird an der name:-Zeile gemeldet", () => {
  const renamed = file(CI.path, CI.text.replace("name: CI-Pruefungen", "name: CI"));
  const { findings } = inspect({ workflows: [renamed], snapshot: snapshotOf(CI) });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].reason, "workflow-renamed");
  assert.equal(findings[0].line, 1);
  assert.match(findings[0].snippet, /"CI" statt "CI-Pruefungen"/);
});

test("umbenannter Job wird an seiner name:-Zeile gemeldet", () => {
  const renamed = file(CI.path, CI.text.replace("name: Workflow-Lint", "name: Lint"));
  const { findings } = inspect({ workflows: [renamed], snapshot: snapshotOf(CI) });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].reason, "job-renamed");
  assert.equal(findings[0].line, CI.text.split("\n").findIndex((line) => line.includes("Lint")) + 1);
  assert.match(findings[0].snippet, /Job lint heisst "Lint" statt "Workflow-Lint"/);
});

test("entfernter Job wird gemeldet", () => {
  const removed = file(CI.path, workflow("CI-Pruefungen", [job("checks", "Typecheck and tests")]));
  const { findings } = inspect({ workflows: [removed], snapshot: snapshotOf(CI) });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].reason, "job-removed");
  assert.match(findings[0].snippet, /Job lint/);
});

test("zusaetzlicher Job wird gemeldet", () => {
  const extended = file(CI.path, workflow("CI-Pruefungen", [job("checks", "Typecheck and tests"), job("lint", "Workflow-Lint"), job("docs", "Docs")]));
  const { findings } = inspect({ workflows: [extended], snapshot: snapshotOf(CI) });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].reason, "job-added");
  assert.match(findings[0].snippet, /Job docs/);
});

test("Job ohne name: gilt unter seiner ID", () => {
  const plain = file(".github/workflows/plain.yml", "name: Plain\non: push\njobs:\n  smoke:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n");

  assert.deepEqual(parseWorkflow(plain.text).jobs, [{ id: "smoke", name: "smoke", line: 4 }]);
  assert.deepEqual(inspect({ workflows: [plain], snapshot: snapshotOf(plain) }).findings, []);
});

test("name: wird auch nach anderen Job-Angaben gefunden", () => {
  const late = file(
    ".github/workflows/late.yml",
    "name: Late\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    timeout-minutes: 10\n    name: Bauen\n    steps:\n      - run: echo hi\n",
  );
  const parsed = parseWorkflow(late.text);

  assert.deepEqual(parsed.jobs, [{ id: "build", name: "Bauen", line: 7 }]);
  assert.deepEqual(inspect({ workflows: [late], snapshot: snapshotOf(late) }).findings, []);
});

test("dynamische Workflow- und Job-Namen werden gemeldet", () => {
  const dynamic = file(
    ".github/workflows/dyn.yml",
    "name: \"Build ${{ github.ref }}\"\non: push\njobs:\n  build:\n    name: Bauen ${{ matrix.os }}\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n",
  );
  const reasons = inspect({ workflows: [dynamic], snapshot: snapshotOf(dynamic) }).findings.map((finding) => finding.reason);

  assert.deepEqual(reasons.sort(), ["dynamic-job-name", "dynamic-workflow-name"]);
});

test("Kommentarzeilen zaehlen nicht als Name", () => {
  const commented = file(
    ".github/workflows/comment.yml",
    "name: Comment\non: push\njobs:\n  smoke:\n    # name: Anderer Name\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n",
  );

  assert.deepEqual(parseWorkflow(commented.text).jobs, [{ id: "smoke", name: "smoke", line: 4 }]);
});

test("buildSnapshot sortiert Dateien und Jobs", () => {
  const b = file(".github/workflows/b.yml", workflow("B", [job("z", "Z"), job("a", "A")]));
  const a = file(".github/workflows/a.yml", workflow("A", [job("m", "M")]));
  const snapshot = buildSnapshot([b, a]);

  assert.deepEqual(Object.keys(snapshot), [".github/workflows/a.yml", ".github/workflows/b.yml"]);
  assert.deepEqual(Object.keys(snapshot[".github/workflows/b.yml"].jobs), ["a", "z"]);
});

test("--update schreibt den Snapshot und macht den Lauf gruen", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "job-names-"));
  try {
    mkdirSync(path.join(cwd, ".github/workflows"), { recursive: true });
    writeFileSync(path.join(cwd, ".github/workflows/a.yml"), CI.text);
    const script = path.join(ROOT, "scripts/check-job-names.mjs");

    const missing = spawnSync(process.execPath, [script], { cwd, encoding: "utf8" });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /::error file=.github\/workflow-jobs.json,line=1::/);

    const update = spawnSync(process.execPath, [script, "--update"], { cwd, encoding: "utf8" });
    assert.equal(update.status, 0, update.stderr);
    const snapshot = JSON.parse(readFileSync(path.join(cwd, ".github/workflow-jobs.json"), "utf8"));
    assert.equal(snapshot[".github/workflows/a.yml"].jobs.lint, "Workflow-Lint");

    const clean = spawnSync(process.execPath, [script], { cwd, encoding: "utf8" });
    assert.equal(clean.status, 0, clean.stderr);
    assert.match(clean.stdout, /2 Job\(s\) stimmen mit \.github\/workflow-jobs\.json ueberein/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("dieses Repository haelt den Job-Namen-Snapshot aktuell", async () => {
  const result = await audit();

  assert.deepEqual(result.findings, []);
  assert.equal(result.workflows.length, 17);
  assert.equal(Object.values(result.snapshot).reduce((sum, entry) => sum + Object.keys(entry.jobs).length, 0), 28);
});
