#!/usr/bin/env node
/**
 * Prueft, dass die CI ihre eigenen Pruefungen wirklich ausfuehrt. Drei Regeln:
 *
 *   1. Jedes check:*- und test:*-Skript in package.json wird von mindestens
 *      einem Workflow aufgerufen - sonst existiert die Pruefung nur auf dem
 *      Papier (Beispiel: test:release-sync lief monatelang in keiner CI).
 *   2. Jede scripts/check-*.mjs hat eine gleichnamige .test.mjs - sonst kann sie
 *      still kaputtgehen und winkt Befunde durch.
 *   3. Jede scripts/**\/*.test.mjs ist ueber ein test:*-Skript erreichbar -
 *      sonst laeuft sie nur lokal, wenn jemand daran denkt.
 *
 * App- und Ops-Skripte (dev, smoke, db:init, stripe:live-test ...) sind
 * ausgenommen, weil sie Handarbeit sind: die Regeln greifen nur auf check:*\/test:*
 * und auf Testdateien. Ausnahmen fuer Faelle, die trotzdem bewusst nicht in der
 * CI laufen, stehen in EXEMPTIONS - jede mit Grund, denn der Eintrag ist der
 * einzige Weg, den Check gruen zu halten.
 *
 * Faelle: scripts/check-checker-wiring.test.mjs.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE_FILE = "package.json";
const WORKFLOWS_DIR = path.join(".github", "workflows");
const SCRIPTS_DIR = "scripts";
const SKIP_DIRS = new Set(["node_modules", ".git"]);

// Heute leer: jedes check:*/test:*-Skript laeuft in einem Workflow, jede
// Testdatei ist erreichbar. Neue Ausnahmen hier eintragen - mit Begruendung.
export const EXEMPTIONS = {
  scripts: {}, // "check:lasttest": "manuell auf einem Runner mit Lastprofil"
  checkers: {}, // "scripts/check-x.mjs": "nur ein Wrapper um check-y"
  tests: {}, // "scripts/foo.test.mjs": "laeuft im separaten Nightly-Workflow"
};

const CHECKED_SCRIPT = /^(?:check|test):/;
const SCRIPT_LINE = /^\s{2,}"([^"]+)":/;

function scriptEntries(packageText) {
  const scripts = JSON.parse(packageText).scripts ?? {};
  const lines = new Map();
  for (const [index, row] of packageText.split("\n").entries()) {
    const match = row.match(SCRIPT_LINE);
    if (match && !lines.has(match[1])) lines.set(match[1], index + 1);
  }
  return { scripts, lines };
}

// "npm run x" irgendwo im Workflow - auch in Kommentaren? Nein: die Zeile muss
// mit "run:" oder einem Shell-Kommando beginnen, damit ein Kommentar die Regel
// nicht still erfuellt.
function calledScripts(workflows) {
  const called = new Set();
  for (const text of workflows) {
    for (const row of text.split("\n")) {
      const code = row.trimStart();
      if (code.startsWith("#")) continue;
      for (const match of row.matchAll(/npm run ([A-Za-z0-9:_-]+)/g)) called.add(match[1]);
    }
  }
  return called;
}

export function inspect({ packageText, workflows, checkers = [], tests = [], exempt = EXEMPTIONS }) {
  const { scripts, lines } = scriptEntries(packageText);
  const called = calledScripts(workflows);
  const testCommands = Object.entries(scripts)
    .filter(([name]) => name.startsWith("test:"))
    .map(([, command]) => command);
  const findings = [];

  for (const name of Object.keys(scripts)) {
    if (!CHECKED_SCRIPT.test(name) || called.has(name) || exempt.scripts[name]) continue;
    findings.push({
      file: PACKAGE_FILE,
      line: lines.get(name) ?? 1,
      snippet: `${name} wird von keinem Workflow aufgerufen`,
      hint: `"npm run ${name}" in einen Workflow aufnehmen oder mit Grund in EXEMPTIONS.scripts eintragen`,
    });
  }

  for (const file of checkers) {
    const testFile = file.replace(/\.mjs$/, ".test.mjs");
    if (tests.includes(testFile) || exempt.checkers[file]) continue;
    findings.push({
      file,
      line: 1,
      snippet: `${path.posix.basename(testFile)} fehlt`,
      hint: `Faelle fuer ${path.posix.basename(file)} anlegen und ueber ein test:*-Skript verdrahten`,
    });
  }

  for (const file of tests) {
    const base = path.posix.basename(file);
    const reachable = testCommands.some((command) => command.includes(file) || command.includes(base));
    if (reachable || exempt.tests[file]) continue;
    findings.push({
      file,
      line: 1,
      snippet: `${base} ist ueber kein test:*-Skript erreichbar`,
      hint: `"node --test ${file}" als test:*-Skript aufnehmen und in einem Workflow aufrufen`,
    });
  }

  return findings;
}

async function listFiles(directory, match) {
  const found = [];
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      found.push(...(await listFiles(full, match)));
    } else if (entry.isFile() && match(entry.name)) {
      found.push(full.split(path.sep).join("/"));
    }
  }
  return found;
}

export async function audit({ root = "." } = {}) {
  const packageText = await readFile(path.join(root, PACKAGE_FILE), "utf8");
  const workflowFiles = await readdir(path.join(root, WORKFLOWS_DIR), { withFileTypes: true }).catch(() => []);
  const workflows = [];
  for (const entry of workflowFiles.filter((file) => /\.ya?ml$/.test(file.name))) {
    workflows.push(await readFile(path.join(root, WORKFLOWS_DIR, entry.name), "utf8"));
  }

  const checkers = (await listFiles(path.join(root, SCRIPTS_DIR), (name) => /^check-.*\.mjs$/.test(name) && !name.endsWith(".test.mjs"))).sort();
  const tests = (await listFiles(path.join(root, SCRIPTS_DIR), (name) => name.endsWith(".test.mjs"))).sort();

  return { findings: inspect({ packageText, workflows, checkers, tests }) };
}

async function main() {
  const { findings } = await audit();

  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`::error file=${finding.file},line=${finding.line}::${finding.snippet} -- ${finding.hint}`);
    }
    console.error(
      `${findings.length} Befund(e): Eine Pruefung, die kein Workflow aufruft oder die keine Faelle hat, ` +
        "wird gruen, ohne etwas zu pruefen.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    "Checker-Verdrahtung: alle check:*/test:*-Skripte laufen in einem Workflow, jede Checker-Datei hat " +
      "eine erreichbare Testdatei.",
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
