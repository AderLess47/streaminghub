#!/usr/bin/env node
/**
 * Prueft, dass jeder Download-Aufruf in den Skript- und CI-Verzeichnissen einen
 * Zeitdeckel hat:
 *
 *   - curl:  --max-time / -m
 *   - wget:  --timeout / -T (wget kennt keinen Gesamtdeckel; deshalb gilt auch
 *            der Wrapper "timeout <Sekunden> wget …" als Deckel)
 *   - fetch: AbortSignal.timeout(...), wenn die Antwort in eine Datei
 *            geschrieben wird (Download). Reine API-Aufrufe ohne Dateizugriff
 *            bleiben aussen vor, damit Produktionscode nicht umgebaut wird.
 *
 * Ohne Deckel laeuft ein steckengebliebener Download bis zum Job-Timeout (10
 * bzw. 30 Minuten), statt zu scheitern; genau das passierte im
 * Robolectric-Schritt vor #427. Damit der Deckel nicht wieder abrutscht, ist
 * diese Pruefung Teil des Lint-Jobs; die Faelle selbst deckt
 * scripts/check-curl-timeouts.test.mjs ab.
 *
 * Durchsucht werden .github, ops, scripts, vega, apple, android und die
 * Dateien im Repo-Wurzelverzeichnis. src/ und docs/ bleiben ausse: dort stehen
 * curl-Beispiele als Dokumentation in der App (z.B.
 * src/app/docs/api/page.tsx), die nie ausgefuehrt werden.
 *
 * curl und wget werden nur an einer Kommando-Position erkannt (Zeilenanfang,
 * nach ";" "&" "|" "&&" "||" "$(" "then" "do" "!" "if" "elif" "while"
 * "until"), auch hinter einem Wrapper wie "sudo", "env", "timeout 30" oder
 * "xargs", nicht in Kommentaren und nicht in Meldungstexten wie "curl exit
 * 22". Steht der Deckel in einer Variablen oder einem Array derselben Datei
 * (CURL_PROBE=(...)), gilt der Aufruf als gedeckelt; das gilt auch, wenn die
 * Variable den ganzen Aufruf enthaelt ($CURL_CMD mit
 * CURL_CMD="curl -fsS --max-time 5").
 *
 * Deckel duerfen auch in einer gesourcten Lib-Datei stehen: "source <pfad>"
 * und ". <pfad>" werden aufgeloest, ein Deckel aus scripts/lib/flags.sh gilt
 * also fuer den Aufruf in der einbindenden Datei. Nur statische Pfade ohne
 * Variablen; dynamische Pfade ($VAR, $(...)) bleiben aussen vor, weil sich der
 * Deckel dort nicht nachweisen laesst.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOTS = [".github", "ops", "scripts", "vega", "apple", "android"];
export const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".next",
  "build",
  "dist",
  "out",
  "coverage",
  ".gradle",
  ".venv",
  "__pycache__",
]);
export const EXTENSIONS = new Set([".yml", ".yaml", ".sh", ".bash", ".mjs", ".cjs", ".js", ".ts"]);
export const THIS_FILE = path.join("scripts", "check-curl-timeouts.mjs");
// Die Testdatei enthaelt beide Marker (ungedeckelter Aufruf und
// createWriteStream/writeFile) als Fixtures und wuerde sich sonst selbst
// melden; ihre Faelle laufen ueber inspect()/inspectFile() statt ueber audit().
export const TEST_FILE = path.join("scripts", "check-curl-timeouts.test.mjs");

// Kommandoanfang. "(" allein fehlt bewusst: "(curl exit 22)" steht in
// Meldungstexten und ist kein Aufruf. Die Schluesselwoerter if/elif/while/until
// gelten nur direkt nach einer Kommandogrenze, damit ein Satz wie
// 'echo "if curl …"' nicht als Aufruf zaehlt.
const COMMAND_START = String.raw`(?:^|[;&|]|\$\(|\bthen\b|\bdo\b|!)\s*(?:(?:if|elif|while|until)\s+)?`;
// Wrapper, die ein Kommando ausfuehren. "command" fehlt bewusst, weil
// "command -v curl" nur prueft, ob curl installiert ist.
const WRAPPERS = String.raw`(?:(?:sudo|env|nohup|nice|xargs|time|timeout|exec|busybox)(?:\s+[^\s;&|]+)*\s+)?`;

// "curl"/"wget" muessen ein Kommando sein und ein Argument haben; damit fallen
// Treffer in Regex-Literalen ("curl[ \t]") und in Saetzen ("curl exit 22")
// heraus.
export const CURL_AT_COMMAND = new RegExp(`${COMMAND_START}${WRAPPERS}curl[ \\t]`);
export const WGET_AT_COMMAND = new RegExp(`${COMMAND_START}${WRAPPERS}wget[ \\t]`);
// Indirekt: ein Variablenname an Kommandoposition, dessen Wert mit curl oder
// wget beginnt ($CURL_CMD ...).
export const INDIRECT_AT_COMMAND = new RegExp(
  `${COMMAND_START}${WRAPPERS}"?\\$\\{?([A-Za-z_][A-Za-z0-9_]*)\\}?(?:\\[@\\])?"?[ \\t]`,
);
const STARTS_WITH_DOWNLOAD = new RegExp(`^${WRAPPERS}(curl|wget)[ \\t]`);
export const TIME_CAP = /(?:^|\s)--max-time(?:=|\s)|(?:^|\s)-m\s/;
// wget: --timeout/-T deckelt jede Operation (DNS, Verbinden, Lesen); einen
// Gesamtdeckel gibt es nur ueber den timeout-Wrapper.
export const WGET_CAP = /(?:^|\s)--timeout(?:=|\s)|(?:^|\s)-T\s|^\s*timeout\s+\d/;
export const FETCH_CAP = /AbortSignal\.timeout\s*\(/;
export const FETCH_AT_COMMAND = /\bfetch\s*\(/;
// Marker dafuer, dass die Antwort in eine Datei geht (also ein Download ist).
const DOWNLOAD_WRITE =
  /\b(?:createWriteStream|writeFileSync|writeFile|appendFileSync|appendFile|pipeline|copyFileSync|copyFile)\s*\(/;
const VARIABLE_REFERENCE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\[@\]\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;
const SOURCE_DIRECTIVE =
  /^\s*(?:source|\.)\s+(?:"([^"$`]+)"|'([^'$`]+)'|([^\s;&|"'`$()]+))/gm;

async function collect(directory, skipDirectories) {
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
      if (skipDirectories.has(entry.name)) continue;
      found.push(...(await collect(full, skipDirectories)));
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

// Deckel-Quellen derselben Datei: Shell-Zuweisungen, Array-Bloecke,
// JS-Deklarationen und YAML-Schluessel (env:). Der Wert wird nur auf den
// jeweiligen Deckel geprueft.
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
    // JS: const LIMIT = AbortSignal.timeout(5_000) darf per signal: LIMIT
    // verwendet werden.
    const declaration = lines[index].match(
      /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(.*)$/,
    );
    if (declaration) {
      caps.set(declaration[1], declaration[2]);
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

// Liest einen Aufruf ab der oeffnenden Klammer vollstaendig ein; Strings
// werden uebersprungen, damit eine ")" in einer URL den Aufruf nicht beendet.
function balancedCall(text, openIndex) {
  let depth = 0;
  let quote = "";
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === "\\") {
        index += 1;
        continue;
      }
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return text.slice(openIndex, index + 1);
    }
  }
  return text.slice(openIndex);
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let position = 0; position < index; position += 1) {
    if (text.charCodeAt(position) === 10) line += 1;
  }
  return line;
}

// Grober Bereich um einen fetch-Aufruf: von der umgebenden Funktionsdefinition
// auf Spalte 0 bis zu deren schliessender Klammer. Reicht, um "die Antwort
// landet in einer Datei" zu erkennen, ohne einen JS-Parser mitzubringen.
function enclosingScope(text, index) {
  const head = text.slice(0, index);
  const definitions = [
    ...head.matchAll(
      /^(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][A-Za-z0-9_$]*|^(?:export\s+)?const\s+[A-Za-z_$][A-Za-z0-9_$]*\s*=\s*(?:async\s*)?(?:function\b|\()/gm,
    ),
  ];
  const start = definitions.length > 0 ? definitions[definitions.length - 1].index : 0;
  const close = text.indexOf("\n}", index);
  return text.slice(start, close === -1 ? text.length : close);
}

function fetchCapped(call, caps) {
  if (FETCH_CAP.test(call)) return true;
  const signal = call.match(/\bsignal\s*:\s*([A-Za-z_$][A-Za-z0-9_$]*)/);
  if (!signal) return false;
  const value = caps.get(signal[1]);
  return value !== undefined && FETCH_CAP.test(value);
}

// fetch-Downloads: nur Aufrufe, deren Antwort in eine Datei geschrieben wird.
// Methodendefinitionen (async fetch(request, env)) und SDK-Methoden
// (client.fetch(...)) sind keine Downloads.
export function inspectFetch(file, text, caps) {
  const findings = [];
  let calls = 0;
  for (const match of text.matchAll(new RegExp(FETCH_AT_COMMAND.source, "g"))) {
    const before = text.slice(Math.max(0, match.index - 12), match.index);
    if (/(?:async\s+|\.|function\s+)$/.test(before)) continue;
    if (!DOWNLOAD_WRITE.test(enclosingScope(text, match.index))) continue;
    calls += 1;
    const call = balancedCall(text, match.index + match[0].length - 1);
    if (fetchCapped(call, caps)) continue;
    findings.push({
      file,
      line: lineNumberAt(text, match.index),
      kind: "fetch",
      command: call.replace(/\s+/g, " ").slice(0, 160),
    });
  }
  return { calls, findings };
}

export function inspect(file, text, caps = collectCaps(text)) {
  const findings = [];
  const counted = { curl: 0, wget: 0, fetch: 0 };

  for (const { line, text: logical } of logicalLines(text)) {
    for (const match of logical.matchAll(new RegExp(CURL_AT_COMMAND.source, "g"))) {
      counted.curl += 1;
      const command = commandSlice(logical, match.index).trim();
      if (!capped(command, caps)) findings.push({ file, line, kind: "curl", command });
    }

    for (const match of logical.matchAll(new RegExp(WGET_AT_COMMAND.source, "g"))) {
      counted.wget += 1;
      const command = commandSlice(logical, match.index).trim();
      if (!WGET_CAP.test(command)) findings.push({ file, line, kind: "wget", command });
    }

    for (const match of logical.matchAll(new RegExp(INDIRECT_AT_COMMAND.source, "g"))) {
      const name = match[1];
      const value = caps.get(name);
      const download = value === undefined ? null : value.trim().replace(/^["']/, "").match(STARTS_WITH_DOWNLOAD);
      if (!download) continue;
      const kind = download[1];
      counted[kind] += 1;
      const command = commandSlice(logical, match.index).trim();
      const cap = kind === "curl" ? TIME_CAP : WGET_CAP;
      // Der Deckel darf im Variablenwert stehen oder am Aufruf selbst.
      if (cap.test(value) || cap.test(command)) continue;
      findings.push({ file, line, kind, command: `${name}=${value.trim()} -> ${command}` });
    }
  }

  const fetched = inspectFetch(file, text, caps);
  counted.fetch = fetched.calls;
  findings.push(...fetched.findings);

  return { calls: counted.curl + counted.wget + counted.fetch, ...counted, findings };
}

// Statische "source"/"."-Einbindungen einer Shell-Datei.
export function collectIncludes(text) {
  const includes = [];
  for (const match of text.matchAll(SOURCE_DIRECTIVE)) includes.push(match[1] ?? match[2] ?? match[3]);
  return includes;
}

async function mergeSourcedCaps(file, text, caps, { read, depth, seen }) {
  if (depth <= 0) return;
  for (const include of collectIncludes(text)) {
    const target = path.resolve(path.dirname(file), include);
    if (seen.has(target)) continue;
    seen.add(target);
    let included;
    try {
      included = await read(target);
    } catch {
      // Datei fehlt oder ist nicht lesbar: dann muss der Deckel im Aufruf
      // stehen, die Pruefung meldet ihn wie bisher.
      continue;
    }
    for (const [name, value] of collectCaps(included)) if (!caps.has(name)) caps.set(name, value);
    await mergeSourcedCaps(target, included, caps, { read, depth: depth - 1, seen });
  }
}

// Wie inspect, loest aber zusaetzlich source/"."-Einbindungen auf. read ist
// injizierbar, damit die Tests ohne Dateisystem auskommen.
export async function inspectFile(file, { read = (target) => readFile(target, "utf8"), depth = 4 } = {}) {
  const text = await read(file);
  const caps = collectCaps(text);
  await mergeSourcedCaps(file, text, caps, { read, depth, seen: new Set([path.resolve(file)]) });
  return inspect(file, text, caps);
}

export async function audit({ roots = ROOTS, skip = [THIS_FILE, TEST_FILE] } = {}) {
  const skipped = new Set(skip.map((entry) => path.normalize(entry)));
  const files = [];
  for (const root of roots) files.push(...(await collect(root, SKIPPED_DIRECTORIES)));
  // Nur die Dateien direkt im Repo-Wurzelverzeichnis (kein rekursiver Abstieg,
  // sonst landen src/ und docs/ wieder im Lauf).
  for (const entry of await readdir(".").catch(() => [])) {
    if (EXTENSIONS.has(path.extname(entry))) files.push(entry);
  }
  const inspected = [...new Set(files)].filter((file) => !skipped.has(path.normalize(file))).sort();

  let calls = 0;
  let curl = 0;
  let wget = 0;
  let fetch = 0;
  const findings = [];
  for (const file of inspected) {
    const result = await inspectFile(file);
    calls += result.calls;
    curl += result.curl;
    wget += result.wget;
    fetch += result.fetch;
    findings.push(...result.findings);
  }
  return { calls, curl, wget, fetch, findings, files: inspected };
}

const CAP_HINTS = {
  curl: "--max-time",
  wget: "--timeout",
  fetch: "AbortSignal.timeout",
};

async function main() {
  const { calls, curl, wget, fetch, findings, files } = await audit();

  if (findings.length > 0) {
    for (const finding of findings) {
      const snippet = finding.command.replace(/\s+/g, " ").slice(0, 140);
      console.error(
        `::error file=${finding.file},line=${finding.line}::${finding.kind} ohne ${CAP_HINTS[finding.kind]}: ${snippet}`,
      );
    }
    console.error(
      `${findings.length} Download-Aufruf(e) ohne Zeitdeckel. curl: --max-time <Sekunden>, ` +
        "wget: --timeout <Sekunden> oder timeout <Sekunden> wget …, " +
        "fetch: signal: AbortSignal.timeout(<Millisekunden>) " +
        "(Werte siehe jobs.android in .github/workflows/ci.yml).",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Download-Zeitdeckel: ${calls} Aufrufe in ${files.length} Dateien geprueft ` +
      `(${curl} curl, ${wget} wget, ${fetch} fetch), alle gedeckelt ` +
      `(${ROOTS.join(", ")}, Repo-Wurzel).`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
