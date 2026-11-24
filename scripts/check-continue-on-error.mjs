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
 *      (Issue oeffnen, Lauf explizit rot machen).
 *   3. Alles andere - Step ohne id, ohne outcome-Bezug, oder mit Ausdruck als
 *      Wert - steht mit Begruendung in EXEMPTIONS. Ein Eintrag ohne passenden
 *      Step ist selbst ein Befund, damit die Liste nicht verrottet.
 *
 * Faelle: scripts/check-continue-on-error.test.mjs.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WORKFLOWS_DIR = path.join(".github", "workflows");
const EXTENSIONS = new Set([".yml", ".yaml"]);

// Datei::Step -> Grund. Nur Schritte, die bewusst keinen outcome-Bezug haben.
export const EXEMPTIONS = {
  "staging-canary.yml::Fehler-Issue nach Erholung schließen":
    "raeumt ein offenes Fehler-Issue auf; ein API-Fehler beim Schliessen darf den Canary nicht rot machen, das Issue bleibt sichtbar offen",
  "staging-canary.yml::Abweichungs-Issue nach Erholung schließen":
    "raeumt ein offenes Abweichungs-Issue auf; ein API-Fehler beim Schliessen darf den Canary nicht rot machen",
};

const TOP_LEVEL = /^([A-Za-z0-9_.-]+):/;
const JOB_HEADER = /^ {2}([A-Za-z0-9_-]+):\s*(?:#.*)?$/;
const JOB_COE = /^ {4}continue-on-error:\s*(.*)$/;
const STEP_START = /^ {6}- (?:name|uses):\s*(.*)$/;
const STEP_COE = /^ {8}continue-on-error:\s*(.*)$/;
const STEP_ID = /^ {8}id:\s*(.+?)\s*$/;
const STEP_NAME = /^ {6}- name:\s*(.+?)\s*$/;

const isIgnorable = (line) => line.trim() === "" || line.trimStart().startsWith("#");

function value(raw) {
  return raw.replace(/\s+#.*$/, "").trim();
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

    const jobCoe = rows.find((row) => JOB_COE.test(row.text));
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
      const id = row.text.match(STEP_ID);
      if (id) current.id = value(id[1]);
      const coe = row.text.match(STEP_COE);
      if (coe) current.coe = { line: row.line, value: value(coe[1]), index: row.line };
    }

    return {
      id: header.id,
      line: header.index + 1,
      start: header.index + 1,
      end: stop,
      coe: jobCoe ? { line: jobCoe.line, value: value(jobCoe.text.match(JOB_COE)[1]) } : null,
      steps,
      lines,
    };
  });
}

// Liest ein spaeterer Step im selben Job steps.<id>.outcome?
function outcomeReadAfter(job, step) {
  if (!step.id) return false;
  const pattern = new RegExp(`steps\\.${step.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.outcome`);
  return job.lines
    .slice(step.coe.line, job.end)
    .some((text) => !text.trimStart().startsWith("#") && pattern.test(text));
}

export function inspect(file, text, { exempt = EXEMPTIONS } = {}) {
  const lines = text.split(/\r?\n/);
  const findings = [];
  const used = new Set();
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
      if (!step.coe) continue;
      if (step.coe.value === "false") continue;

      const key = `${path.basename(file)}::${step.name}`;
      if (exempt[key]) {
        used.add(key);
        continue;
      }
      if (outcomeReadAfter(job, step)) continue;

      findings.push({
        file,
        line: step.coe.line,
        reason: "step",
        snippet: `Step "${step.name || job.id}" nutzt continue-on-error: ${step.coe.value} ohne steps.<id>.outcome`,
      });
    }
  }

  for (const key of Object.keys(exempt)) {
    if (key.startsWith(`${path.basename(file)}::`) && !used.has(key)) {
      findings.push({ file, line: 1, reason: "stale-exemption", snippet: `Ausnahme ohne passenden Step: ${key}` });
    }
  }

  const steps = jobs.reduce(
    (sum, job) => sum + job.steps.filter((step) => step.coe && step.coe.value !== "false").length,
    0,
  );
  return { findings, jobs: jobs.length, steps, exempted: used.size };
}

const HINTS = {
  job: "continue-on-error auf Job-Ebene entfernen - ein Job, der nie rot wird, kann keinen Required Check erfuellen",
  step: "dem Step eine id: geben und spaeter steps.<id>.outcome auswerten (Issue/::error/exit 1) oder den Grund in EXEMPTIONS eintragen",
  "stale-exemption": "Eintrag in EXEMPTIONS entfernen oder den Step-Namen dort korrigieren",
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
  const result = { files: files.length, findings: [], jobs: 0, steps: 0, exempted: 0 };
  for (const file of files) {
    const inspected = inspect(file, await readFile(file, "utf8"));
    result.findings.push(...inspected.findings);
    result.jobs += inspected.jobs;
    result.steps += inspected.steps;
    result.exempted += inspected.exempted;
  }
  return result;
}

async function main() {
  const { files, findings, jobs, steps, exempted } = await audit();

  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`::error file=${finding.file},line=${finding.line}::${finding.snippet} -- ${HINTS[finding.reason]}`);
    }
    console.error(
      `${findings.length} Befund(e): continue-on-error verbirgt Befunde. Auf Job-Ebene ist es verboten; ` +
        "auf Step-Ebene braucht es eine id: mit steps.<id>.outcome im selben Job oder einen Grund in EXEMPTIONS.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `continue-on-error: ${files} Workflow-Dateien mit ${jobs} Job(s) geprueft, kein Job mit continue-on-error, ` +
      `${steps} Step(s) mit continue-on-error (${exempted} davon per Ausnahme), ` +
      `alle mit steps.<id>.outcome oder Begruendung (${WORKFLOWS_DIR}).`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
