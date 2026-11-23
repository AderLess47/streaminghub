#!/usr/bin/env node
/**
 * Prueft, dass jede "uses:"-Zeile in .github/workflows eine unveraenderliche
 * Action-Version adressiert:
 *
 *   uses: owner/action@<40-stelliger Commit-SHA> # v5
 *
 * Ein beweglicher Tag (v5, main, latest) haette zur Folge, dass ein
 * verschobener oder kompromittierter Tag ungeprueft in Jobs laeuft, die
 * Deploy- und Zugangs-Secrets sehen. Der Kommentar dahinter haelt die Version
 * im Diff lesbar und ist genau die Schreibweise, die Dependabot mitpflegt
 * (SHA und Kommentar gemeinsam, siehe .github/dependabot.yml).
 *
 * Lokale Aktionen (uses: ./...) brauchen keinen Pin, weil sie aus demselben
 * Commit kommen. docker://-Referenzen brauchen einen Digest
 * (@sha256:<64 Hexzeichen>) statt eines Tags, sonst gilt dieselbe Regel.
 *
 * Geprueft wird nur, ob die Zeile die Form erfuellt. Ob die Action existiert
 * und ob der SHA zu einer sinnvollen Version gehoert, kann diese Pruefung ohne
 * Netzzugriff nicht sagen; das faengt der Lauf selbst (Checkout laedt die
 * Action) und Dependabot beim Aktualisieren. Zeilen, die wie Fliesstext
 * aussehen (kein "owner/repo"), gelten als Text in einem run:-Block und werden
 * nicht gemeldet; Syntaxfehler dort meldet actionlint.
 *
 * Die Faelle selbst deckt scripts/check-action-pins.test.mjs ab.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WORKFLOWS_DIR = path.join(".github", "workflows");
export const EXTENSIONS = new Set([".yml", ".yaml"]);
export const THIS_FILE = path.join("scripts", "check-action-pins.mjs");
export const TEST_FILE = path.join("scripts", "check-action-pins.test.mjs");

// "- uses: ..." (Schritt) und "uses: ..." (z. B. in einem reusable-workflow-
// Aufruf) sind beide gemeint. Fliesstext in einem run:-Block, der zufaellig mit
// "uses:" beginnt, hat kein "owner/repo" und faellt unten heraus.
export const USES_LINE = /^\s*(?:-\s+)?uses:\s*(.+?)\s*$/;
export const SHA_PIN = /^[0-9a-f]{40}$/;
export const SHORT_SHA = /^[0-9a-f]{7,39}$/;
// Release-Tag als Kommentar: "v5", "v7.0.2", auch "v1.2.3-rc.1".
export const VERSION_COMMENT = /^#\s*v\d+(?:\.\d+)*(?:[-+][0-9A-Za-z.-]+)?$/;
export const DOCKER_DIGEST = /^sha256:[0-9a-f]{64}$/;
const ACTION_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+$/;

function referenceKind(target) {
  if (target.startsWith("./")) return "local";
  if (target.startsWith("docker://")) return "docker";
  return "remote";
}

// Eine Zeile -> Befund oder null. count meldet, ob die Zeile eine echte
// Referenz war (fuer die Zusammenfassung).
function inspectLine(file, line, raw) {
  const text = raw.trim();
  if (!text || text.startsWith("#")) return { finding: null, kind: null };
  const match = text.match(USES_LINE);
  if (!match) return { finding: null, kind: null };

  const tokens = match[1].trim().split(/\s+/);
  const target = tokens[0];
  const comment = tokens.slice(1).join(" ");
  const kind = referenceKind(target);
  const snippet = text.replace(/\s+/g, " ").slice(0, 160);

  if (kind === "local") return { finding: null, kind };

  if (kind === "docker") {
    const at = target.lastIndexOf("@");
    const digest = at === -1 ? "" : target.slice(at + 1);
    if (!DOCKER_DIGEST.test(digest)) {
      return {
        kind,
        finding: { file, line, reason: "digest", snippet },
      };
    }
    if (!VERSION_COMMENT.test(comment)) {
      return { kind, finding: { file, line, reason: "comment", snippet } };
    }
    return { finding: null, kind };
  }

  const at = target.lastIndexOf("@");
  if (at === -1) {
    // "uses: owner/action" ohne Ref ist ein Pin-Fehler, alles andere Text.
    if (!ACTION_NAME.test(target)) return { finding: null, kind: null };
    return { kind, finding: { file, line, reason: "pin", snippet } };
  }
  const name = target.slice(0, at);
  const ref = target.slice(at + 1);
  if (!ACTION_NAME.test(name)) return { finding: null, kind: null };

  if (!SHA_PIN.test(ref)) {
    return {
      kind,
      finding: { file, line, reason: SHORT_SHA.test(ref) ? "short" : "tag", snippet },
    };
  }
  if (!VERSION_COMMENT.test(comment)) {
    return { kind, finding: { file, line, reason: "comment", snippet } };
  }
  return { finding: null, kind };
}

export function inspect(file, text) {
  const findings = [];
  const counted = { remote: 0, local: 0, docker: 0 };
  text.split("\n").forEach((raw, index) => {
    const { finding, kind } = inspectLine(file, index + 1, raw);
    if (kind) counted[kind] += 1;
    if (finding) findings.push(finding);
  });
  return { references: counted.remote + counted.local + counted.docker, ...counted, findings };
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
  const result = { references: 0, remote: 0, local: 0, docker: 0, findings: [], files };
  for (const file of files) {
    const inspected = inspect(file, await readFile(file, "utf8"));
    result.references += inspected.references;
    result.remote += inspected.remote;
    result.local += inspected.local;
    result.docker += inspected.docker;
    result.findings.push(...inspected.findings);
  }
  return result;
}

const HINTS = {
  pin: "uses: owner/action@<40-stelliger Commit-SHA> # <Release-Tag>",
  tag: "Tag statt Commit-SHA: SHA des Release-Tags eintragen, Tag als Kommentar behalten",
  short: "SHA ist zu kurz: volle 40 Hexzeichen verwenden",
  comment: 'Versionskommentar fehlt: "# v5" (Release-Tag) hinter den SHA schreiben',
  digest: "docker:// braucht einen Digest: @sha256:<64 Hexzeichen> # <Tag>",
};

async function main() {
  const { references, remote, local, docker, findings, files } = await audit();

  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`::error file=${finding.file},line=${finding.line}::${finding.snippet} -- ${HINTS[finding.reason]}`);
    }
    console.error(
      `${findings.length} "uses:"-Zeile(n) ohne unveraenderliche Version. Jede Action auf den ` +
        "Commit-SHA des Release-Tags pinnen und den Tag als Kommentar behalten " +
        '("uses: owner/action@<sha> # v5"); Dependabot aktualisiert SHA und Kommentar gemeinsam. ' +
        "Lokale Aktionen (./...) brauchen keinen Pin, docker:// einen Digest.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Action-Pins: ${references} uses-Referenzen in ${files.length} Dateien geprueft ` +
      `(${remote} remote, ${docker} docker, ${local} lokal), alle per Commit-SHA gepinnt ` +
      `(${WORKFLOWS_DIR}).`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
