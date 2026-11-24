#!/usr/bin/env node
/**
 * Haelt fest, wie die Workflows und ihre Jobs heissen:
 *
 *   Workflow-Name  steckt in workflow_run-Listen (z. B. workflows:
 *                  ["CI-Pruefungen"]) - ein neuer Name laesst den Folgelauf
 *                  still nie mehr starten.
 *   Job-Name       ist der Status, den die Branch-Protection als "required
 *                  check" kennt - ein neuer Name macht die Pflicht still
 *                  unerfuellt, weil der alte Status nie mehr gemeldet wird.
 *
 * Deshalb steht beides in .github/workflow-jobs.json. Weicht der Workflow davon
 * ab, ist das ein Befund: entweder die Umbenennung war unbeabsichtigt, oder sie
 * ist gewollt und der Snapshot wird mit --update nachgezogen (und Required
 * Checks bzw. workflow_run-Listen werden mitgeprueft).
 *
 * Dynamische Namen (name: mit ${{ ... }}) sind ebenfalls ein Befund: sie
 * erzeugen je Lauf einen anderen Status und taugen nicht als Required Check.
 * Der Snapshot speichert sie literal, damit die Abweichung sichtbar bleibt.
 *
 * Faelle: scripts/check-job-names.test.mjs.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WORKFLOWS_DIR = path.join(".github", "workflows");
export const SNAPSHOT_FILE = path.join(".github", "workflow-jobs.json");
const EXTENSIONS = new Set([".yml", ".yaml"]);
const TOP_LEVEL = /^([A-Za-z0-9_.-]+):/;
const JOB_HEADER = /^ {2}([A-Za-z0-9_-]+):\s*(?:#.*)?$/;
const DYNAMIC = /\$\{\{/;

const isIgnorable = (line) => line.trim() === "" || line.trimStart().startsWith("#");

function scalar(value) {
  const trimmed = value.trim();
  const unquoted = /^(['"])(.*)\1$/.exec(trimmed)?.[2] ?? trimmed;
  return unquoted.replace(/\s+#.*$/, "");
}

// Workflow-Name und Jobs mit Anzeigename; ohne name: gilt die Job-ID.
export function parseWorkflow(text) {
  const lines = text.split(/\r?\n/);
  const nameIndex = lines.findIndex((line) => /^name:/.test(line));
  const name = nameIndex === -1 ? null : scalar(lines[nameIndex].slice("name:".length));

  const jobs = [];
  const start = lines.findIndex((line) => /^jobs:\s*(?:#.*)?$/.test(line));
  if (start !== -1) {
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i += 1) {
      if (TOP_LEVEL.test(lines[i])) {
        end = i;
        break;
      }
    }
    for (let i = start + 1; i < end; i += 1) {
      const header = lines[i].match(JOB_HEADER);
      if (!header) continue;

      // name: darf an beliebiger Stelle im Job stehen - den ganzen Block lesen.
      let label = header[1];
      let line = i + 1;
      for (let j = i + 1; j < end; j += 1) {
        if (JOB_HEADER.test(lines[j]) || TOP_LEVEL.test(lines[j])) break;
        const named = lines[j].match(/^ {4}name:\s*(.*)$/);
        if (named) {
          label = scalar(named[1]);
          line = j + 1;
          break;
        }
      }
      jobs.push({ id: header[1], name: label, line });
    }
  }

  return { name, nameLine: nameIndex + 1, jobs };
}

// Snapshot-Form: Datei -> { name, jobs: { id: Anzeigename } }, sortiert.
export function buildSnapshot(workflows) {
  const snapshot = {};
  for (const { path: file, text } of [...workflows].sort((a, b) => a.path.localeCompare(b.path))) {
    const parsed = parseWorkflow(text);
    const jobs = {};
    for (const job of [...parsed.jobs].sort((a, b) => a.id.localeCompare(b.id))) jobs[job.id] = job.name;
    snapshot[file] = { name: parsed.name, jobs };
  }
  return snapshot;
}

export function inspect({ workflows, snapshot }) {
  const findings = [];
  const actual = new Map(workflows.map((entry) => [entry.path, parseWorkflow(entry.text)]));

  for (const [file, parsed] of actual) {
    if (parsed.name && DYNAMIC.test(parsed.name)) {
      findings.push({
        file,
        line: parsed.nameLine,
        reason: "dynamic-workflow-name",
        snippet: `Workflow-Name ist dynamisch: ${parsed.name}`,
      });
    }
    for (const job of parsed.jobs) {
      if (DYNAMIC.test(job.name)) {
        findings.push({
          file,
          line: job.line,
          reason: "dynamic-job-name",
          snippet: `Job ${job.id} hat einen dynamischen Namen: ${job.name}`,
        });
      }
    }
  }

  if (!snapshot) {
    findings.push({
      file: SNAPSHOT_FILE,
      line: 1,
      reason: "snapshot-missing",
      snippet: `${SNAPSHOT_FILE} fehlt`,
    });
    return { findings, entries: actual.size };
  }

  for (const [file, parsed] of actual) {
    const expected = snapshot[file];
    if (!expected) {
      findings.push({
        file,
        line: 1,
        reason: "workflow-added",
        snippet: `${file} steht nicht im Snapshot`,
      });
      continue;
    }

    if ((expected.name ?? null) !== (parsed.name ?? null)) {
      findings.push({
        file,
        line: parsed.nameLine,
        reason: "workflow-renamed",
        snippet: `Workflow-Name "${parsed.name}" statt "${expected.name ?? "-"}"`,
      });
    }

    for (const job of parsed.jobs) {
      if (!(job.id in expected.jobs)) {
        findings.push({
          file,
          line: job.line,
          reason: "job-added",
          snippet: `Job ${job.id} ("${job.name}") steht nicht im Snapshot`,
        });
      } else if (expected.jobs[job.id] !== job.name) {
        findings.push({
          file,
          line: job.line,
          reason: "job-renamed",
          snippet: `Job ${job.id} heisst "${job.name}" statt "${expected.jobs[job.id]}"`,
        });
      }
    }

    for (const id of Object.keys(expected.jobs)) {
      if (!parsed.jobs.some((job) => job.id === id)) {
        findings.push({
          file,
          line: 1,
          reason: "job-removed",
          snippet: `Job ${id} ("${expected.jobs[id]}") fehlt im Workflow`,
        });
      }
    }
  }

  for (const file of Object.keys(snapshot)) {
    if (!actual.has(file)) {
      findings.push({
        file,
        line: 1,
        reason: "workflow-removed",
        snippet: `${file} steht im Snapshot, existiert aber nicht mehr`,
      });
    }
  }

  return { findings, entries: actual.size };
}

const HINTS = {
  "snapshot-missing":
    "npm run check:job-names -- --update ausfuehren und .github/workflow-jobs.json einchecken",
  "workflow-added": "gehoert der Workflow ins Repo: npm run check:job-names -- --update",
  "workflow-removed":
    "gewollt entfernt: npm run check:job-names -- --update; sonst Workflow wiederherstellen",
  "workflow-renamed":
    "workflow_run-Listen mit dem alten Namen zeigen ins Leere: Namen zuruecknehmen oder Listen anpassen, dann Snapshot per --update nachziehen",
  "job-added": "gehoert der Job ins Repo: npm run check:job-names -- --update",
  "job-removed":
    "Required Checks der Branch-Protection kennen den Job noch: gewollt entfernt heisst Snapshot per --update nachziehen und den Check dort abwaehlen",
  "job-renamed":
    "ein Required Check mit dem alten Namen wartet ewig: Umbenennung zuruecknehmen oder Branch-Protection anpassen, dann Snapshot per --update nachziehen",
  "dynamic-workflow-name": "Workflow-Namen fest hinschreiben - workflow_run und Required Checks brauchen einen stabilen Namen",
  "dynamic-job-name":
    'Job-Namen fest hinschreiben (Matrix-Werte in den Schritt, nicht in name:) - sonst ist der Status kein stabiler Check',
};

async function collect(directory) {
  const found = [];
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await collect(full)));
    else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) found.push(full);
  }
  return found;
}

export async function audit({ root = ".", directory = WORKFLOWS_DIR, snapshotFile = SNAPSHOT_FILE } = {}) {
  const files = await collect(path.join(root, directory));
  const workflows = [];
  for (const file of files) {
    workflows.push({ path: path.relative(root, file).split(path.sep).join("/"), text: await readFile(file, "utf8") });
  }

  let snapshot = null;
  try {
    snapshot = JSON.parse(await readFile(path.join(root, snapshotFile), "utf8"));
  } catch {
    snapshot = null;
  }

  return { workflows, snapshot, ...inspect({ workflows, snapshot }) };
}

function countJobs(snapshot) {
  return Object.values(snapshot).reduce((sum, entry) => sum + Object.keys(entry.jobs).length, 0);
}

async function main() {
  const update = process.argv.includes("--update");
  const result = await audit();

  if (update) {
    const snapshot = buildSnapshot(result.workflows);
    await writeFile(SNAPSHOT_FILE, `${JSON.stringify(snapshot, null, 2)}\n`);
    console.log(
      `Job-Namen-Snapshot: ${result.workflows.length} Workflow(s), ${countJobs(snapshot)} Job(s) in ${SNAPSHOT_FILE} geschrieben.`,
    );
    return;
  }

  const { findings, workflows } = result;
  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`::error file=${finding.file},line=${finding.line}::${finding.snippet} -- ${HINTS[finding.reason]}`);
    }
    console.error(
      `${findings.length} Befund(e): Workflow- und Job-Namen weichen von ${SNAPSHOT_FILE} ab. ` +
        "Ein umbenannter oder entfernter Job laesst den Required Check der Branch-Protection ins Leere laufen, " +
        "ein umbenannter Workflow stoppt workflow_run-Folgelaeufe - beabsichtigte Aenderungen per --update nachziehen.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Job-Namen: ${workflows.length} Workflow(s) mit ${countJobs(result.snapshot)} Job(s) stimmen mit ` +
      `${SNAPSHOT_FILE} ueberein (keine dynamischen Namen).`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
