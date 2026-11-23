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

export const ROOT = ".";
export const DEPENDABOT_FILE = path.join(".github", "dependabot.yml");
export const WORKFLOWS_DIR = path.join(".github", "workflows");
export const EXTENSIONS = new Set([".yml", ".yaml"]);

// Reihenfolge der Meldungen; der erste Eintrag ist der, den es laenger gibt.
export const REQUIRED_ORDER = ["github-actions", "docker"];

// "- package-ecosystem: \"docker\"" und "package-ecosystem: docker".
export const ECOSYSTEM_LINE = /^\s*(?:-\s+)?package-ecosystem:\s*["']?([A-Za-z0-9_.-]+)["']?\s*(?:#.*)?$/;

export function inspect(file, text, { required = [] } = {}) {
  const declared = new Set();
  let updatesLine = 1;

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.replace(/\s+$/, "");
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    if (/^updates:\s*$/.test(line)) updatesLine = index + 1;
    const match = line.match(ECOSYSTEM_LINE);
    if (match) declared.add(match[1]);
  });

  const findings = [];
  for (const ecosystem of REQUIRED_ORDER) {
    if (!required.includes(ecosystem) || declared.has(ecosystem)) continue;
    findings.push({
      file,
      line: updatesLine,
      reason: "missing",
      ecosystem,
      snippet: `package-ecosystem: "${ecosystem}" fehlt`,
    });
  }

  return { findings, declared: [...declared] };
}

async function countWorkflows(root) {
  const entries = await readdir(path.join(root, WORKFLOWS_DIR), { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isFile() && EXTENSIONS.has(path.extname(entry.name))).length;
}

// Was das Repo tatsaechlich nutzt: Oekosystem -> Begruendung fuer die Ausgabe.
export async function detectEcosystems({ root = ROOT } = {}) {
  const sources = new Map();
  const workflows = await countWorkflows(root);
  if (workflows > 0) sources.set("github-actions", `${workflows} Workflow-Datei(en)`);
  const dockerfiles = await collectDockerfiles(root);
  if (dockerfiles.length > 0) sources.set("docker", `${dockerfiles.length} Dockerfile(s)`);
  return sources;
}

export async function audit({ root = ROOT } = {}) {
  const sources = await detectEcosystems({ root });
  const required = [...sources.keys()];
  const file = path.join(root, DEPENDABOT_FILE);

  let text;
  try {
    text = await readFile(file, "utf8");
  } catch {
    return {
      file,
      sources,
      required,
      findings: [
        {
          file,
          line: 1,
          reason: "file",
          ecosystem: null,
          snippet: `${DEPENDABOT_FILE} fehlt oder ist nicht lesbar`,
        },
      ],
    };
  }

  const inspected = inspect(file, text, { required });
  return { file, sources, required, declared: inspected.declared, findings: inspected.findings };
}

// Einzeilig halten: GitHub bricht mehrzeilige ::error::-Meldungen ab.
const HINTS = {
  missing:
    'Eintrag fehlt in .github/dependabot.yml - "- package-ecosystem: \'<oekosystem>\'" mit directory und schedule aufnehmen',
  file: "Datei fehlt oder ist nicht lesbar - .github/dependabot.yml anlegen bzw. Rechte pruefen",
};

async function main() {
  const { sources, findings } = await audit();

  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`::error file=${finding.file},line=${finding.line}::${finding.snippet} -- ${HINTS[finding.reason]}`);
    }
    console.error(
      `${findings.length} genutztes Oekosystem ohne Dependabot-Eintrag. Jedes Oekosystem, das im Repo ` +
        "gepflegt wird (Workflows, Dockerfile), braucht einen Block in .github/dependabot.yml; sonst " +
        "veralten die gepinnten Action-SHAs bzw. Image-Digests still.",
    );
    process.exitCode = 1;
    return;
  }

  const listed = [...sources].map(([ecosystem, source]) => `${ecosystem} (${source})`).join(", ");
  console.log(
    `Dependabot: ${sources.size} genutztes Oekosystem(e) erkannt (${listed}), alle in ${DEPENDABOT_FILE} eingetragen.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
