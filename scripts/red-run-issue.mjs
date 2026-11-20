#!/usr/bin/env node
/**
 * Meldet einen roten Deploy- oder Smoke-Lauf als Issue und schließt es wieder,
 * sobald derselbe Workflow grün ist.
 *
 * Damit steht ein Fehlschlag nicht nur im Actions-Tab: `Deploy`,
 * `Deploy staging` und `Device notice smoke` bekommen je ein Issue
 * „Roter Lauf: <Workflow>“. Ein zweiter roter Lauf für denselben Commit
 * kommentiert nicht doppelt, und der nächste grüne Lauf schließt das Issue.
 *
 * Aufruf (aus dem Workflow):
 *   node scripts/red-run-issue.mjs --failure
 *   node scripts/red-run-issue.mjs --success
 *
 * Erwartete Umgebung: GH_TOKEN, GH_REPO, RUN_ID, WORKFLOW_NAME, COMMIT,
 * RUN_URL, BRANCH, EVENT, CONCLUSION.
 *
 * Die Formatierung ist bewusst eine reine Funktion, damit sie ohne GitHub
 * testbar bleibt (siehe scripts/red-run-issue.test.mjs).
 */
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const TITLE_PREFIX = "Roter Lauf: ";

export function issueTitle(workflowName) {
  return `${TITLE_PREFIX}${workflowName}`;
}

export function shortSha(commit) {
  return typeof commit === "string" ? commit.slice(0, 7) : "";
}

/** Ein Commit gilt als gemeldet, sobald ein Kommentar ihn im Klartext nennt. */
export function alreadyReported(comments, commit) {
  if (!commit) return false;
  const marker = `Commit: \`${commit}\``;
  const shortMarker = shortSha(commit) ? `Commit: \`${shortSha(commit)}\`` : null;
  return comments.some((body) => body.includes(marker) || (shortMarker ? body.includes(shortMarker) : false));
}

export function failureBody({ workflowName, runUrl, commit, branch, event, conclusion, failedJobs = [] }) {
  const headline =
    conclusion === "timed_out"
      ? `Der Workflow **${workflowName}** hat die Zeitüberschreitung erreicht.`
      : `Der Workflow **${workflowName}** ist fehlgeschlagen.`;
  const lines = [
    headline,
    "",
    `- Lauf: ${runUrl}`,
    `- Commit: \`${commit}\``,
    `- Branch: \`${branch || "-"}\``,
    `- Auslöser: \`${event || "-"}\``,
  ];

  if (failedJobs.length > 0) {
    lines.push("", "Fehlgeschlagene Jobs:");
    for (const job of failedJobs) lines.push(`- ${job}`);
  }

  lines.push(
    "",
    "Der Lauf nennt die fehlgeschlagenen Schritte; Produktions- und Staging-Daten sind davon nicht betroffen, solange der Rollout selbst nicht gemeldet wurde.",
    "",
    "Dieses Issue schließt sich automatisch, sobald derselbe Workflow wieder erfolgreich ist. Ein weiterer roter Lauf für denselben Commit kommentiert hier nicht doppelt.",
  );

  return lines.join("\n");
}

export function recoveryBody({ workflowName, runUrl, commit, event }) {
  return [
    `Der Workflow **${workflowName}** läuft wieder erfolgreich.`,
    "",
    `- Lauf: ${runUrl}`,
    `- Commit: \`${commit}\``,
    `- Auslöser: \`${event || "-"}\``,
    "",
    "Damit ist der vorherige Fehlschlag erledigt; das Issue wird geschlossen.",
  ].join("\n");
}

function gh(args, input) {
  return execFileSync("gh", args, { encoding: "utf8", input, env: process.env });
}

function findOpenIssue(title) {
  const output = gh([
    "issue",
    "list",
    "--state",
    "open",
    "--search",
    `"${title}" in:title`,
    "--json",
    "number,title",
    "--limit",
    "100",
  ]);
  const issues = JSON.parse(output);
  const match = issues.find((entry) => entry.title === title);
  return match ? match.number : null;
}

function commentsOf(number) {
  const output = gh(["issue", "view", String(number), "--json", "comments", "--jq", ".comments[].body"]);
  return output.split("\n").filter((line) => line.trim() !== "");
}

function failedJobsOf(repo, runId) {
  const output = gh([
    "api",
    `repos/${repo}/actions/runs/${runId}/jobs`,
    "--jq",
    '[.jobs[] | select(.conclusion == "failure") | .name] | .[]',
  ]);
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function summarize(line) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  try {
    appendFileSync(file, `${line}\n`);
  } catch {
    // Eine fehlende Summary darf die Meldung nicht verhindern.
  }
}

async function main() {
  const mode = process.argv.includes("--success") ? "success" : process.argv.includes("--failure") ? "failure" : "";
  if (!mode) {
    console.error("usage: node scripts/red-run-issue.mjs --failure|--success");
    process.exit(2);
  }

  const workflowName = (process.env.WORKFLOW_NAME ?? "").trim();
  const repo = (process.env.GH_REPO ?? "").trim();
  const commit = (process.env.COMMIT ?? "").trim();
  const runUrl = (process.env.RUN_URL ?? "").trim();
  if (!workflowName || !repo) {
    console.error("WORKFLOW_NAME und GH_REPO werden benötigt.");
    process.exit(2);
  }

  const title = issueTitle(workflowName);
  const existing = findOpenIssue(title);

  if (mode === "success") {
    if (!existing) {
      console.log(`Kein offenes Issue „${title}“; nichts zu schließen.`);
      return;
    }
    const body = recoveryBody({
      workflowName,
      runUrl,
      commit,
      event: process.env.EVENT ?? "",
    });
    gh(["issue", "comment", String(existing), "--body", "-"], body);
    gh(["issue", "close", String(existing), "--reason", "completed"]);
    console.log(`Issue #${existing} geschlossen (${workflowName}, ${shortSha(commit)}).`);
    summarize(`- Issue: #${existing} geschlossen`);
    return;
  }

  const failedJobs = failedJobsOf(repo, process.env.RUN_ID ?? "");
  const body = failureBody({
    workflowName,
    runUrl,
    commit,
    branch: process.env.BRANCH ?? "",
    event: process.env.EVENT ?? "",
    conclusion: process.env.CONCLUSION ?? "failure",
    failedJobs,
  });

  if (existing) {
    if (alreadyReported(commentsOf(existing), commit)) {
      console.log(`Commit ${shortSha(commit)} ist auf Issue #${existing} bereits gemeldet; nichts zu tun.`);
      summarize(`- Issue: #${existing} bereits gemeldet`);
      return;
    }
    gh(["issue", "comment", String(existing), "--body", "-"], body);
    console.log(`Issue #${existing} kommentiert (${workflowName}, ${shortSha(commit)}).`);
    summarize(`- Issue: #${existing} kommentiert`);
    return;
  }

  const created = gh(["issue", "create", "--title", title, "--body", "-"], body).trim();
  console.log(`Issue geöffnet: ${created}`);
  summarize(`- Issue: ${created}`);
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((error) => {
    console.error(`Meldung abgebrochen: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
