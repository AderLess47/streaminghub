import assert from "node:assert/strict";
import test from "node:test";
import { audit, inspect } from "./check-trigger-secrets.mjs";

const WORKFLOW_RUN = "on:\n  workflow_run:\n    types: [completed]";

const guardedDeploy = (condition = "github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'push'", head = `    if: ${condition}`) =>
  [
    WORKFLOW_RUN,
    "",
    "permissions:",
    "  contents: read",
    "",
    "jobs:",
    "  deploy:",
    "    name: Auf Fly deployen",
    "    runs-on: ubuntu-latest",
    head,
    "    steps:",
    "      - name: Deployen",
    "        run: flyctl deploy",
    "        env:",
    "          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}",
    "",
  ].join("\n");

const findings = (file, text, options) => inspect(file, text, options).findings;

test("akzeptiert einen abgesicherten Deploy mit conclusion und event=push", () => {
  assert.deepEqual(findings("deploy.yml", guardedDeploy()), []);
});

test("akzeptiert gefaltete if-Bloecke, auch mit Kommentar dahinter", () => {
  const withComment = guardedDeploy(
    null,
    "    if: >-  # nur ein erfolgreicher Push auf main rollt aus\n" +
      "      github.event.workflow_run.conclusion == 'success' &&\n" +
      "      github.event.workflow_run.event == 'push'",
  );
  assert.deepEqual(findings("deploy.yml", withComment), []);

  const plainFold = guardedDeploy(
    null,
    "    if: >\n      github.event.workflow_run.conclusion == 'success' &&\n      github.event.workflow_run.event == 'push'",
  );
  assert.deepEqual(findings("deploy.yml", plainFold), []);
});

test("meldet den if-Befund in der Zeile der Bedingung", () => {
  const text = guardedDeploy("github.event.workflow_run.conclusion == 'success'");
  const ifLine = text.split("\n").findIndex((line) => line.includes("if:")) + 1;

  assert.equal(findings("deploy.yml", text)[0].line, ifLine);
});

test("verbietet pull_request_target auch in der Kurzform", () => {
  const inline = "on: [push, pull_request_target]\n\njobs: {}\n";
  const found = findings("ci.yml", inline);
  assert.equal(found.length, 1);
  assert.equal(found[0].reason, "pull-request-target");
  assert.equal(found[0].line, 1);

  const block = "on:\n  pull_request_target:\n    types: [opened]\njobs: {}\n";
  assert.equal(findings("ci.yml", block)[0].line, 2);
});

test("pull_request allein ist erlaubt", () => {
  assert.deepEqual(findings("ci.yml", "on:\n  pull_request:\n    branches: [main]\njobs: {}\n"), []);
});

test("meldet einen workflow_run-Job mit Secrets ohne if", () => {
  const text = [
    WORKFLOW_RUN,
    "jobs:",
    "  smoke:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - run: ./smoke.sh",
    "        env:",
    "          TOKEN: ${{ secrets.SMOKE_TOKEN }}",
    "",
  ].join("\n");
  const found = findings("smoke.yml", text);

  assert.equal(found.length, 1);
  assert.equal(found[0].reason, "conclusion");
  assert.equal(found[0].line, 5, "Zeile des Jobs, weil kein if vorhanden ist");
  assert.match(found[0].snippet, /smoke nutzt secrets\.\*/);
});

test("meldet ein if ohne conclusion-Filter", () => {
  const found = findings("smoke.yml", guardedDeploy("github.event_name == 'workflow_run'"));
  assert.equal(found.length, 1);
  assert.equal(found[0].reason, "conclusion");
});

test("Deploy ohne event=push wird getrennt gemeldet", () => {
  const found = findings("deploy.yml", guardedDeploy("github.event.workflow_run.conclusion == 'success'"));

  assert.equal(found.length, 1);
  assert.equal(found[0].reason, "push");
  assert.match(found[0].snippet, /event == 'push'/);
});

