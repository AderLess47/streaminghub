#!/usr/bin/env node
/**
 * Prueft .github/dependabot.yml gegen die dokumentierten Dependabot-v2-Optionen.
 *
 * Hintergrund: actionlint deckt nur Workflows ab. Eine fehlerhafte Bot-Config
 * wird von GitHub beim Lauf still verworfen, Dependabot öffnet dann einfach
 * keine PRs mehr - ohne dass irgendwo ein Job rot wird. Dieser Schritt macht
 * daraus einen sichtbaren CI-Fehler.
 *
 * Ohne Abhaengigkeiten: der YAML-Parser deckt die Teilmenge ab, die eine
 * Dependabot-Konfiguration braucht (Block-Mappings, Block- und Flow-Sequenzen,
 * einfache und doppelte Anfuehrungszeichen, Kommentare). Alles andere
 * (Anker, Tags, Block-Skalare, Flow-Mappings) wird gemeldet statt geraten.
 *
 * Aufruf: node scripts/check-dependabot-config.mjs [datei]
 */
import fs from "node:fs";
import path from "node:path";

const file = process.argv[2] ?? path.join(".github", "dependabot.yml");

class ConfigError extends Error {}

const fail = (line, message) => {
  throw new ConfigError(line ? `Zeile ${line}: ${message}` : message);
};

/** Entfernt einen Kommentar ausserhalb von Anfuehrungszeichen. */
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

function tokenize(text) {
  const tokens = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const withoutComment = stripComment(raw);
    const body = withoutComment.replace(/\s+$/, "");
    if (body.trim() === "") return;
    const indent = body.length - body.trimStart().length;
    if (body.slice(0, indent).includes("\t")) fail(line, "Tabulator in der Einrueckung");
    if (body.trimStart().startsWith("\t")) fail(line, "Tabulator in der Einrueckung");
    tokens.push({ indent, text: body.trim(), line });
  });
  return tokens;
}

const KEY_PATTERN = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[A-Za-z0-9_./-]+):(?:\s+(.*))?$/;

function splitKey(text) {
  const match = KEY_PATTERN.exec(text);
  if (!match) return null;
  let key = match[1];
  if (key.startsWith('"')) key = key.slice(1, -1).replace(/\\(.)/g, "$1");
  else if (key.startsWith("'")) key = key.slice(1, -1).replace(/''/g, "'");
  return { key, rest: (match[2] ?? "").trim() };
}

