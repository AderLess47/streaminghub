#!/usr/bin/env node
/**
 * Prueft die Basis-Images der Dockerfiles:
 *
 *   FROM node:22-bookworm-slim@sha256:<64 Hexzeichen> AS deps
 *
 * Ein Tag wie "node:22-bookworm-slim" ist beweglich: unter derselben Kennung
 * kann ein anderes Image ausgeliefert werden, und der naechste Build zieht es
 * ungeprueft. Genau dieselbe Luecke schliessen die Commit-SHAs bei den
 * Actions. Der lesbare Tag bleibt vor dem Digest stehen, damit der Diff die
 * Version zeigt und der Pull den Digest prueft.
 *
 * Zweite Regel: Node-Drift. Der Node-Major des Basis-Images muss zu
 * engines.node in package.json passen. Wird dort angehoben und das Image
 * vergessen, laeuft der Server auf einer Node-Version, die das Projekt nicht
 * mehr unterstuetzt - und umgekehrt.
 *
 * Nicht geprueft wird, ob der Digest wirklich zum Tag gehoert: dafuer waere
 * ein Registry-Zugriff noetig. Ein falsch gepaarter Digest laesst den Build
 * beim Pull scheitern, also faellt es dort sofort auf.
 *
 * Lokale Stage-Verweise (FROM deps), "FROM scratch" und die Digest-Schreibweise
 * selbst sind erlaubt; Variablen im FROM (FROM ${BASE}) gelten als Befund, weil
 * sie ohne Aufloesung nicht pruefbar sind.
 *
 * Die Faelle selbst deckt scripts/check-docker-base-images.test.mjs ab.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = ".";
export const PACKAGE_JSON = "package.json";
export const SKIP_DIRS = new Set([
  ".git",
  ".next",
  ".vercel",
  ".tooling",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);
export const DOCKERFILE_NAME = /^Dockerfile(?:\..+)?$/i;
export const DOCKERFILE_EXTENSION = ".dockerfile";

// FROM [--platform=<platform>] <image> [AS <name>] [# Kommentar]
export const FROM_LINE = /^\s*FROM\s+(?:--platform=\S+\s+)?(\S+?)(?:\s+AS\s+(\S+))?\s*(?:#.*)?$/i;
export const DIGEST = /^sha256:[0-9a-f]{64}$/;

// Mindest-Major aus einer engines-Angabe: ">=22.5.0" -> 22,
// "^20.11.0 || >=22.0.0" -> 20 (die niedrigste zugesagte Version).
export function parseEnginesMajor(spec) {
  if (typeof spec !== "string") return null;
  const majors = spec
    .split("||")
    .map((part) => part.match(/(\d+)(?:\.\d+)*/))
    .filter((match) => match !== null)
    .map((match) => Number(match[1]));
  return majors.length === 0 ? null : Math.min(...majors);
}

// Major aus einem Image-Tag: "22-bookworm-slim" -> 22, "lts-bookworm" -> null.
export function tagMajor(tag) {
  const match = tag.match(/^(\d+)(?:[.-]|$)/);
  return match ? Number(match[1]) : null;
}

function isNodeImage(name) {
  return name === "node" || name.endsWith("/node");
}

export function inspect(file, text, { expectedNodeMajor = null } = {}) {
  const lines = text.split(/\r?\n/);
  const stages = new Set();
  const findings = [];
  const counts = { external: 0, stage: 0, scratch: 0 };

  lines.forEach((raw, index) => {
    const line = raw.replace(/\s+$/, "");
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const match = line.match(FROM_LINE);
    if (!match) return;

    const image = match[1];
    const alias = match[2];
    if (alias) stages.add(alias.toLowerCase());

    const snippet = trimmed.slice(0, 160);
    const report = (reason) => findings.push({ file, line: index + 1, reason, image, snippet });

    if (image.includes("$")) {
      counts.external += 1;
      report("variable");
      return;
    }
    if (image.toLowerCase() === "scratch") {
      counts.scratch += 1;
      return;
    }
    if (stages.has(image.toLowerCase())) {
      counts.stage += 1;
      return;
    }

    counts.external += 1;

    const at = image.lastIndexOf("@");
    const ref = at === -1 ? image : image.slice(0, at);
    const digest = at === -1 ? "" : image.slice(at + 1);
    const colon = ref.lastIndexOf(":");
    const head = colon === -1 ? ref : ref.slice(0, colon);
    const tail = colon === -1 ? "" : ref.slice(colon + 1);
    // "registry:5000/node" hat keinen Tag; der Doppelpunkt gehoert zum Host.
    const hasTag = tail !== "" && !tail.includes("/");
    const name = hasTag ? head : ref;
    const tag = hasTag ? tail : "";

    if (!DIGEST.test(digest)) {
      report("digest");
      return;
    }
    if (!hasTag) {
      report("tag");
      return;
    }
    if (expectedNodeMajor !== null && isNodeImage(name)) {
      const major = tagMajor(tag);
      if (major === null) report("node-tag");
      else if (major !== expectedNodeMajor) report("node-drift");
    }
  });

  return { findings, ...counts };
}

