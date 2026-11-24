import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Die Checker pruefen ihren Befund ueber process.exitCode - genau das sieht CI.
// Die Unit-Tests decken inspect()/audit() ab; hier laeuft der Prozess wirklich,
// einmal mit einem Befund (Exit 1) und einmal im Repo (Exit 0).
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

const WORKFLOW_HEAD = [
  "on: push",
  "permissions:",
  "  contents: read",
  "concurrency:",
  "  group: probe",
  "",
  "jobs:",
  "  probe:",
  "    runs-on: ubuntu-latest",
  "    steps:",
].join("\n");

const CASES = [
  {
    script: "check-action-pins.mjs",
    files: {
      ".github/workflows/probe.yml": `${WORKFLOW_HEAD}\n      - uses: actions/checkout@v4\n`,
    },
    expect: "::error file=.github/workflows/probe.yml",
  },
  {
    script: "check-workflow-hygiene.mjs",
    files: {
      ".github/workflows/probe.yml": "on: push\njobs:\n  probe:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n",
    },
    expect: "::error file=.github/workflows/probe.yml,line=1::permissions: fehlt",
  },
  {
    script: "check-expression-injection.mjs",
    files: {
      ".github/workflows/probe.yml": `${WORKFLOW_HEAD}\n      - run: echo "\${{ github.event.issue.title }}"\n`,
    },
    expect: "::error file=.github/workflows/probe.yml",
  },
  {
    script: "check-curl-timeouts.mjs",
    files: {
      "scripts/deploy.sh": "#!/bin/sh\ncurl https://example.com/health\n",
    },
    expect: "::error file=scripts/deploy.sh",
  },
  {
    script: "check-docker-base-images.mjs",
    files: {
      Dockerfile: "FROM node:22-alpine\nRUN echo hi\n",
    },
    expect: "::error file=Dockerfile",
  },
  {
    script: "check-dependabot-coverage.mjs",
    files: {
      ".github/workflows/probe.yml": `${WORKFLOW_HEAD}\n      - run: echo hi\n`,
    },
    expect: "::error file=.github/dependabot.yml,line=1::.github/dependabot.yml fehlt",
  },
  {
    script: "check-checker-wiring.mjs",
    files: {
      "package.json": JSON.stringify({
        scripts: {
          "check:verwaist": "node scripts/check-verwaist.mjs",
          "test:verwaist": "node --test scripts/check-verwaist.test.mjs",
        },
      }),
      ".github/workflows/probe.yml": `${WORKFLOW_HEAD}\n      - run: echo hi\n`,
      "scripts/check-verwaist.mjs": "console.log('nie aufgerufen');\n",
      "scripts/check-verwaist.test.mjs": "// erreichbar ueber test:verwaist\n",
    },
    expect: "::error file=package.json",
  },
  {
    script: "check-trigger-secrets.mjs",
    files: {
      ".github/workflows/probe.yml": "on:\n  pull_request_target:\n    types: [opened]\njobs: {}\n",
    },
    expect: "::error file=.github/workflows/probe.yml,line=2::pull_request_target",
  },
  {
    // Der Versionsabgleich liest feste Pfade; kopiert werden die echten Dateien,
    // damit die Fixture nicht die Parser-Regeln nachbaut. Eine Version kippt.
    script: "check-app-versions.mjs",
    copies: [
      "android/app/build.gradle.kts",
      "apple/project.yml",
      "vega/manifest.toml",
      "vega/package.json",
      "vega/src/app.tsx",
    ],
    mutate: (cwd) => {
      const file = path.join(cwd, "vega/package.json");
      const pkg = JSON.parse(readFileSync(file, "utf8"));
      writeFileSync(file, JSON.stringify({ ...pkg, version: "0.0.1" }));
    },
    expect: "::error file=android/app/build.gradle.kts,line=1::Marketing-Versionen laufen auseinander",
  },
];

function fixture(entry) {
  const cwd = mkdtempSync(path.join(tmpdir(), "checker-cli-"));
  for (const [relative, text] of Object.entries(entry.files ?? {})) {
    const file = path.join(cwd, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  for (const relative of entry.copies ?? []) {
    const file = path.join(cwd, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    copyFileSync(path.join(ROOT, relative), file);
  }
  entry.mutate?.(cwd);
  return cwd;
}

function run(script, cwd) {
  return spawnSync(process.execPath, [path.join(ROOT, "scripts", script)], { cwd, encoding: "utf8" });
}

// Ein Checker, der erst mit einem offenen PR entsteht, ist hier sichtbar SKIP
// statt still gruen; sobald er auf main liegt, laeuft der Fall automatisch mit.
const skipReason = (entry) =>
  existsSync(path.join(ROOT, "scripts", entry.script)) ? false : `${entry.script} liegt noch nicht auf main`;

for (const entry of CASES) {
  test(`${entry.script}: Befund endet mit Exit 1 und einer ::error-Zeile`, { skip: skipReason(entry) }, () => {
    const cwd = fixture(entry);
    try {
      const result = run(entry.script, cwd);

      assert.equal(result.status, 1, `Exit-Code bei Befund (stderr: ${result.stderr})`);
      assert.ok(
        result.stderr.includes(entry.expect),
        `erwartete "${entry.expect}" in:\\n${result.stderr}`,
      );
      assert.equal(result.stdout.trim(), "", "bei Befund gehoert nur die ::error-Zeile nach stderr");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
}

test("im Repo enden alle Checker mit Exit 0", () => {
  for (const entry of CASES) {
    if (skipReason(entry)) continue;
    const result = run(entry.script, ROOT);
    assert.equal(result.status, 0, `${entry.script} im Repo (stderr: ${result.stderr})`);
    assert.equal(result.stderr.trim(), "", `${entry.script} soll ohne Befund nichts nach stderr schreiben`);
    assert.ok(result.stdout.trim() !== "", `${entry.script} soll eine Zusammenfassung ausgeben`);
  }
});
