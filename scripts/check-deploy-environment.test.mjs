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
];
const deploy = (env, app = "streaminghub-org") =>
  job(...(env === null ? [] : [env]), `          flyctl deploy --config fly.toml --app ${app}`);
const findings = (text, file = FILE) => inspect(file, text).findings;
const reasons = (text) => findings(text).map((finding) => finding.reason);

test("akzeptiert einen Produktions-Deploy mit environment: production", () => {
  const text = workflow(...deploy("    environment: production"));
  const inspected = inspect(FILE, text);

  assert.deepEqual(inspected.findings, []);
  assert.equal(inspected.deploys, 1);
  assert.deepEqual(inspected.environments, ["production"]);
});

test("meldet einen Produktions-Deploy ohne environment", () => {
  const text = workflow(...deploy(null));
  const found = findings(text);

  assert.equal(found.length, 1);
  assert.equal(found[0].reason, "environment-missing");
  assert.equal(found[0].line, 3, "Zeile des Job-Kopfs");
  assert.match(found[0].snippet, /Job deploy deployt "streaminghub-org" \(production\) ohne environment: production/);
});

test("meldet eine falsche Umgebung fuer den Produktions-Deploy", () => {
  const text = workflow(...deploy("    environment: staging"));
  const found = findings(text);

  assert.equal(found.length, 1);
  assert.equal(found[0].reason, "environment-mismatch");
  assert.equal(found[0].line, 6, "Zeile von environment");
  assert.match(found[0].snippet, /\(production\), hat aber environment: staging/);
});

test("akzeptiert einen Staging-Deploy mit environment: staging", () => {
  const text = workflow(...deploy("    environment: staging", "streaminghub-staging"));

  assert.deepEqual(findings(text), []);
});

test("erkennt environment als Block mit name:", () => {
  const text = workflow(
    ...job(
      "    environment:",
      "      name: production",
      "      url: https://streaminghub.org",
      "          flyctl deploy --config fly.toml --app streaminghub-org",
    ),
  );

  assert.deepEqual(reasons(text), [], "verschachtelte Form ist gueltig");
});

test("erkennt eine gequotete Umgebung", () => {
  const text = workflow(...deploy('    environment: "production"'));

  assert.deepEqual(findings(text), []);
});

test("laesst einen Ausdruck als Umgebung stehen", () => {
  const text = workflow(...deploy("    environment: ${{ inputs.environment }}"));

  assert.deepEqual(reasons(text), [], "nicht statisch pruefbar, zaehlt als gesetzt");
});

test("findet --app erst in der Fortsetzungszeile", () => {
  const text = workflow(
    ...job(
      "    environment: staging",
      "      - name: Deployen",
      "        run: |",
      "          timeout --kill-after=30 480 flyctl deploy \\",
      "            --remote-only \\",
      "            --config fly.staging.toml \\",
      "            --app streaminghub-staging \\",
      '            --build-arg "GIT_COMMIT=x"',
    ),
  );

  assert.deepEqual(findings(text), []);
});

test("meldet eine App, die keiner Umgebung zugeordnet ist", () => {
  const text = workflow(...deploy("    environment: production", "streaminghub-preview"));
  const found = findings(text);

  assert.equal(found[0].reason, "app-unknown");
  assert.match(found[0].snippet, /App "streaminghub-preview"/);
});

test("meldet eine dynamische App", () => {
  const text = workflow(...deploy("    environment: production", '"$FLY_APP"'));
  const found = findings(text);

  assert.equal(found[0].reason, "app-dynamic");
  assert.match(found[0].snippet, /nicht statisch bestimmbar/);
});

test("ein Deploy ohne --app ist nicht pruefbar", () => {
  const text = workflow(
    ...job("    environment: production", "      - run: |", "          flyctl deploy --remote-only"),
  );

  assert.deepEqual(reasons(text), ["app-dynamic"]);
});

test("das Wort flyctl deploy in einer Fehlermeldung ist kein Deploy", () => {
  const text = workflow(
    ...job(
      "    environment: staging",
      "      - name: Deployen",
      "        run: |",
      "          flyctl deploy --app streaminghub-staging",
      '          echo "::error title=Fly-Deploy haengt::flyctl deploy kam nicht voran."',
    ),
  );

  assert.deepEqual(findings(text), []);
});

test("ein Kommentar mit flyctl deploy zaehlt nicht", () => {
  const text = workflow(
    ...job("    environment: production", "      # manuell: flyctl deploy --app streaminghub-org"),
  );

  assert.deepEqual(findings(text), []);
});

test("flyctl secrets set ist kein Deploy", () => {
  const text = workflow(
    ...job("      - name: Secrets setzen", "        run: |", "          flyctl secrets set FOO=bar --app streaminghub-org"),
  );

  assert.deepEqual(findings(text), [], "nur Deploys brauchen die Umgebung");
});

test("dieses Repository deployt nur in deklarierte Umgebungen", async () => {
  const result = await audit();

  assert.deepEqual(result.findings, []);
  assert.equal(result.files, 17);
  assert.equal(result.jobs, 28);
  assert.equal(result.deploys, 2);
  assert.deepEqual(result.environments, ["production", "staging"]);
});
