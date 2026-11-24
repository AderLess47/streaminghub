#!/usr/bin/env node
/**
 * Prueft, dass .github/dependabot.yml jedes Oekosystem abdeckt, das im Repo
 * tatsaechlich gepflegt wird:
 *
 *   Workflow-Dateien vorhanden  ->  package-ecosystem: "github-actions"
 *   Dockerfile vorhanden        ->  package-ecosystem: "docker"
 *   Dockerfile in <verzeichnis> ->  dessen directory/directories deckt es ab
 *
 * Hintergrund: Der docker-Block ist genau der Grund, warum die per Digest
 * gepinnten Basis-Images nicht einfrieren (siehe #434, #435). Wird er beim
 * Aufraeumen entfernt, bleibt alles gruen - die Images veralten dann still, und
 * auffallen wuerde es erst, wenn ein Sicherheitsupdate fehlt. Dasselbe gilt
 * fuer die Actions: ohne github-actions-Eintrag bleiben die gepinnten SHAs
 * stehen.
 *
 * Beim docker-Eintrag reicht "ist vorhanden" nicht: Dependabot sucht das
 * Dockerfile nur im angegebenen Verzeichnis, nicht rekursiv (dependabot-core
 * #1015, #6047). Ein Eintrag mit directory "/" laesst ein spaeter
 * hinzukommendes Dockerfile in einem Unterverzeichnis ungepflegt, ohne dass
 * etwas rot wird. Globbing versteht nur "directories", nicht "directory".
 *
 * Geprueft wird die Abdeckung, nicht die Form der Eintraege - das erledigt das
 * Schema (dependabot-2.0.json, eigener Schritt im Workflow-Lint).
 *
 * Die Faelle selbst deckt scripts/check-dependabot-coverage.test.mjs ab.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectDockerfiles } from "./check-docker-base-images.mjs";

export const DEPENDABOT_FILE = path.join(".github", "dependabot.yml");
const WORKFLOWS_DIR = path.join(".github", "workflows");
const EXTENSIONS = new Set([".yml", ".yaml"]);

// "- package-ecosystem: \"docker\"" und "package-ecosystem: docker".
// Kommentarzeilen koennen nicht treffen, weil sie mit "#" beginnen.
const ECOSYSTEM_LINE = /^\s*(?:-\s+)?package-ecosystem:\s*["']?([A-Za-z0-9_.-]+)["']?\s*(?:#.*)?$/;
const UPDATES_LINE = /^updates:\s*$/;
const DIRECTORY_LINE = /^(\s*)directory:\s*(.+?)\s*$/;
const DIRECTORIES_LINE = /^(\s*)directories:\s*(.*?)\s*$/;
const LIST_ITEM = /^(\s*)-\s+(.+?)\s*$/;

function valueOf(raw) {
  return raw.replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "");
}

// "/", "./app/" und "app" beschreiben dasselbe Verzeichnis.
function normalize(value) {
  const trimmed = valueOf(value).replace(/^\.\//, "/").replace(/\/+$/, "");
  if (trimmed === "" || trimmed === ".") return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

// "directories" erlaubt Globs, "directory" nicht (Dependabot-Doku): dort
// zaehlt das Muster nur, wenn es woertlich passt.
function glob(pattern) {
  const source = pattern
    .split("**")
    .map((part) =>
      [...part]
        .map((char) => (char === "*" ? "[^/]*" : /[.+^${}()|[\]\\]/.test(char) ? `\\${char}` : char))
        .join(""),
    )
    .join(".*");
  return new RegExp(`^${source}$`);
}

// Verzeichnisse je docker-Eintrag, gelesen an der YAML-Einrueckung: die
// Blockliste unter "directories:" endet beim naechsten Schluessel.
function dockerEntries(text) {
  const entries = [];
  let current = null;
  let listIndent = null;

  for (const [index, row] of text.split("\n").entries()) {
    const ecosystem = row.match(ECOSYSTEM_LINE);
    if (ecosystem) {
      current = ecosystem[1] === "docker" ? { line: index + 1, directories: [] } : null;
      if (current) entries.push(current);
      listIndent = null;
      continue;
    }
    if (!current) continue;

    const directory = row.match(DIRECTORY_LINE);
    if (directory) {
      current.directories.push({ value: normalize(directory[2]), wildcard: false });
      listIndent = null;
      continue;
    }

    const directories = row.match(DIRECTORIES_LINE);
    if (directories) {
      listIndent = directories[1].length;
      for (const item of directories[2].match(/"[^"]*"|'[^']*'|[^,[\]\s]+/g) ?? []) {
        current.directories.push({ value: normalize(item), wildcard: true });
      }
      continue;
    }

    const item = row.match(LIST_ITEM);
    if (item && listIndent !== null && item[1].length >= listIndent) {
      current.directories.push({ value: normalize(item[2]), wildcard: true });
      continue;
    }
    if (row.trim() !== "" && !row.trim().startsWith("#")) listIndent = null;
  }

  return entries;
}


function covers(entries, directory) {
  return entries.some((entry) =>
    entry.directories.some((candidate) =>
      candidate.wildcard && candidate.value.includes("*")
        ? glob(candidate.value).test(directory)
        : candidate.value === directory,
    ),
  );
}

export function inspect(file, text, { required = [], directories = [] } = {}) {
  const declared = new Set();
  // Meldung an der updates-Liste statt an Zeile 1; ohne updates: bleibt es 1.
  let line = 1;

  for (const [index, row] of text.split("\n").entries()) {
    if (UPDATES_LINE.test(row)) line = index + 1;
    const match = row.match(ECOSYSTEM_LINE);
    if (match) declared.add(match[1]);
  }

  const findings = required
    .filter((ecosystem) => !declared.has(ecosystem))
    .map((ecosystem) => ({
      file,
      line,
      ecosystem,
      snippet: `package-ecosystem: "${ecosystem}" fehlt`,
      hint: `"package-ecosystem: '${ecosystem}'" mit directory und schedule in ${DEPENDABOT_FILE} aufnehmen`,
    }));

  // Ohne docker-Eintrag meldet schon oben das fehlende Oekosystem; hier geht es
  // nur um Verzeichnisse, die ein vorhandener Eintrag nicht abdeckt.
  const docker = dockerEntries(text);
  const uncovered = docker.length > 0 ? directories.map(normalize).filter((entry) => !covers(docker, entry)) : [];
  for (const directory of uncovered) {
    findings.push({
      file,
      line: docker[0].line,
      ecosystem: "docker",
      snippet: `Dockerfile in "${directory}" wird von keinem docker-Eintrag abgedeckt`,
      hint: `"directory: '${directory}'" ergaenzen - Dependabot sucht nur im angegebenen Verzeichnis, nicht rekursiv`,
    });
  }

  return findings;
}

async function hasWorkflows(root) {
  const entries = await readdir(path.join(root, WORKFLOWS_DIR), { withFileTypes: true }).catch(() => []);
  return entries.some((entry) => entry.isFile() && EXTENSIONS.has(path.extname(entry.name)));
}

function dockerfileDirectories(root, dockerfiles) {
  return [
    ...new Set(
      dockerfiles.map((dockerfile) => {
        const directory = path.posix.dirname(path.relative(root, dockerfile).split(path.sep).join("/"));
        return directory === "." ? "/" : `/${directory}`;
      }),
    ),
  ].sort();
}

export async function audit({ root = "." } = {}) {
  const file = path.join(root, DEPENDABOT_FILE);
  const dockerfiles = await collectDockerfiles(root);
  const directories = dockerfileDirectories(root, dockerfiles);

  const required = [];
  if (await hasWorkflows(root)) required.push("github-actions");
  if (dockerfiles.length > 0) required.push("docker");

  let text;
  try {
    text = await readFile(file, "utf8");
  } catch {
    return {
      file,
      required,
      directories,
      findings: [{ file, line: 1, ecosystem: null, snippet: `${DEPENDABOT_FILE} fehlt`, hint: "Datei anlegen" }],
    };
  }

  return { file, required, directories, findings: inspect(file, text, { required, directories }) };
}

async function main() {
  const { required, directories, findings } = await audit();

  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`::error file=${finding.file},line=${finding.line}::${finding.snippet} -- ${finding.hint}`);
    }
    console.error(
      `${findings.length} Befund(e): .github/dependabot.yml deckt nicht jedes genutzte Oekosystem ab ` +
        `(genutzt: ${required.join(", ")}). Ohne Eintrag veralten die gepinnten Action-SHAs bzw. ` +
        "Image-Digests still.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Dependabot: ${required.length} genutztes Oekosystem(e) (${required.join(", ")}), ` +
      `alle in ${DEPENDABOT_FILE} eingetragen` +
      (directories.length > 0 ? `, docker deckt alle ${directories.length} Dockerfile-Verzeichnis(se) ab` : "") +
      ".",
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
