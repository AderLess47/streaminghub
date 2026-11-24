#!/usr/bin/env node
/**
 * Prueft, ob jeder Deploy-Job die passende GitHub-Umgebung deklariert:
 *
 *   1. Ein Job, der `flyctl deploy` ausfuehrt, braucht ein `environment:`, das
 *      zur deployten App passt (DEPLOY_ENVIRONMENTS). An der Umgebung haengen
 *      Umgebungs-Secrets und Required Reviewer; ein Produktions-Deploy ohne
 *      `environment: production` kann beides nicht bekommen, umgeht eine
 *      spaetere Freigaberegel und fehlt in der Deployment-Historie.
 *   2. Der App-Name muss statisch im Befehl stehen (`--app streaminghub-org`);
 *      `--app "$APP"` ist nicht pruefbar und deshalb ein Befund.
 *   3. Eine App ohne Eintrag in DEPLOY_ENVIRONMENTS ist ein Befund, damit ein
 *      neues Deploy-Ziel nicht still ohne Umgebung durchrutscht.
 *
 * Andere `flyctl`-Aufrufe (secrets set, ssh) sind kein Deploy und werden nicht
 * bewertet. Geprueft wird nur die Deklaration - ob Required Reviewer
 * eingerichtet sind, ist eine Repository-Einstellung und hier nicht sichtbar.
 *
 * Faelle: scripts/check-deploy-environment.test.mjs.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WORKFLOWS_DIR = path.join(".github", "workflows");
const EXTENSIONS = new Set([".yml", ".yaml"]);

// Fly-App -> GitHub-Umgebung. Neue Deploy-Ziele brauchen hier einen Eintrag.
export const DEPLOY_ENVIRONMENTS = {
  "streaminghub-org": "production",
  "streaminghub-staging": "staging",
};

const TOP_LEVEL = /^([A-Za-z0-9_.-]+):/;
const JOB_HEADER = /^ {2}([A-Za-z0-9_-]+):\s*(?:#.*)?$/;
const JOB_ENV = /^ {4}environment:\s*(.*)$/;
const JOB_ENV_NAME = /^ {6}name:\s*(.*)$/;
// Nur ein Aufruf zaehlt, nicht das Wort in einer Meldung: "::error …::flyctl
// deploy kam nicht voran" beginnt nach einem Doppelpunkt und faellt hier raus.
const DEPLOY_CALL = /(?:^|[\s;|&(])(?:flyctl|fly)\s+deploy\b/;
const APP_FLAG = /(?:^|\s)--app(?:=|\s+)(\S+)/;

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
    return { id: header.id, line: header.index + 1, rows };
  });
}

// Fortsetzungszeilen (Zeilenende "\") zu einem Befehl zusammenfassen: `--app`
// steht oft erst in der zweiten Zeile von `flyctl deploy`.
function logicalLines(rows) {
  const lines = [];
  let pending = null;
  for (const row of rows) {
    const text = row.text.trim();
    if (pending) {
      pending.text += ` ${text.replace(/\\$/, "")}`;
      if (!text.endsWith("\\")) {
        lines.push(pending);
        pending = null;
      }
      continue;
    }
    if (text === "" || text.startsWith("#")) continue;
    if (text.endsWith("\\")) pending = { line: row.line, text: text.replace(/\\$/, "") };
    else lines.push({ line: row.line, text });
  }
  if (pending) lines.push(pending);
  return lines;
}

// environment: inline oder als Block mit name: darunter.
function declaredEnvironment(rows) {
  for (let i = 0; i < rows.length; i += 1) {
    const inline = rows[i].text.match(JOB_ENV);
    if (!inline) continue;
    const raw = value(inline[1]);
    if (raw) return { line: rows[i].line, name: unquote(raw) };
    for (let j = i + 1; j < rows.length; j += 1) {
      const text = rows[j].text;
      if (text.trim() === "" || text.trimStart().startsWith("#")) continue;
      if (!text.startsWith("      ")) break;
      const nested = text.match(JOB_ENV_NAME);
      if (nested) return { line: rows[j].line, name: unquote(value(nested[1])) };
    }
    return { line: rows[i].line, name: "" };
  }
  return null;
}

function deployedApps(rows) {
  const apps = new Map();
  for (const line of logicalLines(rows)) {
    if (!DEPLOY_CALL.test(line.text)) continue;
    const app = line.text.match(APP_FLAG);
    const name = app ? unquote(app[1].replace(/["']$/, "")) : "";
    if (!apps.has(name)) apps.set(name, line.line);
  }
  return apps;
}

export function inspect(file, text) {
  const lines = text.split(/\r?\n/);
  const findings = [];
  const environments = new Set();
  const jobs = jobBlocks(lines);
  let deploys = 0;

  for (const job of jobs) {
    const apps = deployedApps(job.rows);
    if (apps.size === 0) continue;

    const declared = declaredEnvironment(job.rows);
    for (const [app, line] of apps) {
      deploys += 1;

      if (app === "" || app.includes("$")) {
        findings.push({
          file,
          line,
          reason: "app-dynamic",
          snippet: `Job ${job.id} deployt mit --app ${app || "<fehlt>"}: App nicht statisch bestimmbar, Umgebung nicht pruefbar`,
        });
        continue;
      }

      const expected = DEPLOY_ENVIRONMENTS[app];
      if (!expected) {
        findings.push({
          file,
          line,
          reason: "app-unknown",
          snippet: `Job ${job.id} deployt App "${app}", die keiner Umgebung zugeordnet ist`,
        });
        continue;
      }

      if (!declared || declared.name === "") {
        findings.push({
          file,
          line: job.line,
          reason: "environment-missing",
          snippet: `Job ${job.id} deployt "${app}" (${expected}) ohne environment: ${expected}`,
        });
        continue;
      }
      if (declared.name.includes("$")) {
        continue; // Ausdruck: nicht statisch pruefbar, zaehlt als gesetzt
      }
      if (declared.name !== expected) {
        findings.push({
          file,
          line: declared.line,
          reason: "environment-mismatch",
          snippet: `Job ${job.id} deployt "${app}" (${expected}), hat aber environment: ${declared.name}`,
        });
        continue;
      }
      environments.add(expected);
    }
  }

  return { findings, jobs: jobs.length, deploys, environments: [...environments].sort() };
}

const HINTS = {
  "environment-missing": "environment: <name> im Job ergaenzen - daran haengen Umgebungs-Secrets und Required Reviewer",
  "environment-mismatch": "environment: auf die Umgebung der deployten App setzen (siehe DEPLOY_ENVIRONMENTS)",
  "app-unknown": "App in DEPLOY_ENVIRONMENTS einer Umgebung zuordnen",
  "app-dynamic": "--app <name> statisch hinschreiben, sonst ist die Umgebung nicht pruefbar",
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
  const result = { files: files.length, findings: [], jobs: 0, deploys: 0, environments: [] };
  const environments = new Set();
  for (const file of files) {
    const inspected = inspect(file, await readFile(file, "utf8"));
    result.findings.push(...inspected.findings);
    result.jobs += inspected.jobs;
    result.deploys += inspected.deploys;
    for (const name of inspected.environments) environments.add(name);
  }
  result.environments = [...environments].sort();
  return result;
}

async function main() {
  const { files, findings, jobs, deploys, environments } = await audit();

  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`::error file=${finding.file},line=${finding.line}::${finding.snippet} -- ${HINTS[finding.reason]}`);
    }
    console.error(
      `${findings.length} Befund(e): Deploy-Jobs brauchen ein environment:, das zur deployten App passt ` +
        "(DEPLOY_ENVIRONMENTS). An der Umgebung haengen Umgebungs-Secrets und Required Reviewer.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Deploy-Umgebungen: ${files} Workflow-Dateien mit ${jobs} Job(s) geprueft, ` +
      `${deploys} Deploy(s) in ${environments.join(", ") || "keiner Umgebung"} mit passendem environment: ` +
      `(${WORKFLOWS_DIR}).`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
