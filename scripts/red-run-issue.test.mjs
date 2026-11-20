import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  alreadyReported,
  discordContent,
  discordPayload,
  discordSummary,
  failureBody,
  isDiscordWebhook,
  issueTitle,
  postDiscord,
  recoveryBody,
  shortSha,
} from "./red-run-issue.mjs";

const commit = "199f96095683434572ccb3ee07ebaae38807f5a8";

test("issue title names the workflow and cannot collide between Produktions-Deploy and Staging-Deploy", () => {
  assert.equal(issueTitle("Produktions-Deploy"), "Roter Lauf: Produktions-Deploy");
  assert.equal(issueTitle("Staging-Deploy"), "Roter Lauf: Staging-Deploy");
  assert.notEqual(issueTitle("Produktions-Deploy"), issueTitle("Staging-Deploy"));
});

test("shortSha keeps seven characters and tolerates missing commits", () => {
  assert.equal(shortSha(commit), "199f960");
  assert.equal(shortSha(""), "");
  assert.equal(shortSha(undefined), "");
});

test("failure body names run, commit, branch, trigger and failed jobs", () => {
  const body = failureBody({
    workflowName: "Staging-Deploy",
    runUrl: "https://github.com/o/r/actions/runs/1",
    commit,
    branch: "main",
    event: "workflow_run",
    conclusion: "failure",
    failedJobs: ["Deploy to Fly staging"],
  });

  assert.match(body, /Der Workflow \*\*Staging-Deploy\*\* ist fehlgeschlagen\./);
  assert.match(body, /Lauf: https:\/\/github\.com\/o\/r\/actions\/runs\/1/);
  assert.match(body, new RegExp(`Commit: \`${commit}\``));
  assert.match(body, /Branch: `main`/);
  assert.match(body, /Auslöser: `workflow_run`/);
  assert.match(body, /Fehlgeschlagene Jobs:\n- Deploy to Fly staging/);
  assert.match(body, /schließt sich automatisch/);
});

test("failure body marks a timeout and omits an empty job list", () => {
  const body = failureBody({
    workflowName: "Geräte-Vorwarnung im Konto",
    runUrl: "https://example.invalid/run",
    commit,
    branch: "main",
    event: "workflow_run",
    conclusion: "timed_out",
    failedJobs: [],
  });

  assert.match(body, /Zeitüberschreitung/);
  assert.doesNotMatch(body, /Fehlgeschlagene Jobs/);
});

test("a commit counts as reported only when a comment names it", () => {
  assert.equal(alreadyReported([], commit), false);
  assert.equal(alreadyReported(["Commit: `deadbeefdeadbeefdeadbeefdeadbeefdeadbeef`"], commit), false);
  assert.equal(alreadyReported([`- Commit: \`${commit}\``], commit), true);
  assert.equal(alreadyReported(["- Commit: `199f960`"], commit), true);
  assert.equal(alreadyReported([`- Commit: \`${commit}\``], ""), false);
});

/**
 * Startet das Skript mit einem `gh`-Stub davor im PATH. Der Stub protokolliert
 * jeden Aufruf samt stdin und antwortet aus vorgegebenen Werten – so bleibt der
 * Melde-Pfad testbar, ohne ein echtes Issue anzulegen.
 */