// Wird auch von scripts/check-dependabot-coverage.mjs genutzt, damit "es gibt
// ein Dockerfile" im Repo nur an einer Stelle definiert ist.
export async function collectDockerfiles(directory) {
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
      if (SKIP_DIRS.has(entry.name)) continue;
      found.push(...(await collectDockerfiles(full)));
    } else if (entry.isFile() && (DOCKERFILE_NAME.test(entry.name) || path.extname(entry.name) === DOCKERFILE_EXTENSION)) {
      found.push(full);
    }
  }
  return found;
}

export async function audit({ root = ROOT, expectedNodeMajor } = {}) {
  const files = await collectDockerfiles(root);
  let engines = null;
  let expected = expectedNodeMajor;
  if (expected === undefined) {
    try {
      const pkg = JSON.parse(await readFile(path.join(root, PACKAGE_JSON), "utf8"));
      engines = pkg?.engines?.node ?? null;
      expected = parseEnginesMajor(engines);
    } catch {
      expected = null;
    }
  }

  const result = {
    files,
    external: 0,
    stage: 0,
    scratch: 0,
    findings: [],
    engines,
    expectedNodeMajor: expected ?? null,
  };
  for (const file of files) {
    const inspected = inspect(file, await readFile(file, "utf8"), { expectedNodeMajor: expected ?? null });
    result.external += inspected.external;
    result.stage += inspected.stage;
    result.scratch += inspected.scratch;
    result.findings.push(...inspected.findings);
  }
  return result;
}

// Einzeilig halten: GitHub bricht mehrzeilige ::error::-Meldungen ab.
const HINTS = {
  digest: 'FROM ohne Digest - "image:tag@sha256:<64 Hexzeichen>" schreiben (Digest per "docker buildx imagetools inspect <image>")',
  tag: "FROM nennt nur einen Digest - den lesbaren Tag davor behalten: image:tag@sha256:...",
  variable: "FROM nutzt eine Variable - den vollstaendigen Verweis mit Tag und Digest direkt hinschreiben, sonst ist er nicht pruefbar",
  "node-drift": "Node-Major des Basis-Images passt nicht zu engines.node - Image und engines.node gemeinsam anheben",
  "node-tag": "Node-Basis-Image ohne numerischen Major (z. B. node:lts) - Tag mit Major-Version verwenden, sonst ist die Drift-Pruefung blind",
};

async function main() {
  const { files, external, stage, scratch, findings, engines, expectedNodeMajor } = await audit();

  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`::error file=${finding.file},line=${finding.line}::${finding.snippet} -- ${HINTS[finding.reason]}`);
    }
    console.error(
      `${findings.length} Befund(e) an den Docker-Basis-Images. Jedes externe FROM auf ` +
        '"image:tag@sha256:<64 Hexzeichen>" pinnen und den Node-Major an engines.node in package.json ausrichten; ' +
        "Stage-Verweise (FROM <stage>) und FROM scratch brauchen keinen Digest.",
    );
    process.exitCode = 1;
    return;
  }

  const nodePart =
    expectedNodeMajor === null
      ? "keine Node-Vorgabe in engines.node, Drift-Pruefung uebersprungen"
      : `Node-Major ${expectedNodeMajor} passt zu engines.node (${engines ?? "ohne Angabe"})`;

  console.log(
    `Docker-Basis-Images: ${files.length} Dockerfile(s), ${external} externe FROM-Referenzen ` +
      `(${stage} Stage-Verweise, ${scratch} scratch) geprueft, alle externen per @sha256-Digest gepinnt - ${nodePart}.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