const UNSUPPORTED = [
  [/^[&*]/, "YAML-Anker und -Aliase"],
  [/^!/, "YAML-Tags"],
  [/^[|>]/, "Block-Skalare (| oder >)"],
  [/^\{/, "Flow-Mappings ({...})"],
];

function parseScalar(raw, token) {
  for (const [pattern, name] of UNSUPPORTED) {
    if (pattern.test(raw)) fail(token.line, `${name} werden hier nicht unterstuetzt`);
  }
  if (raw.startsWith("[")) {
    if (!raw.endsWith("]")) fail(token.line, "Flow-Sequenz ohne schliessende Klammer");
    const inner = raw.slice(1, -1).trim();
    if (inner === "") return [];
    if (/[[\]{}]/.test(inner)) fail(token.line, "verschachtelte Flow-Sequenzen werden nicht unterstuetzt");
    return inner.split(",").map((part) => parseScalar(part.trim(), token));
  }
  if (raw.startsWith('"') || raw.startsWith("'")) {
    const quote = raw[0];
    if (!raw.endsWith(quote) || raw.length < 2) fail(token.line, "Anfuehrungszeichen nicht geschlossen");
    const inner = raw.slice(1, -1);
    return quote === '"' ? inner.replace(/\\(.)/g, "$1") : inner.replace(/''/g, "'");
  }
  if (/^-?\d+$/.test(raw)) return Number(raw);
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null" || raw === "~") return null;
  return raw;
}

function parseMapping(tokens, start, indent) {
  const value = {};
  let index = start;
  while (index < tokens.length && tokens[index].indent === indent) {
    const token = tokens[index];
    if (token.text === "-" || token.text.startsWith("- ")) {
      fail(token.line, "Sequenz-Eintrag innerhalb eines Mappings ohne Schluessel");
    }
    const entry = splitKey(token.text);
    if (!entry) fail(token.line, `erwartet "schluessel: wert", gefunden: ${token.text}`);
    if (Object.hasOwn(value, entry.key)) fail(token.line, `Schluessel "${entry.key}" steht doppelt`);
    index += 1;
    if (entry.rest === "") {
      if (index < tokens.length && tokens[index].indent > indent) {
        const nested = parseNode(tokens, index, tokens[index].indent);
        value[entry.key] = nested.value;
        index = nested.next;
      } else {
        value[entry.key] = null;
      }
    } else {
      value[entry.key] = parseScalar(entry.rest, token);
      if (index < tokens.length && tokens[index].indent > indent) {
        fail(tokens[index].line, `unerwartete Einrueckung nach "${entry.key}"`);
      }
    }
  }
  if (index < tokens.length && tokens[index].indent > indent) {
    fail(tokens[index].line, "unerwartete Einrueckung");
  }
  return { value, next: index };
}

function parseSequence(tokens, start, indent) {
  const value = [];
  let index = start;
  while (
    index < tokens.length &&
    tokens[index].indent === indent &&
    (tokens[index].text === "-" || tokens[index].text.startsWith("- "))
  ) {
    const token = tokens[index];
    const rest = token.text === "-" ? "" : token.text.slice(2).trim();
    index += 1;
    if (rest === "") {
      if (index < tokens.length && tokens[index].indent > indent) {
        const nested = parseNode(tokens, index, tokens[index].indent);
        value.push(nested.value);
        index = nested.next;
      } else {
        value.push(null);
      }
      continue;
    }
    if (splitKey(rest)) {
      // "- schluessel: wert" beginnt ein Mapping auf der naechsten Ebene.
      tokens.splice(index, 0, { indent: indent + 2, text: rest, line: token.line });
      const nested = parseMapping(tokens, index, indent + 2);
      value.push(nested.value);
      index = nested.next;
      continue;
    }
    value.push(parseScalar(rest, token));
    if (index < tokens.length && tokens[index].indent > indent) {
      fail(tokens[index].line, "unerwartete Einrueckung nach einem Sequenz-Eintrag");
    }
  }
  return { value, next: index };
}

function parseNode(tokens, start, indent) {
  const token = tokens[start];
  return token.text === "-" || token.text.startsWith("- ")
    ? parseSequence(tokens, start, indent)
    : parseMapping(tokens, start, indent);
}

function parseYaml(text) {
  const tokens = tokenize(text);
  if (tokens.length === 0) fail(0, "Datei ist leer");
  const parsed = parseNode(tokens, 0, tokens[0].indent);
  if (parsed.next !== tokens.length) fail(tokens[parsed.next].line, "unerwarteter Inhalt");
  return parsed.value;
}

const ECOSYSTEMS = new Set([
  "bun", "bundler", "cargo", "composer", "conda", "devcontainers", "docker", "docker-compose",
  "dotnet-sdk", "elm", "gitsubmodule", "github-actions", "gomod", "gradle", "helm", "hex",
  "maven", "mix", "npm", "nuget", "pip", "pub", "swift", "terraform", "uv", "vcpkg", "yarn",
]);

const TOP_LEVEL = new Set(["version", "updates", "registries", "enable-beta-ecosystems"]);
const UPDATE_KEYS = new Set([
  "package-ecosystem", "directory", "directories", "schedule", "allow", "assignees",
  "commit-message", "groups", "ignore", "insecure-external-code-execution", "labels",
  "milestone", "open-pull-requests-limit", "pull-request-branch-name", "rebase-strategy",
  "registries", "reviewers", "target-branch", "vendor", "versioning-strategy", "cooldown",
  "exclude-paths", "multi-ecosystem-group",
]);
const SCHEDULE_KEYS = new Set(["interval", "day", "time", "timezone", "cronjob"]);
const INTERVALS = new Set(["daily", "weekly", "monthly", "quarterly", "semiannually", "yearly", "cron"]);
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const COMMIT_MESSAGE_KEYS = new Set(["prefix", "prefix-development", "include"]);
const GROUP_KEYS = new Set([
  "patterns", "exclude-patterns", "dependency-type", "applies-to", "update-types",
  "group-by", "group-name",
]);
const GROUP_UPDATE_TYPES = new Set(["major", "minor", "patch"]);
const APPLIES_TO = new Set(["version-updates", "security-updates"]);
const VERSIONING_STRATEGIES = new Set([
  "auto", "increase", "increase-if-necessary", "lockfile-only", "widen",
]);
const REBASE_STRATEGIES = new Set(["auto", "disabled"]);
const DEPENDENCY_TYPES = new Set(["direct", "indirect", "production", "development"]);

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const sortedKeys = (object) => Object.keys(object).sort().join(", ");

function validateUpdate(update, prefix, problems) {
  if (!isPlainObject(update)) {
    problems.push(`${prefix}: Eintrag muss ein Mapping sein`);
    return;
  }
  for (const key of Object.keys(update)) {
    if (!UPDATE_KEYS.has(key)) problems.push(`${prefix}.${key}: kein dokumentierter Schluessel (${sortedKeys(update)})`);
  }

  const ecosystem = update["package-ecosystem"];
  if (typeof ecosystem !== "string" || ecosystem === "") {
    problems.push(`${prefix}.package-ecosystem: fehlt`);
  } else if (!ECOSYSTEMS.has(ecosystem)) {
    problems.push(`${prefix}.package-ecosystem: "${ecosystem}" ist kein bekannter Wert (github-actions, npm, pip, ...)`);
  }

  const hasDirectory = update.directory !== undefined;
  const hasDirectories = update.directories !== undefined;
  if (hasDirectory === hasDirectories) {
    problems.push(`${prefix}: genau eines von "directory" oder "directories" angeben`);
  }
  if (hasDirectory && (typeof update.directory !== "string" || !update.directory.startsWith("/"))) {
    problems.push(`${prefix}.directory: muss mit "/" beginnen`);
  }
  if (hasDirectories) {
    const list = update.directories;
    if (!Array.isArray(list) || list.length === 0) problems.push(`${prefix}.directories: nicht leere Liste erwartet`);
    else list.forEach((entry, index) => {
      if (typeof entry !== "string" || !entry.startsWith("/")) {
        problems.push(`${prefix}.directories[${index}]: muss mit "/" beginnen`);
      }
    });
  }

  const schedule = update.schedule;
  if (!isPlainObject(schedule)) {
    problems.push(`${prefix}.schedule: fehlt oder ist kein Mapping`);
  } else {
    for (const key of Object.keys(schedule)) {
      if (!SCHEDULE_KEYS.has(key)) problems.push(`${prefix}.schedule.${key}: kein dokumentierter Schluessel`);
    }
    const { interval, day, time, timezone: zone, cronjob } = schedule;
    if (cronjob !== undefined) {
      if (typeof cronjob !== "string" || cronjob.trim() === "") problems.push(`${prefix}.schedule.cronjob: muss ein Cron-Ausdruck sein`);
      if (interval !== undefined) problems.push(`${prefix}.schedule: "interval" und "cronjob" schliessen sich aus`);
    } else if (typeof interval !== "string" || !INTERVALS.has(interval)) {
      problems.push(`${prefix}.schedule.interval: fehlt oder nicht in ${[...INTERVALS].join("|")}`);
    }
    if (day !== undefined) {
      const allowed = new Set([...WEEKDAYS, ...MONTHS]);
      if (typeof day !== "string" || !allowed.has(day)) {
        problems.push(`${prefix}.schedule.day: "${day}" ist kein Wochentag oder Monat in Kleinschreibung`);
      }
    }
    if (time !== undefined && (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
      problems.push(`${prefix}.schedule.time: "HH:MM" erwartet, gefunden "${time}"`);
    }
    if (zone !== undefined) {
      if (typeof zone !== "string" || zone === "") problems.push(`${prefix}.schedule.timezone: Wert erwartet`);
      else {
        if (time === undefined) problems.push(`${prefix}.schedule: "timezone" verlangt "time"`);
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: zone });
        } catch {
          problems.push(`${prefix}.schedule.timezone: "${zone}" ist keine bekannte IANA-Zeitzone`);
        }
      }
    }
  }

  if (update["open-pull-requests-limit"] !== undefined) {
    const limit = update["open-pull-requests-limit"];
    if (!Number.isInteger(limit) || limit < 0 || limit > 500) {
      problems.push(`${prefix}.open-pull-requests-limit: Ganzzahl 0-500 erwartet`);
    }
  }

  if (update["commit-message"] !== undefined) {
    const message = update["commit-message"];
    if (!isPlainObject(message)) problems.push(`${prefix}.commit-message: Mapping erwartet`);
    else {
      for (const key of Object.keys(message)) {
        if (!COMMIT_MESSAGE_KEYS.has(key)) problems.push(`${prefix}.commit-message.${key}: kein dokumentierter Schluessel`);
      }
      for (const key of ["prefix", "prefix-development"]) {
        const value = message[key];
        if (value !== undefined && (typeof value !== "string" || !/^[A-Za-z0-9-]+$/.test(value))) {
          problems.push(`${prefix}.commit-message.${key}: nur Buchstaben, Ziffern und "-" erlaubt`);
        }
      }
      if (message.include !== undefined && message.include !== "scope") {
        problems.push(`${prefix}.commit-message.include: nur "scope" ist erlaubt`);
      }
    }
  }

  if (update.groups !== undefined) {
    if (!isPlainObject(update.groups)) problems.push(`${prefix}.groups: Mapping erwartet`);
    else {
      for (const [name, group] of Object.entries(update.groups)) {
        const where = `${prefix}.groups.${name}`;
        if (!isPlainObject(group)) {
          problems.push(`${where}: Mapping erwartet`);
          continue;
        }
        for (const key of Object.keys(group)) {
          if (!GROUP_KEYS.has(key)) problems.push(`${where}.${key}: kein dokumentierter Schluessel`);
        }
        // patterns ist optional: ohne Angabe matcht die Gruppe alle Abhaengigkeiten
        // (dependabot-core: "If no patterns are defined, we pass this check by default").
        for (const key of ["patterns", "exclude-patterns"]) {
          const list = group[key];
          if (list === undefined) continue;
          if (!Array.isArray(list) || list.length === 0 || list.some((entry) => typeof entry !== "string" || entry === "")) {
            problems.push(`${where}.${key}: nicht leere Liste von Mustern erwartet`);
          }
        }
        if (group["applies-to"] !== undefined && !APPLIES_TO.has(group["applies-to"])) {
          problems.push(`${where}.applies-to: "version-updates" oder "security-updates" erwartet`);
        }
        if (group["update-types"] !== undefined) {
          if (!Array.isArray(group["update-types"])) problems.push(`${where}.update-types: Liste erwartet`);
          else group["update-types"].forEach((type) => {
            if (!GROUP_UPDATE_TYPES.has(type)) problems.push(`${where}.update-types: "${type}" ist nicht major, minor oder patch`);
          });
        }
      }
    }
  }

  for (const key of ["labels", "assignees", "reviewers"]) {
    const value = update[key];
    if (value === undefined) continue;
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry === "")) {
      problems.push(`${prefix}.${key}: Liste nicht leerer Strings erwartet`);
    }
  }

  if (update["versioning-strategy"] !== undefined && !VERSIONING_STRATEGIES.has(update["versioning-strategy"])) {
    problems.push(`${prefix}.versioning-strategy: unbekannter Wert "${update["versioning-strategy"]}"`);
  }
  if (update["rebase-strategy"] !== undefined && !REBASE_STRATEGIES.has(update["rebase-strategy"])) {
    problems.push(`${prefix}.rebase-strategy: "auto" oder "disabled" erwartet`);
  }
  for (const key of ["allow", "ignore"]) {
    const entries = update[key];
    if (entries === undefined) continue;
    if (!Array.isArray(entries)) {
      problems.push(`${prefix}.${key}: Liste erwartet`);
      continue;
    }
    entries.forEach((entry, index) => {
      const where = `${prefix}.${key}[${index}]`;
      if (!isPlainObject(entry)) {
        problems.push(`${where}: Mapping erwartet`);
        return;
      }
      if (entry["dependency-type"] !== undefined && !DEPENDENCY_TYPES.has(entry["dependency-type"])) {
        problems.push(`${where}.dependency-type: unbekannter Wert "${entry["dependency-type"]}"`);
      }
      if (entry["update-types"] !== undefined) {
        if (!Array.isArray(entry["update-types"])) {
          problems.push(`${where}.update-types: Liste erwartet`);
        } else entry["update-types"].forEach((type) => {
          if (!/^version-update:semver-(major|minor|patch)$/.test(type)) {
            problems.push(`${where}.update-types: "${type}" ist kein version-update:semver-*`);
          }
        });
      }
    });
  }
}

