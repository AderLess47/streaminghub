import assert from "node:assert/strict";
import test from "node:test";
import { audit, inspect } from "./check-continue-on-error.mjs";

const FILE = ".github/workflows/probe.yml";

const workflow = (...jobs) => ["on: push", "jobs:", ...jobs].join("\n");
const job = (...rows) => ["  build:", "    runs-on: ubuntu-latest", "    steps:", ...rows];
const findings = (text) => inspect(FILE, text).findings;
const reasons = (text) => findings(text).map((finding) => finding.reason);

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

test("findet einen Step, der nicht mit name: oder uses: beginnt", () => {
  const text = workflow(...job("      - id: check", "        continue-on-error: true", "        run: node check.mjs"));

  assert.deepEqual(reasons(text), ["step"], "Listenplatz zaehlt, nicht der erste Schluessel");
});

test("liest einen Step-Namen, der nicht in der ersten Zeile steht", () => {
  const text = workflow(...job("      - run: node check.mjs", "        name: Spaet benannt", "        continue-on-error: true"));

  assert.match(findings(text)[0].snippet, /Step "Spaet benannt"/);
});

test("eine gequotete id wird erkannt", () => {
  const text = workflow(
    ...job(
      "      - name: Pruefen",
      '        id: "check"',
      "        continue-on-error: true",
      "        run: node check.mjs",
      "      - run: echo hi",
      "        if: steps.check.outcome == 'failure'",
    ),
  );

  assert.deepEqual(findings(text), []);
});

test("Kommentarzeilen loesen keine Befunde aus", () => {
  const text = workflow(...job("      # continue-on-error: true", "      - run: echo hi"));

  assert.deepEqual(findings(text), []);
});

test("zaehlt Jobs und Steps", () => {
  const text = workflow(
    ...job(
      "      - name: Pruefen",
      "        id: check",
      "        continue-on-error: true",
      "        run: node check.mjs",
      "      - run: echo ${{ steps.check.outcome }}",
      "      - name: Aufraeumen",
      "        id: cleanup",
      "        continue-on-error: true",
      "        run: gh issue close 1",
      "      - run: echo ${{ steps.cleanup.outcome }}",
    ),
  );
  const inspected = inspect(FILE, text);

  assert.equal(inspected.jobs, 1);
  assert.equal(inspected.steps, 2);
});

test("dieses Repository haelt jedes continue-on-error sichtbar", async () => {
  const result = await audit();

  assert.deepEqual(result.findings, []);
  assert.equal(result.files, 17);
  assert.equal(result.jobs, 28);
  assert.equal(result.steps, 3);
});
