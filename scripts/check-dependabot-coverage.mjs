#!/usr/bin/env node
/**
 * Prueft, dass .github/dependabot.yml jedes Oekosystem abdeckt, das im Repo
 * tatsaechlich gepflegt wird:
 *
 *   Workflow-Dateien vorhanden  ->  package-ecosystem: "github-actions"
 *   Dockerfile vorhanden        ->  package-ecosystem: "docker"
 *
 * Hintergrund: Der docker-Block ist genau der Grund, warum die per Digest
 * gepinnten Basis-Images nicht einfrieren (siehe #434, #435). Wird er beim
 * Aufraeumen entfernt, bleibt alles gruen - die Images veralten dann still, und
 * auffallen wuerde es erst, wenn ein Sicherheitsupdate fehlt. Dasselbe gilt
 * fuer die Actions: ohne github-actions-Eintrag bleiben die gepinnten SHAs
 * stehen.
 *
 * Geprueft wird nur die Abdeckung, nicht die Form der Eintraege - das erledigt
 * das Schema (dependabot-2.0.json, eigener Schritt im Workflow-Lint).
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

export function inspect(file, text, { required = [] } = {}) {
  const declared = new Set();
  // Meldung an der updates-Liste statt an Zeile 1; ohne updates: bleibt es 1.
  let line = 1;

  for (const [index, row] of text.split("\n").entries()) {
    if (UPDATES_LINE.test(row)) line = index + 1;
    const match = row.match(ECOSYSTEM_LINE);
    if (match) declared.add(match[1]);
  }

  return required
    .filter((ecosystem) => !declared.has(ecosystem))
    .map((ecosystem) => ({
      file,
      line,
      ecosystem,
      snippet: `package-ecosystem: "${ecosystem}" fehlt`,
      hint: `"package-ecosystem: '${ecosystem}'" mit directory und schedule in ${DEPENDABOT_FILE} aufnehmen`,
    }));
}

async function countWorkflows(root) {
  const entries = await readdir(path.join(root, WORKFLOWS_DIR), { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isFile() && EXTENSIONS.has(path.extname(entry.name))).length;
}

// Was das Repo pflegt, muss die Datei abdecken. Kommt eine Quelle dazu (z. B.
// package.json fuer npm), gehoert sie hierher.
async function requiredEcosystems(root) {
  const required = [];
  if ((await countWorkflows(root)) > 0) required.push("github-actions");
  if ((await collectDockerfiles(root)).length > 0) required.push("docker");
  return required;
}

export async function audit({ root = "." } = {}) {
  const file = path.join(root, DEPENDABOT_FILE);
  const required = await requiredEcosystems(root);

  let text;
  try {
    text = await readFile(file, "utf8");
  } catch {
    return {
      file,
      required,
      findings: [{ file, line: 1, ecosystem: null, snippet: `${DEPENDABOT_FILE} fehlt`, hint: "Datei anlegen" }],
    };
  }

  return { file, required, findings: inspect(file, text, { required }) };
}

async function main() {
  const { required, findings } = await audit();

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
      `alle in ${DEPENDABOT_FILE} eingetragen.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
