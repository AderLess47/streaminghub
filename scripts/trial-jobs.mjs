#!/usr/bin/env node
/**
 * Ruft die Trial-Jobs im Server auf (Erinnerung vor Ablauf, Ablaufmarkierung).
 *
 * Die Arbeit passiert in `/api/internal/trial-jobs`; dieses Skript triggert nur
 * und meldet die Zähler. Aus einem Scheduler aufrufen:
 * `APP_URL=… TRIAL_JOB_TOKEN=… npm run trial:jobs`, optional `--dry-run`.
 */
const baseUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const token = process.env.TRIAL_JOB_TOKEN ?? "";
const dryRun = process.argv.includes("--dry-run");

if (!token) {
  console.error("TRIAL_JOB_TOKEN ist nicht gesetzt – nichts zu tun.");
  process.exit(2);
}

const url = `${baseUrl}/api/internal/trial-jobs${dryRun ? "?dryRun=1" : ""}`;

let response;
try {
  response = await fetch(url, {
    method: "POST",
    headers: { "x-trial-job-token": token },
  });
} catch (error) {
  console.error("Trial-Jobs konnten den Server nicht erreichen:", error.message);
  process.exit(1);
}

const body = await response.json().catch(() => null);
if (!response.ok) {
  console.error("Trial-Jobs fehlgeschlagen:", response.status, body?.error?.code ?? "");
  process.exit(1);
}

console.log(JSON.stringify({
  dryRun: body.dryRun ?? dryRun,
  reminders: body.reminders ?? 0,
  expired: body.expired ?? 0,
  skipped: body.skipped ?? 0,
  failed: body.failed ?? 0,
}));
