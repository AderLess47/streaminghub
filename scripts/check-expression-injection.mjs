#!/usr/bin/env node
/**
 * Prueft, dass in keinem run:-Block ein ${{ ... }}-Ausdruck steht.
 *
 * GitHub ersetzt den Ausdruck, bevor die Shell das Skript sieht. Steht er im
 * Shell-Text, wird sein Inhalt zu Shell-Code: ein PR-Titel, ein Branch-Name
 * oder ein Issue-Text mit " oder $(...) bricht aus jedem Quoting aus und fuehrt
 * Befehle aus - im Job, der Secrets und Deploy-Rechte hat. Quoting hilft dabei
 * nicht, weil die Ersetzung vor dem Quoting passiert.
 *
 * Sicher ist der Umweg ueber die Umgebung: den Wert in env: setzen (dort ist
 * der Ausdruck Daten, kein Code) und im Skript nur "$VAR" verwenden.
 *
 *   env:
 *     TITLE: ${{ github.event.pull_request.title }}
 *   run: echo "Titel: $TITLE"
 *
 * Geprueft werden alle run:-Bloecke in .github/workflows, auch die eingerueckte
 * Fortsetzung von | und >. Ausgenommen sind reine Kommentarzeilen (die Shell
 * ignoriert sie) und der Schluessel run unter outputs: - das ist ein Job-Output,
 * kein Schritt. if: und with: sind nicht Teil dieser Regel.
 *
 * Die Faelle selbst deckt scripts/check-expression-injection.test.mjs ab.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WORKFLOWS_DIR = path.join(".github", "workflows");
export const EXTENSIONS = new Set([".yml", ".yaml"]);

// "run: |" (Block), "- run: >-" (gefaltet) und "run: node x.mjs" (einzeilig).
export const RUN_LINE = /^(\s*)(-\s+)?run:\s*(.*)$/;
export const BLOCK_SCALAR = /^[|>]/;
export const EXPRESSION = /\$\{\{[^}]*\}\}/g;

function collect(file, line, text, findings) {
  const trimmed = text.trim();
  // Eine reine Kommentarzeile erreicht die Shell nie.
  if (trimmed.startsWith("#")) return;
  for (const match of text.matchAll(EXPRESSION)) {
    findings.push({ file, line, expression: match[0], snippet: trimmed.slice(0, 160) });
  }
}

export function inspect(file, text) {
  const lines = text.split(/\r?\n/);
  const findings = [];
  const stack = [];
  let blocks = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index].replace(/\s+$/, "");
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const indent = raw.length - raw.trimStart().length;

    const run = raw.match(RUN_LINE);
    if (run) {
      const keyIndent = indent + (run[2] ? run[2].length : 0);
      // "outputs:" / "  run: ..." ist ein Job-Output, kein Schritt.
      const parent = [...stack].reverse().find((entry) => entry.indent < keyIndent);
      if (parent && parent.key === "outputs") continue;

      blocks += 1;
      const rest = run[3].trim();
      if (!BLOCK_SCALAR.test(rest)) {
        collect(file, index + 1, raw, findings);
        continue;
      }

      let next = index + 1;
      for (; next < lines.length; next += 1) {
        const body = lines[next];
        if (body.trim() === "") continue;
        const bodyIndent = body.length - body.trimStart().length;
        if (bodyIndent <= keyIndent) break;
        collect(file, next + 1, body, findings);
      }
      index = next - 1;
      continue;
    }

    const key = raw.match(/^(\s*)(-\s+)?([A-Za-z0-9_.-]+):/);
    if (!key) continue;
    const entryIndent = key[1].length + (key[2] ? key[2].length : 0);
    while (stack.length > 0 && stack[stack.length - 1].indent >= entryIndent) stack.pop();
    stack.push({ indent: entryIndent, key: key[3] });
  }

  return { findings, blocks };
}

async function collectWorkflows(directory) {
  const found = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await collectWorkflows(full)));
    else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) found.push(full);
  }
  return found;
}

export async function audit({ directory = WORKFLOWS_DIR } = {}) {
  const files = await collectWorkflows(directory);
  const result = { files, blocks: 0, findings: [] };
  for (const file of files) {
    const inspected = inspect(file, await readFile(file, "utf8"));
    result.blocks += inspected.blocks;
    result.findings.push(...inspected.findings);
  }
  return result;
}

async function main() {
  const { files, blocks, findings } = await audit();

  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(
        `::error file=${finding.file},line=${finding.line}::${finding.snippet} -- ` +
          `${finding.expression} steht als Shell-Text im run:-Block und wird vor dem Quoting ersetzt`,
      );
    }
    console.error(
      `${findings.length} GitHub-Ausdruck/Ausdruecke im Shell-Text von run:-Bloecken. Den Wert in env: ` +
        'setzen und im Skript nur "$VAR" verwenden: GitHub ersetzt den Ausdruck vor der Shell, sonst ' +
        "wird sein Inhalt zu Shell-Code (Injection ueber PR-Titel, Branch-Namen, Issue-Texte).",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Ausdruecke in run-Bloecken: ${files.length} Workflow-Dateien mit ${blocks} run-Bloecken geprueft, ` +
      `keine GitHub-Ausdruecke im Shell-Text (${WORKFLOWS_DIR}).`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
