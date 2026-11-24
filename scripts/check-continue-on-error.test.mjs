import assert from "node:assert/strict";
import test from "node:test";
import { audit, inspect } from "./check-continue-on-error.mjs";

const FILE = ".github/workflows/probe.yml";

const workflow = (...jobs) => ["on: push", "jobs:", ...jobs].join("\n");
const job = (...rows) => ["  build:", "    runs-on: ubuntu-latest", "    steps:", ...rows];
const findings = (text, options) => inspect(FILE, text, options).findings;
const reasons = (text, options) => findings(text, options).map((finding) => finding.reason);

test("akzeptiert einen Step mit id und spaeterem steps.<id>.outcome", () => {
  const text = workflow(
    ...job(
      "      - name: Pruefen",
      "        id: check",
      "        continue-on-error: true",
      "        run: node scripts/check.mjs",
      "      - name: Fehlschlagen, damit es sichtbar wird",
      "        if: steps.check.outcome == 'failure'",
      "        run: exit 1",
    ),
  );

  assert.deepEqual(findings(text), []);
});

test("verbietet continue-on-error auf Job-Ebene, auch mit false", () => {
  const text = ["on: push", "jobs:", "  build:", "    continue-on-error: true", "    steps:", "      - run: echo hi"].join("\n");
  const found = findings(text);

  assert.equal(found.length, 1);
  assert.equal(found[0].reason, "job");
  assert.equal(found[0].line, 4);
  assert.match(found[0].snippet, /Job build: continue-on-error: true/);

  const disabled = text.replace("continue-on-error: true", "continue-on-error: false");
  assert.deepEqual(reasons(disabled), ["job"], "auch false gehoert nicht in den Job");
});

test("meldet einen Step ohne id", () => {
  const text = workflow(...job("      - name: Raetseln", "        continue-on-error: true", "        run: echo hi"));
  const found = findings(text);

  assert.equal(found.length, 1);
  assert.equal(found[0].reason, "step");
  assert.equal(found[0].line, 7, "Zeile von continue-on-error");
  assert.match(found[0].snippet, /Step "Raetseln" nutzt continue-on-error: true/);
});

test("meldet eine id ohne outcome-Bezug", () => {
  const text = workflow(
    ...job("      - name: Pruefen", "        id: check", "        continue-on-error: true", "        run: node check.mjs"),
  );

  assert.deepEqual(reasons(text), ["step"]);
});

test("ein outcome-Bezug in einem Kommentar zaehlt nicht", () => {
  const text = workflow(
    ...job(
      "      - name: Pruefen",
      "        id: check",
      "        continue-on-error: true",
      "        run: node check.mjs",
      "      # spaeter: if: steps.check.outcome == 'failure'",
      "      - run: echo hi",
    ),
  );

  assert.deepEqual(reasons(text), ["step"]);
});

test("ein outcome-Bezug in einem anderen Job zaehlt nicht", () => {
  const text = workflow(
    ...job("      - name: Pruefen", "        id: check", "        continue-on-error: true", "        run: node check.mjs"),
    "  other:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - run: echo ${{ steps.check.outcome }}",
  );

  assert.deepEqual(reasons(text), ["step"]);
});

test("continue-on-error: false am Step ist harmlos", () => {
  const text = workflow(...job("      - name: Pruefen", "        continue-on-error: false", "        run: node check.mjs"));

  assert.deepEqual(findings(text), []);
});

test("ein Ausdruck als Wert wird gemeldet", () => {
  const text = workflow(
    ...job("      - name: Pruefen", "        id: check", "        continue-on-error: ${{ inputs.flaky }}", "        run: node check.mjs"),
  );

  assert.deepEqual(reasons(text), ["step"]);
});

test("Ausnahmen greifen nur mit passendem Dateinamen und Step-Namen", () => {
  const text = workflow(...job("      - name: Aufraeumen", "        continue-on-error: true", "        run: gh issue close 1"));
  const exempt = { "probe.yml::Aufraeumen": "Aufraeumen darf nicht rot machen" };

  assert.deepEqual(reasons(text), ["step"]);
  const inspected = inspect(FILE, text, { exempt });
  assert.deepEqual(inspected.findings, []);
  assert.equal(inspected.exempted, 1);

  const foreign = inspect(".github/workflows/other.yml", text, { exempt });
  assert.deepEqual(foreign.findings.map((finding) => finding.reason), ["step"]);
});

test("eine Ausnahme ohne passenden Step ist selbst ein Befund", () => {
  const text = workflow(...job("      - name: Pruefen", "        id: check", "        continue-on-error: true", "        run: node check.mjs", "      - run: echo ${{ steps.check.outcome }}"));
  const exempt = { "probe.yml::Gibt es nicht": "veraltet" };

  assert.deepEqual(reasons(text, { exempt }), ["stale-exemption"]);
});

test("Kommentarzeilen loesen keine Befunde aus", () => {
  const text = workflow(...job("      # continue-on-error: true", "      - run: echo hi"));

  assert.deepEqual(findings(text), []);
});

test("zaehlt Jobs, Steps und Ausnahmen", () => {
  const text = workflow(
    ...job(
      "      - name: Pruefen",
      "        id: check",
      "        continue-on-error: true",
      "        run: node check.mjs",
      "      - run: echo ${{ steps.check.outcome }}",
      "      - name: Aufraeumen",
      "        continue-on-error: true",
      "        run: gh issue close 1",
    ),
  );
  const inspected = inspect(FILE, text, { exempt: { "probe.yml::Aufraeumen": "Aufraeumen" } });

  assert.equal(inspected.jobs, 1);
  assert.equal(inspected.steps, 2);
  assert.equal(inspected.exempted, 1);
});

test("dieses Repository begruendet jedes continue-on-error", async () => {
  const result = await audit();

  assert.deepEqual(result.findings, []);
  assert.equal(result.files, 17);
  assert.equal(result.jobs, 28);
  assert.equal(result.steps, 3);
  assert.equal(result.exempted, 2, "zwei Aufraeum-Steps im Canary");
});
