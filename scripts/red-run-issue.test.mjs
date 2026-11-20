import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  alreadyReported,
  failureBody,
  issueTitle,
  recoveryBody,
  shortSha,
} from "./red-run-issue.mjs";

const commit = "199f96095683434572ccb3ee07ebaae38807f5a8";

test("issue title names the workflow and cannot collide between Deploy and Deploy staging", () => {
  assert.equal(issueTitle("Deploy"), "Roter Lauf: Deploy");
  assert.equal(issueTitle("Deploy staging"), "Roter Lauf: Deploy staging");
  assert.notEqual(issueTitle("Deploy"), issueTitle("Deploy staging"));
});

test("shortSha keeps seven characters and tolerates missing commits", () => {
  assert.equal(shortSha(commit), "199f960");
  assert.equal(shortSha(""), "");
  assert.equal(shortSha(undefined), "");
});

test("failure body names run, commit, branch, trigger and failed jobs", () => {
  const body = failureBody({
    workflowName: "Deploy staging",
    runUrl: "https://github.com/o/r/actions/runs/1",
    commit,
    branch: "main",
    event: "workflow_run",
    conclusion: "failure",
    failedJobs: ["Deploy to Fly staging"],
  });

  assert.match(body, /Der Workflow \*\*Deploy staging\*\* ist fehlgeschlagen\./);
  assert.match(body, /Lauf: https:\/\/github\.com\/o\/r\/actions\/runs\/1/);
  assert.match(body, new RegExp(`Commit: \`${commit}\``));
  assert.match(body, /Branch: `main`/);
  assert.match(body, /Auslöser: `workflow_run`/);
  assert.match(body, /Fehlgeschlagene Jobs:\n- Deploy to Fly staging/);
  assert.match(body, /schließt sich automatisch/);
});

test("failure body marks a timeout and omits an empty job list", () => {
  const body = failureBody({
    workflowName: "Device notice smoke",
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
function runWithGhStub({ mode, issueList = [], comments = "", jobs = [] }) {
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

  execFileSync(process.execPath, ["scripts/red-run-issue.mjs", mode], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      GH_LOG: log,
      GH_STUB_PAYLOADS: JSON.stringify({
        issueList: JSON.stringify(issueList),
        comments,
        jobs: jobs.join("\n"),
      }),
      GH_TOKEN: "stub-token",
      GH_REPO: "o/r",
      RUN_ID: "1",
      WORKFLOW_NAME: "Deploy staging",
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
  return calls;
}

test("a new failure opens exactly one issue with the failing job named", () => {
  const calls = runWithGhStub({ mode: "--failure", jobs: ["Deploy to Fly staging"] });
  const creates = calls.filter((entry) => entry.call === "issue create");

  assert.equal(creates.length, 1);
  assert.equal(creates[0].args[3], "Roter Lauf: Deploy staging");
  assert.match(creates[0].input, new RegExp(`Commit: \`${commit}\``));
  assert.match(creates[0].input, /- Deploy to Fly staging/);
  assert.equal(calls.some((entry) => entry.call === "issue comment"), false);
});

test("a repeated failure for the same commit writes nothing", () => {
  const calls = runWithGhStub({
    mode: "--failure",
    issueList: [{ number: 12, title: "Roter Lauf: Deploy staging" }],
    comments: `- Commit: \`${commit}\`\n`,
    jobs: ["Deploy to Fly staging"],
  });

  assert.equal(calls.some((entry) => entry.call.startsWith("issue create")), false);
  assert.equal(calls.some((entry) => entry.call === "issue comment"), false);
  assert.equal(calls.some((entry) => entry.call === "issue close"), false);
});

test("a new commit comments on the open issue instead of opening another", () => {
  const calls = runWithGhStub({
    mode: "--failure",
    issueList: [{ number: 12, title: "Roter Lauf: Deploy staging" }],
    comments: "- Commit: `deadbeefdeadbeefdeadbeefdeadbeefdeadbeef`\n",
    jobs: ["Deploy to Fly staging"],
  });

  const comments = calls.filter((entry) => entry.call === "issue comment");
  assert.equal(comments.length, 1);
  assert.equal(comments[0].args[2], "12");
  assert.equal(calls.some((entry) => entry.call === "issue create"), false);
});

test("a green run closes the open issue", () => {
  const calls = runWithGhStub({
    mode: "--success",
    issueList: [{ number: 12, title: "Roter Lauf: Deploy staging" }],
  });

  assert.equal(calls.filter((entry) => entry.call === "issue comment").length, 1);
  const closes = calls.filter((entry) => entry.call === "issue close");
  assert.equal(closes.length, 1);
  assert.equal(closes[0].args[2], "12");
});

test("a green run without an open issue writes nothing", () => {
  const calls = runWithGhStub({ mode: "--success" });

  assert.equal(calls.some((entry) => entry.call.startsWith("issue create")), false);
  assert.equal(calls.some((entry) => entry.call === "issue comment"), false);
  assert.equal(calls.some((entry) => entry.call === "issue close"), false);
});

test("recovery body names run, commit and trigger", () => {
  const body = recoveryBody({
    workflowName: "Deploy",
    runUrl: "https://github.com/o/r/actions/runs/2",
    commit,
    event: "workflow_run",
  });

  assert.match(body, /Der Workflow \*\*Deploy\*\* läuft wieder erfolgreich\./);
  assert.match(body, /Läuft wieder erfolgreich|wieder erfolgreich/);
  assert.match(body, new RegExp(`Commit: \`${commit}\``));
  assert.match(body, /Auslöser: `workflow_run`/);
  assert.match(body, /Issue wird geschlossen/);
});
