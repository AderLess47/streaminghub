#!/usr/bin/env node
/**
 * Prueft, ob jeder Deploy-Job eine GitHub-Umgebung deklariert:
 *
 *   1. Ein Job, der `flyctl deploy` (oder `fly deploy`) ausfuehrt, braucht ein
 *      `environment:`. An der Umgebung haengen Umgebungs-Secrets und Required
 *      Reviewer; ohne sie laeuft der Deploy an beidem vorbei und fehlt in der
 *      Deployment-Historie der Umgebung.
 *   2. Ein leerer Wert (`environment:` ohne `name:` darunter) ist ein Befund:
 *      der Job sieht aus, als haette er eine Umgebung, hat aber keine.
 *   3. Welcher Name passt, bewertet die Regel nicht. Eine App-zu-Umgebung-
 *      Tabelle hier waere eine zweite Wahrheit neben fly.toml und koennte
 *      selbst falsch sein - dann segnet sie genau den Fehler ab, den sie
 *      finden soll. Der Name steht im Diff, und die Deployment-Historie der
 *      Umgebung zeigt sofort, wenn ein Deploy dort falsch haengt.
 *
 * Andere `flyctl`-Aufrufe (secrets set, ssh) sind kein Deploy und werden nicht
 * bewertet. Ein Ausdruck als Wert (${{ inputs.environment }}) ist nicht
 * statisch pruefbar und zaehlt als gesetzt.
 *
 * Faelle: scripts/check-deploy-environment.test.mjs.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WORKFLOWS_DIR = path.join(".github", "workflows");
const EXTENSIONS = new Set([".yml", ".yaml"]);

const TOP_LEVEL = /^([A-Za-z0-9_.-]+):/;
const JOB_HEADER = /^ {2}([A-Za-z0-9_-]+):\s*(?:#.*)?$/;
const JOB_ENV = /^ {4}environment:\s*(.*)$/;
const JOB_ENV_NAME = /^ {6}name:\s*(.*)$/;
// Nur ein Aufruf zaehlt, nicht das Wort in einer Meldung: "::error …::flyctl
// deploy kam nicht voran" beginnt nach einem Doppelpunkt und faellt hier raus.
const DEPLOY_CALL = /(?:^|[\s;|&(])(?:flyctl|fly)\s+deploy\b/;

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
    return { id: header.id, line: header.index + 1, rows };
  });
}

function isDeployCall(row) {
  const text = row.text.trim();
  return text !== "" && !text.startsWith("#") && DEPLOY_CALL.test(text);
}

// environment: inline oder als Block mit name: darunter.
function declaredEnvironment(rows) {
  for (let i = 0; i < rows.length; i += 1) {
    const inline = rows[i].text.match(JOB_ENV);
    if (!inline) continue;
    const raw = value(inline[1]);
    if (raw) return { line: rows[i].line, name: raw };
    for (let j = i + 1; j < rows.length; j += 1) {
      const text = rows[j].text;
      if (text.trim() === "" || text.trimStart().startsWith("#")) continue;
      if (!text.startsWith("      ")) break;
      const nested = text.match(JOB_ENV_NAME);
      if (nested) return { line: rows[j].line, name: value(nested[1]) };
    }
    return { line: rows[i].line, name: "" };
  }
  return null;
}

export function inspect(file, text) {
  const jobs = jobBlocks(text.split(/\r?\n/));
  const findings = [];
  let deploys = 0;

  for (const job of jobs) {
    if (!job.rows.some(isDeployCall)) continue;
    deploys += 1;

    const declared = declaredEnvironment(job.rows);
    if (!declared) {
      findings.push({
        file,
        line: job.line,
        reason: "environment-missing",
        snippet: `Job ${job.id} deployt ohne environment:`,
      });
    } else if (declared.name === "") {
      findings.push({
        file,
        line: declared.line,
        reason: "environment-empty",
        snippet: `Job ${job.id}: environment: ohne Namen`,
      });
    }
  }

  return { findings, jobs: jobs.length, deploys };
}

const HINTS = {
  "environment-missing": "environment: <name> im Job ergaenzen - daran haengen Umgebungs-Secrets und Required Reviewer",
  "environment-empty": "environment: braucht einen Namen (inline oder als name: darunter)",
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
  const result = { files: files.length, findings: [], jobs: 0, deploys: 0 };
  for (const file of files) {
    const inspected = inspect(file, await readFile(file, "utf8"));
    result.findings.push(...inspected.findings);
    result.jobs += inspected.jobs;
    result.deploys += inspected.deploys;
  }
  return result;
}

async function main() {
  const { files, findings, jobs, deploys } = await audit();

  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`::error file=${finding.file},line=${finding.line}::${finding.snippet} -- ${HINTS[finding.reason]}`);
    }
    console.error(
      `${findings.length} Befund(e): Jeder Deploy-Job braucht ein environment: - daran haengen ` +
        "Umgebungs-Secrets und Required Reviewer.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Deploy-Umgebungen: ${files} Workflow-Dateien mit ${jobs} Job(s) geprueft, ` +
      `${deploys} Deploy-Job(s), alle mit environment: (${WORKFLOWS_DIR}).`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