function runWithGhStub({ mode, issueList = [], comments = "", jobs = [], extraEnv = {} }) {
  const dir = mkdtempSync(path.join(tmpdir(), "red-run-issue-"));
  const log = path.join(dir, "gh.jsonl");
  const shim = path.join(dir, "gh");
  writeFileSync(
    shim,
    `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const input = fs.readFileSync(0, "utf8");
fs.appendFileSync(process.env.GH_LOG, JSON.stringify({ args, input }) + "\\n");
const payloads = JSON.parse(process.env.GH_STUB_PAYLOADS);
const call = "" + args[0] + " " + args[1];
if (call === "issue list") process.stdout.write(payloads.issueList);
else if (call === "issue view") process.stdout.write(payloads.comments);
else if (args[0] === "api") process.stdout.write(payloads.jobs);
else if (call === "issue create") process.stdout.write("https://github.com/o/r/issues/9\\n");
`,
  );
  chmodSync(shim, 0o755);

  const summaryPath = path.join(dir, "summary.md");
  const result = spawnSync(process.execPath, ["scripts/red-run-issue.mjs", mode], {
    encoding: "utf8",
    env: {
      ...process.env,
      ...extraEnv,
      PATH: `${dir}:${process.env.PATH}`,
      // Nach process.env setzen: in CI ist GITHUB_STEP_SUMMARY schon belegt.
      GITHUB_STEP_SUMMARY: summaryPath,
      GH_LOG: log,
      GH_STUB_PAYLOADS: JSON.stringify({
        issueList: JSON.stringify(issueList),
        comments,
        jobs: jobs.join("\n"),
      }),
      GH_TOKEN: "stub-token",
      GH_REPO: "o/r",
      RUN_ID: "1",
      WORKFLOW_NAME: "Staging-Deploy",
      COMMIT: commit,
      RUN_URL: "https://github.com/o/r/actions/runs/1",
      BRANCH: "main",
      EVENT: "workflow_run",
      CONCLUSION: "failure",
    },
  });

  const calls = readFileSync(log, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .map((entry) => ({ call: `${entry.args[0]} ${entry.args[1]}`, args: entry.args, input: entry.input }));
  return {
    calls,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
    summary: existsSync(summaryPath) ? readFileSync(summaryPath, "utf8") : "",
  };
}

test("a new failure opens exactly one issue with the failing job named", () => {
  const { calls } = runWithGhStub({ mode: "--failure", jobs: ["Deploy to Fly staging"] });
  const creates = calls.filter((entry) => entry.call === "issue create");

  assert.equal(creates.length, 1);
  assert.equal(creates[0].args[3], "Roter Lauf: Staging-Deploy");
  assert.match(creates[0].input, new RegExp(`Commit: \`${commit}\``));
  assert.match(creates[0].input, /- Deploy to Fly staging/);
  assert.equal(calls.some((entry) => entry.call === "issue comment"), false);
});

test("a repeated failure for the same commit writes nothing", () => {
  const { calls } = runWithGhStub({
    mode: "--failure",
    issueList: [{ number: 12, title: "Roter Lauf: Staging-Deploy" }],
    comments: `- Commit: \`${commit}\`\n`,
    jobs: ["Deploy to Fly staging"],
  });

  assert.equal(calls.some((entry) => entry.call.startsWith("issue create")), false);
  assert.equal(calls.some((entry) => entry.call === "issue comment"), false);
  assert.equal(calls.some((entry) => entry.call === "issue close"), false);
});

test("a new commit comments on the open issue instead of opening another", () => {
  const { calls } = runWithGhStub({
    mode: "--failure",
    issueList: [{ number: 12, title: "Roter Lauf: Staging-Deploy" }],
    comments: "- Commit: `deadbeefdeadbeefdeadbeefdeadbeefdeadbeef`\n",
    jobs: ["Deploy to Fly staging"],
  });

  const comments = calls.filter((entry) => entry.call === "issue comment");
  assert.equal(comments.length, 1);
  assert.equal(comments[0].args[2], "12");
  assert.equal(calls.some((entry) => entry.call === "issue create"), false);
});

test("a green run closes the open issue", () => {
  const { calls } = runWithGhStub({
    mode: "--success",
    issueList: [{ number: 12, title: "Roter Lauf: Staging-Deploy" }],
  });

  assert.equal(calls.filter((entry) => entry.call === "issue comment").length, 1);
  const closes = calls.filter((entry) => entry.call === "issue close");
  assert.equal(closes.length, 1);
  assert.equal(closes[0].args[2], "12");
});

test("a green run without an open issue writes nothing", () => {
  const { calls } = runWithGhStub({ mode: "--success" });

  assert.equal(calls.some((entry) => entry.call.startsWith("issue create")), false);
  assert.equal(calls.some((entry) => entry.call === "issue comment"), false);
  assert.equal(calls.some((entry) => entry.call === "issue close"), false);
});

test("discord content names workflow, result, commit, run and issue", () => {
  const fields = {
    workflowName: "Staging-Deploy",
    conclusion: "failure",
    commit,
    runUrl: "https://github.com/o/r/actions/runs/1",
    issueUrl: "https://github.com/o/r/issues/12",
  };
  const content = discordContent(fields);

  assert.match(content, /Roter Lauf: Staging-Deploy/);
  assert.match(content, /Ergebnis: `failure`/);
  assert.match(content, new RegExp(`Commit: \`${commit}\``));
  assert.match(content, /Lauf: https:\/\/github\.com\/o\/r\/actions\/runs\/1/);
  assert.match(content, /Issue: https:\/\/github\.com\/o\/r\/issues\/12/);

  const payload = discordPayload(fields);
  assert.equal(payload.content, content);
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
});

test("only Discord webhook URLs are accepted", () => {
  assert.equal(isDiscordWebhook("https://discord.com/api/webhooks/123/abc"), true);
  assert.equal(isDiscordWebhook("https://discordapp.com/api/webhooks/123/abc"), true);
  assert.equal(isDiscordWebhook("https://example.com/api/webhooks/123/abc"), false);
  assert.equal(isDiscordWebhook(""), false);
});

test("postDiscord sends the payload as JSON without mentions", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    return { ok: true, status: 204 };
  };
  const payload = discordPayload({
    workflowName: "Produktions-Deploy",
    conclusion: "failure",
    commit,
    runUrl: "https://github.com/o/r/actions/runs/3",
  });

  const result = await postDiscord(payload, {
    webhookUrl: "https://discord.com/api/webhooks/1/x",
    fetchImpl,
  });

  assert.deepEqual(result, { sent: true, status: 204 });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].init.method, "POST");
  assert.deepEqual(JSON.parse(seen[0].init.body), payload);
});

