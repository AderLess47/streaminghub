#!/usr/bin/env node
/**
 * Prueft, dass jeder curl-Aufruf in .github/workflows und scripts/ einen
 * Zeitdeckel hat (--max-time, kurz -m).
 *
 * Ohne Deckel laeuft ein steckengebliebener Download bis zum Job-Timeout (10
 * bzw. 30 Minuten), statt zu scheitern; genau das passierte im
 * Robolectric-Schritt vor #427. Damit der Deckel nicht wieder abrutscht, ist
 * diese Pruefung Teil des Lint-Jobs; die Faelle selbst deckt
 * scripts/check-curl-timeouts.test.mjs ab.
 *
 * curl wird nur an einer Kommando-Position erkannt (Zeilenanfang, nach
 * ";" "&" "|" "&&" "||" "$(" "then" "do" "!"), nicht in Kommentaren und nicht
 * in Meldungstexten wie "curl exit 22". Steht der Deckel in einer Variablen
 * oder einem Array derselben Datei (CURL_PROBE=(--connect-timeout 2
 * --max-time 10 ...)), gilt der Aufruf als gedeckelt. Variablen aus anderen
 * Dateien kennt die Pruefung bewusst nicht: der Deckel soll dort stehen, wo
 * der Aufruf steht.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOTS = [".github/workflows", "scripts"];
export const EXTENSIONS = new Set([".yml", ".yaml", ".sh", ".bash", ".mjs", ".cjs", ".js", ".ts"]);
export const THIS_FILE = path.join("scripts", "check-curl-timeouts.mjs");

// "curl" muss ein Kommando sein und ein Argument haben; damit fallen Treffer
// in Regex-Literalen ("curl[ \t]") und in Saetzen ("curl exit 22") heraus.
export const CURL_AT_COMMAND = /(?:^|[;&|]|\$\(|\bthen\b|\bdo\b|!)\s*curl[ \t]/;
export const TIME_CAP = /(?:^|\s)--max-time(?:=|\s)|(?:^|\s)-m\s/;
const VARIABLE_REFERENCE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\[@\]\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;

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
    if (entry.isDirectory()) {
      found.push(...(await collect(full)));
      continue;
    }
    if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) found.push(full);
  }
  return found;
}

// Fuehrt Backslash-Fortsetzungen zusammen: der Deckel steht oft in der
// naechsten Zeile, gehoert aber zum selben Aufruf.
export function logicalLines(text) {
  const lines = [];
  let buffer = "";
  let start = 0;
  text.split("\n").forEach((line, index) => {
    if (!buffer) {
      if (line.trim().startsWith("#")) return;
      start = index + 1;
    }
    if (line.trimEnd().endsWith("\\")) {
      buffer += `${line.trimEnd().slice(0, -1)} `;
      return;
    }
    lines.push({ line: start, text: buffer + line });
    buffer = "";
  });
  if (buffer) lines.push({ line: start, text: buffer });
  return lines;
}

// Deckel-Quellen derselben Datei: Shell-Zuweisungen, Array-Bloecke und
// YAML-Schluessel (env:). Der Wert wird nur auf --max-time geprueft.
export function collectCaps(text) {
  const caps = new Map();
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const array = lines[index].match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=\((.*)$/);
    if (array) {
      // Einzeiliges Array X=(a b): nur diese Zeile zaehlt, sonst wuerde der
      // Block bis zum naechsten ")" laufen und fremde Deckel mitnehmen.
      if (array[2].includes(")")) {
        caps.set(array[1], array[2]);
        continue;
      }
      let block = "";
      let end = index;
      for (; end < lines.length; end += 1) {
        block += `${lines[end]}\n`;
        if (end > index && /^\s*\)\s*$/.test(lines[end])) break;
      }
      caps.set(array[1], block);
      index = end;
      continue;
    }
    const assignment = lines[index].match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (assignment) {
      caps.set(assignment[1], assignment[2]);
      continue;
    }
    const yamlKey = lines[index].match(/^\s*-?\s*([A-Za-z_][A-Za-z0-9_]*):\s+(\S.*)$/);
    if (yamlKey) caps.set(yamlKey[1], yamlKey[2]);
  }
  return caps;
}

// Schneidet den Aufruf an der naechsten Pipe- oder Semikolon-Grenze ab, damit
// ein --max-time eines spaeteren Kommandos nicht mitzaehlt.
function commandSlice(text, start) {
  const rest = text.slice(start);
  const cut = rest.search(/\s(?:\||;|&&|\|\|)\s/);
  return cut === -1 ? rest : rest.slice(0, cut);
}

function capped(command, caps) {
  if (TIME_CAP.test(command)) return true;
  for (const match of command.matchAll(VARIABLE_REFERENCE)) {
    const name = match[1] ?? match[2];
    const value = caps.get(name);
    if (value && TIME_CAP.test(value)) return true;
  }
  return false;
}

export function inspect(file, text) {
  const caps = collectCaps(text);
  const findings = [];
  let calls = 0;
  for (const { line, text: logical } of logicalLines(text)) {
    for (const match of logical.matchAll(new RegExp(CURL_AT_COMMAND.source, "g"))) {
      calls += 1;
      const command = commandSlice(logical, match.index).trim();
      if (!capped(command, caps)) findings.push({ file, line, command });
    }
  }
  return { calls, findings };
}

export async function audit({ roots = ROOTS, skip = [THIS_FILE] } = {}) {
  const skipped = new Set(skip.map((entry) => path.normalize(entry)));
  const files = [];
  for (const root of roots) files.push(...(await collect(root)));
  const inspected = files.filter((file) => !skipped.has(path.normalize(file))).sort();

  let calls = 0;
  const findings = [];
  for (const file of inspected) {
    const result = inspect(file, await readFile(file, "utf8"));
    calls += result.calls;
    findings.push(...result.findings);
  }
  return { calls, findings, files: inspected };
}

async function main() {
  const { calls, findings, files } = await audit();

  if (findings.length > 0) {
    for (const finding of findings) {
      const snippet = finding.command.replace(/\s+/g, " ").slice(0, 120);
      console.error(`::error file=${finding.file},line=${finding.line}::curl ohne --max-time: ${snippet}`);
    }
    console.error(
      `${findings.length} curl-Aufruf(e) ohne Zeitdeckel. Deckel setzen: --max-time <Sekunden> ` +
        "(Werte siehe jobs.android in .github/workflows/ci.yml).",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`curl-Zeitdeckel: ${calls} Aufrufe in ${files.length} Dateien geprueft, alle gedeckelt.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
