import assert from "node:assert/strict";
import test from "node:test";
import { audit, inspect } from "./check-deploy-environment.mjs";

const FILE = ".github/workflows/deploy.yml";

const workflow = (...jobs) => ["on: push", "jobs:", ...jobs].join("\n");
const job = (...rows) => [
  "  deploy:",
  "    runs-on: ubuntu-latest",
  "    timeout-minutes: 25",
  ...rows,
  "    steps:",
  "      - name: Deployen",
  "        run: |",
  "          set -euo pipefail",
  "          flyctl deploy --config fly.toml --app streaminghub-org",
];
const findings = (text) => inspect(FILE, text).findings;
const reasons = (text) => findings(text).map((finding) => finding.reason);

test("akzeptiert einen Deploy mit environment", () => {
  const text = workflow(...job("    environment: production"));
  const inspected = inspect(FILE, text);

  assert.deepEqual(inspected.findings, []);
  assert.equal(inspected.deploys, 1);
});

test("bewertet den Namen der Umgebung nicht", () => {
  const text = workflow(...job("    environment: staging"));

  assert.deepEqual(reasons(text), [], "bewusster Verzicht: kein App-zu-Umgebung-Mapping im Checker");
});

test("meldet einen Deploy ohne environment", () => {
  const text = workflow(...job());
  const found = findings(text);

  assert.equal(found.length, 1);
  assert.equal(found[0].reason, "environment-missing");
  assert.equal(found[0].line, 3, "Zeile des Job-Kopfs");
  assert.match(found[0].snippet, /Job deploy deployt ohne environment:/);
});

test("meldet ein environment ohne Namen", () => {
  const text = workflow(...job("    environment:"));
  const found = findings(text);

  assert.equal(found.length, 1);
  assert.equal(found[0].reason, "environment-empty");
  assert.equal(found[0].line, 6, "Zeile von environment");
  assert.match(found[0].snippet, /environment: ohne Namen/);
});

test("erkennt environment als Block mit name:", () => {
  const text = workflow(...job("    environment:", "      name: production", "      url: https://streaminghub.org"));

  assert.deepEqual(findings(text), []);
});

test("laesst einen Ausdruck als Umgebung stehen", () => {
  const text = workflow(...job("    environment: ${{ inputs.environment }}"));

  assert.deepEqual(reasons(text), [], "nicht statisch pruefbar, zaehlt als gesetzt");
});

test("Meldungstexte und Kommentare sind kein Deploy", () => {
  const text = workflow(
    [
      "  deploy:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      # manuell: flyctl deploy --app streaminghub-org",
      '      - name: Deployen',
      "        run: |",
      '          echo "::error title=Fly-Deploy haengt::flyctl deploy kam nicht voran."',
    ].join("\n"),
  );

  assert.deepEqual(reasons(text), [], "nur ein echter Aufruf zaehlt");
});

test("flyctl secrets set ist kein Deploy", () => {
  const text = workflow(
    [
      "  secrets:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - name: Secrets setzen",
      "        run: |",
      "          flyctl secrets set FOO=bar --app streaminghub-org",
    ].join("\n"),
  );

  assert.deepEqual(reasons(text), [], "nur Deploys brauchen die Umgebung");
});

test("dieses Repository deklariert jede Deploy-Umgebung", async () => {
  const result = await audit();

  assert.deepEqual(result.findings, []);
  assert.equal(result.files, 17);
  assert.equal(result.jobs, 28);
  // Kein fester Sollwert: ein neuer Deploy-Job ist kein Testfehler. Die
  // Untergrenze zeigt nur, dass der Parser im echten Repo ueberhaupt Deploys
  // erkennt; Meldungs- und Kommentartexte zaehlen dabei nicht mit (Faelle
  // oben). Ein Zuviel faellt an result.findings auf, weil ein solcher Job kein
  // environment: haette.
  assert.ok(result.deploys > 0, "mindestens ein Deploy-Job im Repo erkannt");
  assert.ok(result.deploys <= result.jobs, "gezaehlt wird je Job, nicht je Aufruf");
});