function validate(config) {
  const problems = [];
  if (!isPlainObject(config)) {
    return ["Wurzel: Mapping erwartet (version: 2, updates: [...])"];
  }
  for (const key of Object.keys(config)) {
    if (!TOP_LEVEL.has(key)) problems.push(`${key}: kein dokumentierter Schluessel auf oberster Ebene`);
  }
  if (config.version !== 2) problems.push(`version: 2 erwartet, gefunden ${JSON.stringify(config.version ?? null)}`);
  if (!Array.isArray(config.updates) || config.updates.length === 0) {
    problems.push("updates: nicht leere Liste erwartet");
    return problems;
  }

  const seen = new Map();
  config.updates.forEach((update, index) => {
    validateUpdate(update, `updates[${index}]`, problems);
    if (!isPlainObject(update)) return;
    const directories = update.directories ?? [update.directory];
    for (const directory of directories) {
      const key = `${update["package-ecosystem"] ?? "?"}|${directory ?? "?"}`;
      if (seen.has(key)) {
        problems.push(`updates[${index}]: ${update["package-ecosystem"]} auf "${directory}" steht schon in updates[${seen.get(key)}]`);
      } else {
        seen.set(key, index);
      }
    }
  });
  return problems;
}

function main() {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    console.error(`FEHLER: ${file} nicht lesbar`);
    process.exit(1);
  }

  let config;
  try {
    config = parseYaml(text);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(`FEHLER: ${file}: ${error.message}`);
    process.exit(1);
  }

  const problems = validate(config);
  if (problems.length > 0) {
    console.error(`FEHLER: ${file}: ${problems.length} Befund(e)`);
    for (const problem of problems) console.error(`  ${problem}`);
    console.error("Dependabot verwirft eine solche Datei still; GitHub ignoriert sie komplett.");
    process.exit(1);
  }

  const ecosystems = [...new Set(config.updates.map((update) => update["package-ecosystem"]))];
  const directories = [...new Set(config.updates.flatMap((update) => update.directories ?? [update.directory]))];
  console.log(
    `OK: ${file} gueltig (${ecosystems.join(", ")} auf ${directories.join(", ")}, ${config.updates.length} Eintrag/Eintraege).`,
  );
}

main();
