import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { audit, DEPENDABOT_FILE, inspect } from "./check-dependabot-coverage.mjs";

const REQUIRED = ["github-actions", "docker"];

// Fixtures als Zeilen: so bleibt im Test lesbar, welche Zeile geprueft wird.
// Die Angabe steht bewusst ohne directory/schedule - der Check liest nur
// package-ecosystem, alles andere prueft das Schema.
const findings = (required, ...rows) => inspect(DEPENDABOT_FILE, rows.join("\n"), { required });
const ecosystems = (required, ...rows) => findings(required, ...rows).map((finding) => finding.ecosystem);
// Verzeichnisse der Dockerfiles, wie audit() sie aus dem Repo ableitet.
const coverage = (directories, ...rows) => inspect(DEPENDABOT_FILE, rows.join("\n"), { required: ["docker"], directories });

const GITHUB_ACTIONS = '  - package-ecosystem: "github-actions"';
const DOCKER = '  - package-ecosystem: "docker"';

async function withRepository(setup, run) {
  const root = await mkdtemp(path.join(tmpdir(), "dependabot-coverage-"));
  try {
    await mkdir(path.join(root, ".github", "workflows"), { recursive: true });
    await setup(root);
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("akzeptiert beide genutzten Oekosysteme", () => {
  assert.deepEqual(findings(REQUIRED, "version: 2", "updates:", GITHUB_ACTIONS, DOCKER), []);
});

test("meldet einen fehlenden Eintrag an der updates-Zeile", () => {
  const found = findings(REQUIRED, "version: 2", "updates:", GITHUB_ACTIONS);
  assert.equal(found.length, 1);
  assert.equal(found[0].ecosystem, "docker");
  assert.equal(found[0].line, 2);
  assert.match(found[0].snippet, /"docker"/);
  assert.match(found[0].hint, /package-ecosystem/);
});

test("meldet fehlende Eintraege in fester Reihenfolge", () => {
  assert.deepEqual(ecosystems(REQUIRED, "version: 2", "updates: []"), REQUIRED);
});

test("ignoriert auskommentierte Eintraege", () => {
  assert.deepEqual(
    ecosystems(["docker"], "updates:", GITHUB_ACTIONS, '  # - package-ecosystem: "docker"'),
    ["docker"],
  );
});

test("akzeptiert einfache und keine Anfuehrungszeichen", () => {
  assert.deepEqual(
    findings(REQUIRED, "updates:", "  - package-ecosystem: 'github-actions'", "  - package-ecosystem: docker"),
    [],
  );
});

test("prueft nur die als genutzt gemeldeten Oekosysteme", () => {
  assert.deepEqual(findings([], "updates: []"), []);
  assert.deepEqual(findings(["docker"], "updates:", DOCKER), []);
});

test("weitere Oekosysteme stoeren nicht", () => {
  assert.deepEqual(
    findings(REQUIRED, "updates:", '  - package-ecosystem: "npm"', GITHUB_ACTIONS, DOCKER),
    [],
  );
});

test("akzeptiert ein Dockerfile, dessen directory der Eintrag nennt", () => {
  assert.deepEqual(coverage(["/"], "updates:", DOCKER, '    directory: "/"'), []);
  assert.deepEqual(coverage(["/app"], "updates:", DOCKER, '    directory: "/app"'), []);
});

test("meldet ein Dockerfile, das kein docker-Eintrag abdeckt", () => {
  const found = coverage(["/app"], "updates:", DOCKER, '    directory: "/"');
  assert.equal(found.length, 1);
  assert.equal(found[0].ecosystem, "docker");
  assert.equal(found[0].line, 2);
  assert.match(found[0].snippet, /\/app/);
  assert.match(found[0].hint, /nicht rekursiv/);
});

test("akzeptiert directory ohne fuehrenden Schraegstrich und mit ./", () => {
  assert.deepEqual(coverage(["/app"], "updates:", DOCKER, "    directory: app"), []);
  assert.deepEqual(coverage(["/app"], "updates:", DOCKER, '    directory: "./app/"'), []);
});

test("akzeptiert directories als Blockliste und als Flow-Liste", () => {
  assert.deepEqual(
    coverage(["/a", "/b"], "updates:", DOCKER, "    directories:", '      - "/a"', "      - /b"),
    [],
  );
  assert.deepEqual(coverage(["/a", "/b"], "updates:", DOCKER, '    directories: ["/a", "/b"]'), []);
});

test("Wildcard in directories deckt Unterverzeichnisse ab", () => {
  assert.deepEqual(coverage(["/apps/web", "/apps/api"], "updates:", DOCKER, '    directories: ["/apps/*"]'), []);
});

test("Wildcard in directory zaehlt nicht - Dependabot globbt dort nicht", () => {
  assert.equal(coverage(["/apps/web"], "updates:", DOCKER, '    directory: "/apps/*"').length, 1);
});

test("meldet nur die ungedeckten Verzeichnisse", () => {
  const found = coverage(["/app", "/db"], "updates:", DOCKER, '    directory: "/app"');
  assert.equal(found.length, 1);
  assert.match(found[0].snippet, /\/db/);
});

test("Dockerfile allein verlangt nur docker", async () => {
  await withRepository(
    async (root) => {
      await writeFile(path.join(root, "Dockerfile"), "FROM scratch\n");
      await writeFile(path.join(root, DEPENDABOT_FILE), "version: 2\nupdates: []\n");
    },
    async (root) => {
      const result = await audit({ root });
      assert.deepEqual(result.required, ["docker"]);
      assert.deepEqual(result.directories, ["/"]);
      assert.deepEqual(result.findings.map((finding) => finding.ecosystem), ["docker"]);
    },
  );
});

test("Workflow allein verlangt nur github-actions", async () => {
  await withRepository(
    async (root) => {
      await writeFile(path.join(root, ".github", "workflows", "ci.yml"), "on: push\n");
      await writeFile(path.join(root, DEPENDABOT_FILE), ["version: 2", "updates:", GITHUB_ACTIONS].join("\n"));
    },
    async (root) => {
      const result = await audit({ root });
      assert.deepEqual(result.required, ["github-actions"]);
      assert.deepEqual(result.findings, []);
    },
  );
});

test("meldet ein Dockerfile im Unterverzeichnis trotz vorhandenem Eintrag", async () => {
  await withRepository(
    async (root) => {
      await mkdir(path.join(root, "app"));
      await writeFile(path.join(root, "app", "Dockerfile"), "FROM scratch\n");
      await writeFile(path.join(root, DEPENDABOT_FILE), ["version: 2", "updates:", DOCKER, '    directory: "/"'].join("\n"));
    },
    async (root) => {
      const result = await audit({ root });
      assert.deepEqual(result.directories, ["/app"]);
      assert.equal(result.findings.length, 1);
      assert.match(result.findings[0].snippet, /\/app/);
    },
  );
});

test("akzeptiert ein Dockerfile im Unterverzeichnis, wenn directory es nennt", async () => {
  await withRepository(
    async (root) => {
      await mkdir(path.join(root, "app"));
      await writeFile(path.join(root, "app", "Dockerfile"), "FROM scratch\n");
      await writeFile(
        path.join(root, DEPENDABOT_FILE),
        ["version: 2", "updates:", DOCKER, '    directory: "/app"'].join("\n"),
      );
    },
    async (root) => {
      const result = await audit({ root });
      assert.deepEqual(result.directories, ["/app"]);
      assert.deepEqual(result.findings, []);
    },
  );
});

test("meldet eine fehlende Datei statt mit einem Absturz zu enden", async () => {
  await withRepository(
    async (root) => writeFile(path.join(root, "Dockerfile"), "FROM scratch\n"),
    async (root) => {
      const result = await audit({ root });
      assert.equal(result.findings.length, 1);
      assert.match(result.findings[0].snippet, /fehlt/);
    },
  );
});

test("dieses Repository deckt alle genutzten Oekosysteme und Verzeichnisse ab", async () => {
  const { findings: found, required, directories } = await audit();
  assert.deepEqual(found, []);
  assert.deepEqual(required, REQUIRED);
  assert.deepEqual(directories, ["/"]);
});
