#!/usr/bin/env node
/**
 * Renders the staging-canary database sweep preflight plan into a GitHub step
 * summary. The workflow feeds it the dry-run JSON emitted by the deployed
 * database sweeper. It refuses to render anything unless dryRun is true.
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";

function code(value) {
  return `\`${String(value).replaceAll("`", "\\`")}\``;
}

export function renderDatabaseSweepSummary(plan) {
  if (!plan || plan.dryRun !== true) {
    throw new Error("database sweep preflight did not report dryRun=true");
  }
  if (!Array.isArray(plan.users) || !plan.counts || typeof plan.counts !== "object") {
    throw new Error("database sweep preflight response is missing users or counts");
  }

  const lines = [
    "### Canary-Datenbank-Sweep (Vorprüfung)",
    "",
    "- Modus: Testlauf (keine Löschungen)",
    `- Stichtag: ${code(plan.cutoff)}`,
    `- Kandidaten: **${plan.users.length}**`,
  ];
  if (plan.users.length) {
    lines.push(`- Benutzer-IDs: ${plan.users.map((user) => code(user.id)).join(", ")}`);
    lines.push(`- E-Mail-Adressen: ${plan.users.map((user) => code(user.email)).join(", ")}`);
  }
  for (const [name, count] of Object.entries(plan.counts)) {
    lines.push(`- ${name}: **${count}**`);
  }

  return {
    markdown: `${lines.join("\n")}\n`,
    warning: plan.users.length
      ? `::warning::${plan.users.length} old canary database account(s) found; dry run only, nothing deleted.`
      : null,
  };
}

export function writeDatabaseSweepSummary(plan, summaryPath = process.env.GITHUB_STEP_SUMMARY) {
  if (!summaryPath) throw new Error("GITHUB_STEP_SUMMARY is required");
  const rendered = renderDatabaseSweepSummary(plan);
  fs.appendFileSync(summaryPath, rendered.markdown);
  if (rendered.warning) console.log(rendered.warning);
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error("usage: node scripts/staging-canary-db-preflight-summary.mjs <plan.json>");
  const plan = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  writeDatabaseSweepSummary(plan);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`[staging-canary-db-preflight-summary] ${error.message}`);
    process.exitCode = 1;
  }
}
