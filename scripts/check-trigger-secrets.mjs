#!/usr/bin/env node
/**
 * Prueft drei Trigger-/Secret-Regeln in .github/workflows:
 *
 *   1. pull_request_target ist verboten. Der Trigger gibt dem Lauf Rechte und
 *      Secrets des Basis-Repos, waehrend der Code aus dem Pull Request kommt -
 *      die klassische "pwn request"-Luecke.
 *   2. Ein workflow_run-Job, der secrets.* nutzt, muss auf einen erfolgreichen
 *      Lauf filtern (github.event.workflow_run.conclusion == 'success').
 *      Deploy-Jobs zusaetzlich auf github.event.workflow_run.event == 'push',
 *      damit nur ein Push auf main ausgerollt wird und kein PR-Lauf.
 *   3. secrets.* darf nicht im workflow-weiten env: stehen: dort sieht es jeder
 *      Step und jede Third-Party-Action, auch solche, die es nicht braucht.
 *
 * Zwei Faelle brauchen keinen Filter, ohne Ausnahme in EXEMPTIONS zu stehen:
 *
 *   - Jobs, deren if: github.event_name fest auf ein anderes Ereignis legt und
 *     workflow_run gar nicht nennt (z. B. "nur bei schedule"), koennen auf einem
 *     workflow_run nicht laufen - die Bedingung ist der Beweis.
 *   - Fehler-Meldungen, die absichtlich bei failure/timed_out laufen sollen;
 *     die stehen mit Begruendung in EXEMPTIONS, weil ihre Bedingung gerade
 *     nicht auf Erfolg prueft.
 *
 * Faelle: scripts/check-trigger-secrets.test.mjs.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WORKFLOWS_DIR = path.join(".github", "workflows");
const EXTENSIONS = new Set([".yml", ".yaml"]);

// Datei::Job -> Grund. Nur Jobs, die bewusst nicht auf Erfolg filtern.
export const EXEMPTIONS = {
  "red-run-issue.yml::failure":
    "meldet fehlgeschlagene oder abgebrochene Laeufe - darf genau dann laufen, wenn conclusion != 'success' ist",
  "staging-canary.yml::notify":
    "verschickt die Meldung auch nach einem fehlgeschlagenen Canary - needs.canary.result ist der Filter",
};

const SECRET = /secrets\./;
const CONCLUSION = /workflow_run\.conclusion\s*==\s*['"]success['"]/;
const PUSH_EVENT = /workflow_run\.event\s*==\s*['"]push['"]/;
const JOB_HEADER = /^ {2}([A-Za-z0-9_-]+):\s*(?:#.*)?$/;
const TOP_LEVEL = /^([A-Za-z0-9_.-]+):/;
const indentOf = (line) => line.length - line.trimStart().length;
const isIgnorable = (line) => line.trim() === "" || line.trimStart().startsWith("#");

// Ereignisse unter on: -> Zeile. Blockform, Listeneintrag und on: [push, x].
function events(lines) {
  const start = lines.findIndex((line) => /^on:/.test(line));
  const found = new Map();
  if (start === -1) return found;

  const inline = lines[start].match(/^on:\s*\[(.*)\]/);
  if (inline) {
    for (const entry of inline[1].split(",")) {
      const name = entry.trim().replace(/^["']|["']$/g, "");
      if (name && !found.has(name)) found.set(name, start + 1);
    }
    return found;
  }

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (TOP_LEVEL.test(lines[i])) {
      end = i;
      break;
    }
  }
  for (let i = start + 1; i < end; i += 1) {
    const keyed = lines[i].match(/^ {2}-?\s*["']?([A-Za-z0-9_-]+)["']?:\s*(?:#.*)?$/);
    const listed = lines[i].match(/^ {2}- ["']?([A-Za-z0-9_-]+)["']?\s*$/);
    const name = keyed?.[1] ?? listed?.[1];
    if (name && !found.has(name)) found.set(name, i + 1);
  }
  return found;
}

// Block eines Top-Level-Schluessels (z. B. workflow-weites env:).
function topLevelBlock(lines, prefix) {
  const start = lines.findIndex((line) => line.startsWith(prefix));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (TOP_LEVEL.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { start, end };
}

function jobBlocks(lines) {
  const jobsStart = lines.findIndex((line) => /^jobs:\s*(?:#.*)?$/.test(line));
  if (jobsStart === -1) return [];
  let jobsEnd = lines.length;
  for (let i = jobsStart + 1; i < lines.length; i += 1) {
    if (TOP_LEVEL.test(lines[i])) {
      jobsEnd = i;
      break;
    }
  }

  const headers = [];
  for (let i = jobsStart + 1; i < jobsEnd; i += 1) {
    const header = lines[i].match(JOB_HEADER);
    if (header) headers.push({ id: header[1], index: i });
  }

  return headers.map((header, at) => {
    const block = { id: header.id, index: header.index, end: headers[at + 1]?.index ?? jobsEnd };
    const rows = lines.slice(block.index + 1, block.end);
    block.usesSecrets = rows.some((row) => !row.trimStart().startsWith("#") && SECRET.test(row));

    const nameRow = rows.find((row) => /^ {4}name:/.test(row));
    block.name = nameRow?.match(/^ {4}name:\s*(.+?)\s*$/)?.[1] ?? "";

    const ifIndex = rows.findIndex((row) => /^ {4}if:/.test(row));
    block.ifLine = ifIndex === -1 ? null : block.index + ifIndex + 2;
    block.condition = "";
    if (ifIndex !== -1) {
      const value = rows[ifIndex].match(/^ {4}if:\s*(.*)$/)?.[1] ?? "";
      // Gefalteter oder literaler Block, auch mit Einrueckungsanzeiger oder
      // Kommentar dahinter ("if: >-  # warum"): Folgezeilen bis zur naechsten
      // Angabe im Job gehoeren zur Bedingung.
      if (/^[>|][+-]?\d*\s*(?:#.*)?$/.test(value.trim())) {
        const folded = [];
        for (let i = ifIndex + 1; i < rows.length; i += 1) {
          if (isIgnorable(rows[i])) continue;
          if (indentOf(rows[i]) <= 4) break;
          folded.push(rows[i].trim());
        }
        block.condition = folded.join(" ");
      } else {
        block.condition = value.trim();
      }
    }

    return block;
  });
}

// Bedingung, die github.event_name auf ein anderes Ereignis festlegt und
// workflow_run nicht erwaehnt: der Job kann auf einem workflow_run nicht laufen.
function runsOnlyOnOtherEvents(condition) {
  if (/workflow_run/.test(condition)) return false;
  const pinned = condition.match(/github\.event_name\s*==\s*['"]([A-Za-z_]+)['"]/);
  return Boolean(pinned) && pinned[1] !== "workflow_run";
}

export function inspect(file, text, { exempt = EXEMPTIONS } = {}) {
  const lines = text.split(/\r?\n/);
  const findings = [];
  const trigger = events(lines);

  if (trigger.has("pull_request_target")) {
    findings.push({
      file,
      line: trigger.get("pull_request_target"),
      reason: "pull-request-target",
      snippet: "pull_request_target ist verboten",
    });
  }

  const env = topLevelBlock(lines, "env:");
  if (env) {
    for (let i = env.start + 1; i < env.end; i += 1) {
      if (isIgnorable(lines[i]) || !SECRET.test(lines[i])) continue;
      findings.push({
        file,
        line: i + 1,
        reason: "workflow-env",
        snippet: "secrets.* im workflow-weiten env:",
      });
    }
  }

  const base = path.basename(file);
  const summary = { workflowRunJobs: 0, exempted: 0, gated: 0 };
  if (!trigger.has("workflow_run")) return { findings, ...summary };

  for (const job of jobBlocks(lines)) {
    if (!job.usesSecrets) continue;
    summary.workflowRunJobs += 1;

    if (exempt[`${base}::${job.id}`]) {
      summary.exempted += 1;
      continue;
    }
    if (runsOnlyOnOtherEvents(job.condition)) {
      summary.gated += 1;
      continue;
    }

    if (!CONCLUSION.test(job.condition)) {
      findings.push({
        file,
        line: job.ifLine ?? job.index + 1,
        reason: "conclusion",
        snippet: `workflow_run-Job ${job.id} nutzt secrets.* ohne conclusion-Filter`,
      });
      continue;
    }

    const deploys = /deploy/i.test(job.id) || /deploy/i.test(job.name) || /^deploy/i.test(base);
    if (deploys && !PUSH_EVENT.test(job.condition)) {
      findings.push({
        file,
        line: job.ifLine ?? job.index + 1,
        reason: "push",
        snippet: `Deploy-Job ${job.id} prueft github.event.workflow_run.event == 'push' nicht`,
      });
    }
  }

  return { findings, ...summary };
}

const HINTS = {
  "pull-request-target":
    "pull_request_target gibt dem Code aus dem PR Secrets und Schreibrechte - auf pull_request wechseln und Secrets nur in workflow_dispatch/workflow_run-Jobs nutzen",
  conclusion:
    "im job-if auf github.event.workflow_run.conclusion == 'success' filtern oder den Job mit Grund in EXEMPTIONS eintragen",
  push:
    "im job-if zusaetzlich github.event.workflow_run.event == 'push' verlangen, damit nur ein Push auf main deploys",
  "workflow-env":
    "secrets.* nur im Job oder Step setzen (env: auf Job-/Step-Ebene), nicht workflow-weit",
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
  const result = { files: files.length, findings: [], workflowRunJobs: 0, exempted: 0, gated: 0 };
  for (const file of files) {
    const inspected = inspect(file, await readFile(file, "utf8"));
    result.findings.push(...inspected.findings);
    result.workflowRunJobs += inspected.workflowRunJobs;
    result.exempted += inspected.exempted;
    result.gated += inspected.gated;
  }
  return result;
}

async function main() {
  const { files, findings, workflowRunJobs, exempted, gated } = await audit();

  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`::error file=${finding.file},line=${finding.line}::${finding.snippet} -- ${HINTS[finding.reason]}`);
    }
    console.error(
      `${findings.length} Befund(e): Trigger und Secrets in den Workflows sind nicht abgesichert. ` +
        "pull_request_target ist verboten, workflow_run-Jobs mit Secrets brauchen einen conclusion-Filter " +
        "(Deploys zusaetzlich event == 'push'), und secrets.* gehoert nicht ins workflow-weite env:.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Trigger und Secrets: ${files} Workflow-Dateien geprueft, kein pull_request_target, ` +
      `${workflowRunJobs} workflow_run-Job(s) mit Secrets filtern auf conclusion (Deploys zusaetzlich auf push), ` +
      `${gated} Job(s) laufen nachweislich nur bei anderen Ereignissen, ` +
      `${exempted} begruendete Ausnahme(n) fuer Fehler-Meldungen, ` +
      `keine Secrets im workflow-weiten env: (${WORKFLOWS_DIR}).`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
