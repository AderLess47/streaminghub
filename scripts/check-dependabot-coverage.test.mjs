import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  audit,
  DEPENDABOT_FILE,
  detectEcosystems,
  inspect,
  REQUIRED_ORDER,
} from "./check-dependabot-coverage.mjs";

const FILE = DEPENDABOT_FILE;

// Fixtures zeilenweise als Strings: so bleibt im Test lesbar, welche Zeile
// geprueft wird.
const text = (...rows) => rows.join("\n");
// Nimmt sowohl eine Zeilenliste als auch einzelne Zeilen an (flat).
const findings = (required) => (...rows) => inspect(FILE, text(...rows.flat()), { required }).findings;

const BOTH = [
  "version: 2",
  "updates:",
  '  - package-ecosystem: "github-actions"',
  '    directory: "/"',
  "    schedule:",
  '      interval: "weekly"',
  '  - package-ecosystem: "docker"',
  '    directory: "/"',
  "    schedule:",
  '      interval: "weekly"',
];

async function withRepository(setup, run) {
  const root = await mkdtemp(path.join(tmpdir(), "dependabot-coverage-"));
  try {
    await setup(root);
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("akzeptiert beide genutzten Oekosysteme", () => {
  assert.deepEqual(findings(["github-actions", "docker"])(BOTH), []);
});

test("meldet einen fehlenden docker-Eintrag", () => {
  const found = findings(["github-actions", "docker"])(BOTH.slice(0, 6));
  assert.equal(found.length, 1);
  assert.equal(found[0].reason, "missing");
  assert.equal(found[0].ecosystem, "docker");
  assert.match(found[0].snippet, /"docker"/);
});

test("meldet einen fehlenden github-actions-Eintrag", () => {
  const found = findings(["github-actions", "docker"])(BOTH.slice(0, 2).concat(BOTH.slice(6)));
  assert.deepEqual(
    found.map((finding) => finding.ecosystem),
    ["github-actions"],
  );
});

test("meldet beide fehlenden Eintraege in fester Reihenfolge", () => {
  const found = findings(["github-actions", "docker"])("version: 2", "updates: []");
  assert.deepEqual(
    found.map((finding) => finding.ecosystem),
    ["github-actions", "docker"],
  );
});

test("annotiert die updates-Zeile, nicht die Dateizeile 1", () => {
  const found = findings(["docker"])("version: 2", "updates:", '  - package-ecosystem: "github-actions"');
  assert.equal(found[0].line, 2);
});

test("ignoriert auskommentierte Eintraege", () => {
  const found = findings(["docker"])(
    "updates:",
    '  - package-ecosystem: "github-actions"',
    '  # - package-ecosystem: "docker"',
    '  #   directory: "/"',
  );
  assert.deepEqual(
    found.map((finding) => finding.ecosystem),
    ["docker"],
  );
});

test("akzeptiert einfache Anfuehrungszeichen und Eintraege ohne Anfuehrungszeichen", () => {
  assert.deepEqual(
    findings(["github-actions", "docker"])(
      "updates:",
      "  - package-ecosystem: 'github-actions'",
      "  - package-ecosystem: docker",
    ),
    [],
  );
});

test("stoert sich nicht an weiteren Oekosystemen", () => {
  assert.deepEqual(
    findings(["github-actions", "docker"])(
      "updates:",
      '  - package-ecosystem: "npm"',
      '  - package-ecosystem: "github-actions"',
      '  - package-ecosystem: "docker"',
    ),
    [],
  );
});

test("prueft nur die Oekosysteme, die als genutzt gemeldet wurden", () => {
  assert.deepEqual(findings(["docker"])('updates:', '  - package-ecosystem: "docker"'), []);
  assert.deepEqual(findings([])("updates: []"), []);
});

test("erkennt ein Repo mit Dockerfile und Workflow als beide Oekosysteme", async () => {
  await withRepository(
    async (root) => {
      await writeFile(path.join(root, "Dockerfile"), "FROM scratch\n");
      await mkdir(path.join(root, ".github", "workflows"), { recursive: true });
      await writeFile(path.join(root, ".github", "workflows", "ci.yml"), "on: push\n");
    },
    async (root) => {
      const sources = await detectEcosystems({ root });
      assert.deepEqual([...sources.keys()], ["github-actions", "docker"]);
      assert.match(sources.get("github-actions"), /1 Workflow-Datei/);
      assert.match(sources.get("docker"), /1 Dockerfile/);
    },
  );
});

test("erkennt Dockerfile ohne Workflows", async () => {
  await withRepository(
    async (root) => writeFile(path.join(root, "Dockerfile"), "FROM scratch\n"),
    async (root) => {
      assert.deepEqual([...((await detectEcosystems({ root })).keys())], ["docker"]);
    },
  );
});

test("erkennt Workflows ohne Dockerfile", async () => {
  await withRepository(
    async (root) => {
      await mkdir(path.join(root, ".github", "workflows"), { recursive: true });
      await writeFile(path.join(root, ".github", "workflows", "ci.yaml"), "on: push\n");
    },
    async (root) => {
      assert.deepEqual([...((await detectEcosystems({ root })).keys())], ["github-actions"]);
    },
  );
});

test("meldet ein Oekosystem, das im Repo genutzt, aber nicht eingetragen ist", async () => {
  await withRepository(
    async (root) => {
      await writeFile(path.join(root, "Dockerfile"), "FROM scratch\n");
      await mkdir(path.join(root, ".github", "workflows"), { recursive: true });
      await writeFile(path.join(root, ".github", "workflows", "ci.yml"), "on: push\n");
      await writeFile(
        path.join(root, DEPENDABOT_FILE),
        text("version: 2", "updates:", '  - package-ecosystem: "github-actions"'),
      );
    },
    async (root) => {
      const result = await audit({ root });
      assert.deepEqual(
        result.findings.map((finding) => finding.ecosystem),
        ["docker"],
      );
      assert.deepEqual(result.required, ["github-actions", "docker"]);
    },
  );
});

test("meldet eine fehlende Datei statt mit einem Absturz zu enden", async () => {
  await withRepository(
    async (root) => writeFile(path.join(root, "Dockerfile"), "FROM scratch\n"),
    async (root) => {
      const result = await audit({ root });
      assert.equal(result.findings.length, 1);
      assert.equal(result.findings[0].reason, "file");
    },
  );
});

test("Reihenfolge der Regeln ist fest", () => {
  assert.deepEqual(REQUIRED_ORDER, ["github-actions", "docker"]);
  assert.equal(DEPENDABOT_FILE, path.join(".github", "dependabot.yml"));
});

test("dieses Repository deckt alle genutzten Oekosysteme ab", async () => {
  const { findings: found, required, declared } = await audit();
  assert.deepEqual(found, []);
  assert.deepEqual(required, ["github-actions", "docker"]);
  assert.ok(declared.includes("github-actions"), "github-actions fehlt in der Datei");
  assert.ok(declared.includes("docker"), "docker fehlt in der Datei");
});