test("Nicht-Deploy-Jobs brauchen kein event=push", () => {
  const text = guardedDeploy("github.event.workflow_run.conclusion == 'success'").replace("  deploy:", "  smoke:").replace("Auf Fly deployen", "Staging pruefen");
  assert.deepEqual(findings("smoke.yml", text), []);
});

test("Deploy-Erkennung greift auch ueber den Dateinamen", () => {
  const text = guardedDeploy("github.event.workflow_run.conclusion == 'success'").replace("  deploy:", "  ship:").replace("Auf Fly deployen", "Ausrollen");
  const found = findings("deploy-production.yml", text);

  assert.equal(found.length, 1);
  assert.equal(found[0].reason, "push");
});

test("nur bei schedule laufende Jobs brauchen keinen Filter", () => {
  const text = guardedDeploy("github.event_name == 'schedule'").replace("  deploy:", "  canary-guard:").replace("Auf Fly deployen", "Guard");
  const inspected = inspect("staging-canary.yml", text);

  assert.deepEqual(inspected.findings, []);
  assert.equal(inspected.gated, 1);
  assert.equal(inspected.exempted, 0);
});

test("ein Job, der workflow_run nennt, braucht den Filter weiterhin", () => {
  const text = guardedDeploy("github.event_name == 'schedule' || github.event_name == 'workflow_run'");
  assert.equal(findings("smoke.yml", text).length, 1);
});

test("Ausnahmen greifen nur mit Eintrag und werden gezaehlt", () => {
  const text = guardedDeploy("github.event.workflow_run.conclusion == 'failure'");
  const exempt = { "deploy.yml::deploy": "meldet nur Fehler" };

  assert.equal(findings("deploy.yml", text).length, 1);
  const inspected = inspect("deploy.yml", text, { exempt });
  assert.deepEqual(inspected.findings, []);
  assert.equal(inspected.exempted, 1);
});

test("workflow-weites env mit Secrets wird abgelehnt, Job-env nicht", () => {
  const workflow = [
    WORKFLOW_RUN,
    "env:",
    "  SAFE: plain",
    "  LEAK: ${{ secrets.WEBHOOK }}",
    "jobs:",
    "  smoke:",
    "    runs-on: ubuntu-latest",
    "    env:",
    "      OK: ${{ secrets.JOB_TOKEN }}",
    "    steps:",
    "      - run: ./smoke.sh",
    "",
  ].join("\n");
  const found = findings("smoke.yml", workflow);

  assert.equal(found.length, 2, "Leak im workflow-env plus fehlender conclusion-Filter");
  const leak = found.find((finding) => finding.reason === "workflow-env");
  assert.equal(leak.line, 6);
  assert.match(leak.snippet, /workflow-weiten env/);
});

test("Kommentarzeilen loesen keine Befunde aus", () => {
  const text = [
    "on:",
    "  # pull_request_target: bewusst nicht",
    "  workflow_run:",
    "    types: [completed]",
    "jobs:",
    "  smoke:",
    "    runs-on: ubuntu-latest",
    "    if: github.event.workflow_run.conclusion == 'success'",
    "    steps:",
    "      # env: LEAK: ${{ secrets.WEBHOOK }}",
    "      - run: ./smoke.sh",
    "        env:",
    "          TOKEN: ${{ secrets.SMOKE_TOKEN }}",
    "",
  ].join("\n");
  assert.deepEqual(findings("smoke.yml", text), []);
});

test("workflow_run-Job ohne Secrets braucht keinen Filter", () => {
  const text = [
    WORKFLOW_RUN,
    "jobs:",
    "  drift:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - run: node scripts/release-sync.mjs --check",
    "",
  ].join("\n");
  assert.deepEqual(findings("release-drift.yml", text), []);
});

test("dieses Repository haelt die Trigger- und Secret-Regeln ein", async () => {
  const result = await audit();
  assert.deepEqual(result.findings, []);
  assert.equal(result.files, 17);
  assert.equal(result.gated, 1, "guard laeuft nur bei schedule - Bedingung statt Ausnahme");
  assert.equal(result.exempted, 2, "zwei begruendete Ausnahmen fuer Fehler-Meldungen");
});
