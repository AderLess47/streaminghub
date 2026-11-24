#!/usr/bin/env node
/**
 * Prueft drei Hygiene-Regeln der Workflows in .github/workflows:
 *
 *   1. permissions:   damit GITHUB_TOKEN nur die Rechte bekommt, die der Lauf
 *                     braucht, statt der Standardrechte des Repositories
 *   2. concurrency:   damit sich zwei Laeufe nicht ueberholen (doppelte
 *                     Deploys, zwei Backups gleichzeitig, zwei Issues)
 *   3. timeout-minutes je Job: ohne Deckel laeuft ein haengender Schritt bis
 *                     zum GitHub-Maximum (360 Minuten) und blockiert bei
 *                     concurrency cancel-in-progress: false die Laufgruppe.
 *
 * permissions und concurrency wirken workflow-weit; eine Angabe nur in
 * einzelnen Jobs deckt die uebrigen Jobs nicht ab und zaehlt hier deshalb
 * nicht. Ein leerer Wert ("permissions:" ohne Inhalt) ist ebenfalls ein
 * Befund: dann gelten die Standardrechte, also genau das, was die Angabe
 * verhindern soll; "permissions: {}" ist die ausdrueckliche Variante ohne
 * Rechte.
 *
 * timeout-minutes gilt je Job und muss dort stehen, wo der Job steht (Spalte 4);
 * ein Timeout im Step deckt die uebrigen Steps nicht ab. Ausdruecke wie
 * "${{ inputs.timeout }}" werden nicht bewertet - sie sind nicht statisch
 * pruefbar und zaehlen als gesetzt.
 *
 * Geprueft wird nur, ob die Angabe vorhanden und brauchbar ist - nicht, ob die
 * gewaehlten Rechte oder Minuten zum Job passen. actionlint prueft die Syntax.
 *
 * Die Faelle selbst deckt scripts/check-workflow-hygiene.test.mjs ab.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WORKFLOWS_DIR = path.join(".github", "workflows");
export const EXTENSIONS = new Set([".yml", ".yaml"]);

// Reihenfolge der Meldungen: erst die Rechte, dann die Laufgruppe, dann der Deckel.
export const REQUIRED_KEYS = ["permissions", "concurrency"];
export const JOB_TIMEOUT = "timeout-minutes";

// Schluessel auf Workflow-Ebene stehen in Spalte 0. Eingerueckte Schluessel
// gehoeren zu on:, jobs: oder einem Job und zaehlen hier nicht.
export const TOP_LEVEL_KEY = /^([A-Za-z0-9_.-]+):(?:\s+(.*))?$/;
const JOB_HEADER = /^ {2}([A-Za-z0-9_-]+):\s*(?:#.*)?$/;
const TIMEOUT_LINE = /^ {4}timeout-minutes:\s*(.*)$/;

function isIgnorable(line) {
  const trimmed = line.trim();
  return trimmed === "" || trimmed.startsWith("#");
}

// Steht unter "key:" (ohne Wert in derselben Zeile) ein eingerueckter Block?
// Leerzeilen und reine Kommentarzeilen dazwischen ueberspringen; der naechste
// Schluessel in Spalte 0 beendet den Block.
function hasIndentedBlock(lines, index) {
  for (let next = index + 1; next < lines.length; next += 1) {
    const line = lines[next];
    if (isIgnorable(line)) continue;
    return line !== line.trimStart();
  }
  return false;
}

function jobBlocks(lines) {
  const start = lines.findIndex((line) => /^jobs:\s*(?:#.*)?$/.test(line));
  if (start === -1) return [];
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (TOP_LEVEL_KEY.test(lines[i])) {
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
    let timeout = null;
    for (let i = header.index + 1; i < stop; i += 1) {
      const match = lines[i].match(TIMEOUT_LINE);
      if (match) {
        timeout = { line: i + 1, value: match[1].replace(/\s+#.*$/, "").trim() };
        break;
      }
    }
    return { id: header.id, line: header.index + 1, timeout };
  });
}

function timeoutFinding(file, job) {
  const base = { file, key: JOB_TIMEOUT };
  if (!job.timeout) {
    return { ...base, line: job.line, reason: "timeout", snippet: `Job ${job.id}: timeout-minutes: fehlt` };
  }
  if (job.timeout.value === "") {
    return {
      ...base,
      line: job.timeout.line,
      reason: "timeout-empty",
      snippet: `Job ${job.id}: timeout-minutes: ohne Wert`,
    };
  }
  if (/\$\{\{/.test(job.timeout.value)) return null;
  const minutes = Number(job.timeout.value);
  if (!Number.isInteger(minutes) || minutes < 1) {
    return {
      ...base,
      line: job.timeout.line,
      reason: "timeout-invalid",
      snippet: `Job ${job.id}: timeout-minutes: ${job.timeout.value} ist keine positive ganze Zahl`,
    };
  }
  return null;
}

export function inspect(file, text) {
  const lines = text.split(/\r?\n/);
  const present = new Map();

  lines.forEach((raw, index) => {
    const line = raw.replace(/\s+$/, "");
    if (isIgnorable(line)) return;
    if (line !== line.trimStart()) return;

    const match = line.match(TOP_LEVEL_KEY);
    if (!match) return;
    const key = match[1];
    if (!REQUIRED_KEYS.includes(key)) return;

    const inline = (match[2] ?? "").trim();
    const hasValue = inline !== "" && !inline.startsWith("#");
    const filled = hasValue || hasIndentedBlock(lines, index);

    const previous = present.get(key);
    if (!previous) present.set(key, { line: index + 1, empty: !filled });
    else if (filled) present.set(key, { line: previous.line, empty: false });
  });

  const findings = [];
  for (const key of REQUIRED_KEYS) {
    const entry = present.get(key);
    if (!entry) {
      findings.push({ file, line: 1, key, reason: key, snippet: `${key}: fehlt` });
    } else if (entry.empty) {
      findings.push({ file, line: entry.line, key, reason: `${key}-empty`, snippet: `${key}: ohne Wert` });
    }
  }

  const jobs = jobBlocks(lines);
  for (const job of jobs) {
    const finding = timeoutFinding(file, job);
    if (finding) findings.push(finding);
  }

  return {
    findings,
    hasPermissions: present.has("permissions"),
    hasConcurrency: present.has("concurrency"),
    jobs: jobs.length,
    timeouts: jobs.filter((job) => job.timeout && !timeoutFinding(file, job)).length,
  };
}

async function collect(directory) {
  const found = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await collect(full)));
    else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) found.push(full);
  }
  return found;
}

export async function audit({ directory = WORKFLOWS_DIR } = {}) {
  const files = await collect(directory);
  const result = { files, findings: [], permissions: 0, concurrency: 0, jobs: 0, timeouts: 0 };
  for (const file of files) {
    const inspected = inspect(file, await readFile(file, "utf8"));
    result.permissions += inspected.hasPermissions ? 1 : 0;
    result.concurrency += inspected.hasConcurrency ? 1 : 0;
    result.jobs += inspected.jobs;
    result.timeouts += inspected.timeouts;
    result.findings.push(...inspected.findings);
  }
  return result;
}

// Einzeilig halten: GitHub bricht mehrzeilige ::error::-Meldungen ab.
const HINTS = {
  permissions: "permissions: fehlt im Workflow-Kopf - workflow-weit z. B. contents: read setzen (oder permissions: {})",
  "permissions-empty": 'permissions: hat keinen Wert - "contents: read" oder "{}" eintragen, sonst gelten die Standardrechte',
  concurrency: "concurrency: fehlt im Workflow-Kopf - group: <name> setzen, damit sich Laeufe nicht ueberholen",
  "concurrency-empty": 'concurrency: hat keinen Wert - "group: <name>" (und cancel-in-progress) ergaenzen',
  timeout: "timeout-minutes: fehlt im Job - Deckel setzen (z. B. 10), sonst laeuft ein haengender Schritt bis 360 Minuten",
  "timeout-empty": 'timeout-minutes: hat keinen Wert - positive Minutenangabe eintragen, z. B. "10"',
  "timeout-invalid": "timeout-minutes: braucht eine positive ganze Zahl (1-360)",
};

async function main() {
  const { files, findings, permissions, concurrency, jobs, timeouts } = await audit();

  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`::error file=${finding.file},line=${finding.line}::${finding.snippet} -- ${HINTS[finding.reason]}`);
    }
    console.error(
      `${findings.length} Befund(e): Workflow-Hygiene unvollstaendig. Jeder Workflow braucht ` +
        "workflow-weites permissions: (z. B. contents: read) und concurrency: (group: <name>), " +
        "damit GITHUB_TOKEN nicht mehr darf als noetig und sich zwei Laeufe nicht ueberholen; " +
        `jeder Job braucht ${JOB_TIMEOUT}: als positiven Deckel.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Workflow-Hygiene: ${files.length} Workflow-Dateien geprueft (${permissions} permissions, ` +
      `${concurrency} concurrency), alle mit workflow-weiten Angaben; ` +
      `${timeouts}/${jobs} Job(s) mit ${JOB_TIMEOUT} (${WORKFLOWS_DIR}).`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