test("postDiscord reports a rejected webhook and an invalid URL", async () => {
  const fetchImpl = async () => ({ ok: false, status: 429 });
  await assert.rejects(
    () => postDiscord({ content: "x" }, { webhookUrl: "https://discord.com/api/webhooks/1/x", fetchImpl }),
    /HTTP 429/,
  );
  await assert.rejects(
    () => postDiscord({ content: "x" }, { webhookUrl: "https://example.com/hook", fetchImpl }),
    /Discord-Channel-Webhook-URL/,
  );
});

test("postDiscord skips with a warning when no webhook is configured", async () => {
  const warnings = [];
  const original = console.warn;
  console.warn = (message) => warnings.push(message);
  try {
    const result = await postDiscord({ content: "x" }, { webhookUrl: "", fetchImpl: async () => ({ ok: true, status: 204 }) });
    assert.deepEqual(result, { sent: false, reason: "unconfigured" });
  } finally {
    console.warn = original;
  }
  assert.match(warnings.join("\n"), /::warning::DISCORD_WEBHOOK_URL ist nicht gesetzt/);
});

test("the run summary says whether Discord was reached", () => {
  assert.equal(discordSummary({ sent: true, status: 204 }), "- Discord: Nachricht gesendet (HTTP 204)");
  assert.match(discordSummary({ sent: false, reason: "unconfigured" }), /Secret `DISCORD_WEBHOOK_URL` fehlt/);
  assert.equal(discordSummary({ sent: false, reason: "irgendwas" }), "- Discord: nicht gesendet (irgendwas)");
});

test("a red run without a Discord secret still creates the issue and only warns", () => {
  const { calls, stderr, status, summary } = runWithGhStub({ mode: "--failure", jobs: ["Deploy to Fly staging"] });

  assert.equal(status, 0);
  assert.equal(calls.some((entry) => entry.call === "issue create"), true);
  assert.match(stderr, /::warning::DISCORD_WEBHOOK_URL ist nicht gesetzt/);
  assert.match(summary, /### Roter Lauf: Staging-Deploy/);
  assert.match(summary, /- Discord: nicht gesendet – Repository-Secret `DISCORD_WEBHOOK_URL` fehlt/);
});

test("a red run with a non-Discord URL keeps the issue but fails loudly", () => {
  const { calls, stderr, status, summary } = runWithGhStub({
    mode: "--failure",
    jobs: ["Deploy to Fly staging"],
    extraEnv: { DISCORD_WEBHOOK_URL: "https://example.com/hook" },
  });

  // Das Issue entsteht vor der Discord-Meldung und darf nicht verloren gehen.
  assert.equal(calls.some((entry) => entry.call === "issue create"), true);
  assert.equal(status, 1);
  assert.match(stderr, /Discord-Channel-Webhook-URL/);
  assert.match(summary, /- Discord: Senden fehlgeschlagen – DISCORD_WEBHOOK_URL muss eine Discord-Channel-Webhook-URL sein\./);
});

test("a closed green run reports the recovery in the run summary", () => {
  const { summary } = runWithGhStub({
    mode: "--success",
    issueList: [{ number: 9, title: "Roter Lauf: Staging-Deploy" }],
    comments: "Commit: `abc1234`",
  });

  assert.match(summary, /### Grüner Lauf: Staging-Deploy/);
  assert.match(summary, /- Issue: #9 geschlossen/);
  assert.doesNotMatch(summary, /Discord/);
});

test("recovery body names run, commit and trigger", () => {
  const body = recoveryBody({
    workflowName: "Produktions-Deploy",
    runUrl: "https://github.com/o/r/actions/runs/2",
    commit,
    event: "workflow_run",
  });

  assert.match(body, /Der Workflow \*\*Produktions-Deploy\*\* läuft wieder erfolgreich\./);
  assert.match(body, /Läuft wieder erfolgreich|wieder erfolgreich/);
  assert.match(body, new RegExp(`Commit: \`${commit}\``));
  assert.match(body, /Auslöser: `workflow_run`/);
  assert.match(body, /Issue wird geschlossen/);
});
