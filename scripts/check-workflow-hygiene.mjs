#!/usr/bin/env node
/**
 * Prueft, dass jeder Workflow in .github/workflows zwei Angaben im Kopf hat:
 *
 *   permissions:      damit GITHUB_TOKEN nur die Rechte bekommt, die der Lauf
 *                     braucht, statt der Standardrechte des Repositories
 *   concurrency:      damit sich zwei Laeufe nicht ueberholen (doppelte
 *                     Deploys, zwei Backups gleichzeitig, zwei Issues)
 *
 * Beide Angaben wirken workflow-weit; eine Angabe nur in einzelnen Jobs deckt
 * die uebrigen Jobs nicht ab und zaehlt hier deshalb nicht. Ein leerer Wert
 * ("permissions:" ohne Inhalt) ist ebenfalls ein Befund: dann gelten die
 * Standardrechte, also genau das, was die Angabe verhindern soll;
 * "permissions: {}" ist die ausdrueckliche Variante ohne Rechte.
 *
 * Geprueft wird nur, ob die Angabe vorhanden und nicht leer ist - nicht, ob
 * die gewaehlten Rechte zum Job passen. Das entscheidet der Lauf selbst (ein
 * fehlendes Recht laesst den Job scheitern); actionlint prueft die Syntax.
 *
 * Die Faelle selbst deckt scripts/check-workflow-hygiene.test.mjs ab.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WORKFLOWS_DIR = path.join(".github", "workflows");
export const EXTENSIONS = new Set([".yml", ".yaml"]);

// Reihenfolge der Meldungen: erst die Rechte, dann die Laufgruppe.
export const REQUIRED_KEYS = ["permissions", "concurrency"];

// Schluessel auf Workflow-Ebene stehen in Spalte 0. Eingerueckte Schluessel
// gehoeren zu on:, jobs: oder einem Job und zaehlen hier nicht.
export const TOP_LEVEL_KEY = /^([A-Za-z0-9_.-]+):(?:\s+(.*))?$/;

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

  return {
    findings,
    hasPermissions: present.has("permissions"),
    hasConcurrency: present.has("concurrency"),
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
  const result = { files, findings: [], permissions: 0, concurrency: 0 };
  for (const file of files) {
    const inspected = inspect(file, await readFile(file, "utf8"));
    result.permissions += inspected.hasPermissions ? 1 : 0;
    result.concurrency += inspected.hasConcurrency ? 1 : 0;
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
};

async function main() {
  const { files, findings, permissions, concurrency } = await audit();

  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`::error file=${finding.file},line=${finding.line}::${finding.snippet} -- ${HINTS[finding.reason]}`);
    }
    console.error(
      `${findings.length} fehlende oder leere Angabe(n) im Workflow-Kopf. Jeder Workflow braucht ` +
        "workflow-weites permissions: (z. B. contents: read) und concurrency: (group: <name>), " +
        "damit GITHUB_TOKEN nicht mehr darf als noetig und sich zwei Laeufe nicht ueberholen.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Workflow-Kopf: ${files.length} Workflow-Dateien geprueft (${permissions} permissions, ` +
      `${concurrency} concurrency), alle mit workflow-weiten Angaben (${WORKFLOWS_DIR}).`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
