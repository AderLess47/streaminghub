#!/usr/bin/env node
/**
 * Prueft continue-on-error in .github/workflows:
 *
 *   1. Auf Job-Ebene ist continue-on-error verboten. Es macht den ganzen Job
 *      gruen, egal welcher Schritt scheitert - ein Befund kaeme nie als roter
 *      Lauf an, und ein Required Check der Branch-Protection waere wertlos.
 *   2. Auf Step-Ebene ist continue-on-error: true nur erlaubt, wenn der Step
 *      eine id: hat und ein spaeterer Step im selben Job steps.<id>.outcome
 *      liest: dann entscheidet sichtbar jemand, was mit dem Fehlschlag passiert
 *      (Issue oeffnen, ::warning::, Lauf explizit rot machen).
 *   3. Eine Ausnahmeliste gibt es nicht: auch ein Aufraeum-Step, dessen Fehler
 *      den Lauf nicht rot machen darf, haengt eine sichtbare ::warning:: an
 *      (so in staging-canary.yml). Die Regel ist damit eine einzige, direkt im
 *      Workflow pruefbare Bedingung, die nicht veralten kann.
 *
 * Faelle: scripts/check-continue-on-error.test.mjs.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WORKFLOWS_DIR = path.join(".github", "workflows");
const EXTENSIONS = new Set([".yml", ".yaml"]);

const TOP_LEVEL = /^([A-Za-z0-9_.-]+):/;
const JOB_HEADER = /^ {2}([A-Za-z0-9_-]+):\s*(?:#.*)?$/;
const JOB_COE = /^ {4}continue-on-error:\s*(.*)$/;
// Jeder Eintrag der steps:-Liste, unabhaengig davon, ob er mit name:, uses:,
// run:, id: oder if: beginnt - die Schluessel eines Steps sind nicht geordnet.
const STEP_START = /^ {6}- \S/;
const STEP_COE = /^ {8}continue-on-error:\s*(.*)$/;
const STEP_ID = /^ {8}id:\s*(.+?)\s*$/;
const STEP_NAME = /^ {6}- name:\s*(.+?)\s*$/;
const STEP_KEY_NAME = /^ {8}name:\s*(.+?)\s*$/;

function value(raw) {
  return raw.replace(/\s+#.*$/, "").trim();
}

function unquote(raw) {
  const quoted = raw.match(/^(["'])(.*)\1$/);
  return quoted ? quoted[2] : raw;
}

function jobBlocks(lines) {
  const start = lines.findIndex((line) => /^jobs:\s*(?:#.*)?$/.test(line));
  if (start === -1) return [];
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (TOP_LEVEL.test(lines[i])) {
      end = i;
      break;
    }
  }

  const headers = [];
  for (let i = start + 1; i < end; i += 1) {
    const header = lines[i].match(JOB_HEADER);
    if (header) headers.push({ id: header[1], index: i });
  }

  return headers.map((header, at) => {
    const stop = headers[at + 1]?.index ?? end;
    const rows = [];
    for (let i = header.index + 1; i < stop; i += 1) rows.push({ line: i + 1, text: lines[i] });

    const jobCoeRow = rows.find((row) => JOB_COE.test(row.text));
    const coe = jobCoeRow ? { line: jobCoeRow.line, value: value(jobCoeRow.text.match(JOB_COE)[1]) } : null;

    const steps = [];
    let current = null;
    for (const row of rows) {
      if (STEP_START.test(row.text)) {
        current = { line: row.line, name: "", id: null, coe: null };
        steps.push(current);
        const named = row.text.match(STEP_NAME);
        if (named) current.name = value(named[1]);
        continue;
      }
      if (!current) continue;
      const name = row.text.match(STEP_KEY_NAME);
      if (name) current.name = value(name[1]);
      const id = row.text.match(STEP_ID);
      if (id) current.id = unquote(value(id[1]));
      const stepCoe = row.text.match(STEP_COE);
      if (stepCoe) current.coe = { line: row.line, value: value(stepCoe[1]) };
    }

    return { id: header.id, line: header.index + 1, end: stop, coe, steps, lines };
  });
}

// Liest ein spaeterer Step im selben Job steps.<id>.outcome?
function outcomeReadAfter(job, step) {
  if (!step.id) return false;
  const pattern = new RegExp(`steps\\.${step.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.outcome`);
  return job.lines.slice(step.coe.line, job.end).some((text) => !text.trimStart().startsWith("#") && pattern.test(text));
}

export function inspect(file, text) {
  const lines = text.split(/\r?\n/);
  const findings = [];
  const jobs = jobBlocks(lines);

  for (const job of jobs) {
    if (job.coe) {
      findings.push({
        file,
        line: job.coe.line,
        reason: "job",
        snippet: `Job ${job.id}: continue-on-error: ${job.coe.value} verbirgt jeden Befund des Jobs`,
      });
    }

    for (const step of job.steps) {
      if (!step.coe || step.coe.value === "false") continue;
      if (outcomeReadAfter(job, step)) continue;

      findings.push({
        file,
        line: step.coe.line,
        reason: "step",
        snippet: `Step "${step.name || job.id}" nutzt continue-on-error: ${step.coe.value} ohne steps.<id>.outcome`,
      });
    }
  }

  const steps = jobs.reduce(
    (sum, job) => sum + job.steps.filter((step) => step.coe && step.coe.value !== "false").length,
    0,
  );
  return { findings, jobs: jobs.length, steps };
}

const HINTS = {
  job: "continue-on-error auf Job-Ebene entfernen - ein Job, der nie rot wird, kann keinen Required Check erfuellen",
  step: "dem Step eine id: geben und spaeter steps.<id>.outcome auswerten (Issue/::warning::/exit 1)",
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

export async function audit({ directory = WORKFLOWS_DIR } = {}) {
  const files = await collect(directory);
  const result = { files: files.length, findings: [], jobs: 0, steps: 0 };
  for (const file of files) {
    const inspected = inspect(file, await readFile(file, "utf8"));
    result.findings.push(...inspected.findings);
    result.jobs += inspected.jobs;
    result.steps += inspected.steps;
  }
  return result;
}

async function main() {
  const { files, findings, jobs, steps } = await audit();

  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`::error file=${finding.file},line=${finding.line}::${finding.snippet} -- ${HINTS[finding.reason]}`);
    }
    console.error(
      `${findings.length} Befund(e): continue-on-error verbirgt Befunde. Auf Job-Ebene ist es verboten; ` +
        "auf Step-Ebene braucht es eine id: mit steps.<id>.outcome im selben Job.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `continue-on-error: ${files} Workflow-Dateien mit ${jobs} Job(s) geprueft, kein Job mit continue-on-error, ` +
      `${steps} Step(s) mit continue-on-error, alle mit steps.<id>.outcome im selben Job (${WORKFLOWS_DIR}).`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
