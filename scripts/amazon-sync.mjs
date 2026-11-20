#!/usr/bin/env node
/**
 * Daily pull sync for Amazon IAP subscriptions.
 *
 * The work happens in `/api/internal/amazon-sync` (RVS re-verification, receipt
 * and subscription updates); this script only triggers it and reports counts.
 * Run it from a scheduler: `APP_URL=… AMAZON_SYNC_TOKEN=… npm run amazon:sync`.
 */
const baseUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const token = process.env.AMAZON_SYNC_TOKEN ?? "";

if (!token) {
  console.error("AMAZON_SYNC_TOKEN ist nicht gesetzt – nichts zu tun.");
  process.exit(2);
}

let response;
try {
  response = await fetch(`${baseUrl}/api/internal/amazon-sync`, {
    method: "POST",
    headers: { "x-amazon-sync-token": token },
  });
} catch (error) {
  console.error("Amazon-IAP-Abgleich konnte den Server nicht erreichen:", error.message);
  process.exit(1);
}

const body = await response.json().catch(() => null);
if (!response.ok) {
  console.error("Amazon-IAP-Abgleich fehlgeschlagen:", response.status, body?.error?.code ?? "");
  process.exit(1);
}

console.log(
  JSON.stringify({
    checked: body.checked ?? 0,
    updated: body.updated ?? 0,
    canceled: body.canceled ?? 0,
    failed: body.failed ?? 0,
  }),
);
