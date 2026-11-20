import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  renderDatabaseSweepSummary,
  writeDatabaseSweepSummary,
} from "./staging-canary-db-preflight-summary.mjs";

const basePlan = {
  ok: true,
  dryRun: true,
  cutoff: "2026-11-16T02:21:12.305Z",
  users: [],
  counts: {
    users: 0,
    outboxEmails: 0,
    subscriptions: 0,
    legalAcceptances: 0,
    authTokens: 0,
    sessions: 0,
    subscriptionEvents: 0,
    auditLog: 0,
  },
};

test("database preflight summary renders candidates and counts", () => {
  const plan = {
    ...basePlan,
    users: [
      { id: "canary-old", email: "canary@resend.dev", created_at: "2026-11-15T00:00:00.000Z" },
    ],
    counts: { ...basePlan.counts, users: 1, outboxEmails: 2, subscriptions: 1 },
  };

  const rendered = renderDatabaseSweepSummary(plan);

  assert.match(rendered.markdown, /### Canary-Datenbank-Sweep \(Vorprüfung\)/);
  assert.match(rendered.markdown, /Modus: Testlauf \(keine Löschungen\)/);
  assert.match(rendered.markdown, /Kandidaten: \*\*1\*\*/);
  assert.match(rendered.markdown, /Benutzer-IDs: `canary-old`/);
  assert.match(rendered.markdown, /E-Mail-Adressen: `canary@resend\.dev`/);
  assert.match(rendered.markdown, /outboxEmails: \*\*2\*\*/);
  assert.match(rendered.markdown, /subscriptions: \*\*1\*\*/);
  assert.equal(
    rendered.warning,
    "::warning::1 old canary database account(s) found; dry run only, nothing deleted.",
  );
});

test("database preflight summary renders an empty candidate set without a warning", () => {
  const rendered = renderDatabaseSweepSummary(basePlan);

  assert.match(rendered.markdown, /Kandidaten: \*\*0\*\*/);
  assert.doesNotMatch(rendered.markdown, /Benutzer-IDs:/);
  assert.doesNotMatch(rendered.markdown, /E-Mail-Adressen:/);
  assert.match(rendered.markdown, /auditLog: \*\*0\*\*/);
  assert.equal(rendered.warning, null);
});

test("database preflight summary refuses a non-dry-run plan", () => {
  assert.throws(
    () => renderDatabaseSweepSummary({ ...basePlan, dryRun: false }),
    /did not report dryRun=true/,
  );
});

test("database preflight summary writes to GITHUB_STEP_SUMMARY", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "streaminghub-db-preflight-summary-"));
  const summaryPath = path.join(dir, "summary.md");

  try {
    writeDatabaseSweepSummary(basePlan, summaryPath);
    assert.match(readFileSync(summaryPath, "utf8"), /Kandidaten: \*\*0\*\*/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
