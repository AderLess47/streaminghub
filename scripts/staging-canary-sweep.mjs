#!/usr/bin/env node
/**
 * Safely removes old Stripe test-mode objects created by staging canaries.
 *
 * Dry-run is the default. It only selects objects whose metadata.canary is the
 * exact canary marker and whose Stripe `created` timestamp is older than the
 * age threshold. It refuses live keys and runs only against test mode.
 *
 *   node scripts/staging-canary-sweep.mjs
 *   node scripts/staging-canary-sweep.mjs --apply
 *   CANARY_SWEEP_APPLY=1 CANARY_SWEEP_AGE_MS=86400000 npm run staging:canary:sweep
 *
 * Required:
 *   STRIPE_SECRET_KEY       sk_test_...
 *
 * Optional:
 *   STRIPE_API_BASE         default https://api.stripe.com
 *   CANARY_SWEEP_AGE_MS     default 24 hours; minimum 1 hour
 *   CANARY_SWEEP_LIMIT      default 100; maximum 100
 *   CANARY_SWEEP_APPLY=1    same as --apply
 */
import { pathToFileURL } from "node:url";

const API_BASE = (process.env.STRIPE_API_BASE ?? "https://api.stripe.com").replace(/\/+$/, "");
const KEY = process.env.STRIPE_SECRET_KEY ?? "";
const MARKER = "staging-billing-canary";
const AGE_MS = Number(process.env.CANARY_SWEEP_AGE_MS ?? 24 * 60 * 60 * 1000);
const LIMIT = Math.min(Math.max(Number(process.env.CANARY_SWEEP_LIMIT ?? 100) || 100, 1), 100);
const APPLY = process.argv.includes("--apply") || process.env.CANARY_SWEEP_APPLY === "1";
const MAX_PAGES = 5;

function fail(message) {
  throw new Error(message);
}

async function stripeRequest(method, route) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  timer.unref?.();
  try {
    const response = await fetch(`${API_BASE}${route}`, {
      method,
      headers: { authorization: `Bearer ${KEY}` },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      fail(`Stripe ${response.status} on ${method} ${route}: ${payload?.error?.message ?? "request failed"}`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function listAll(route) {
  const objects = [];
  let startingAfter = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({ limit: "100" });
    if (startingAfter) params.set("starting_after", startingAfter);
    const separator = route.includes("?") ? "&" : "?";
    const payload = await stripeRequest("GET", `${route}${separator}${params.toString()}`);
    const data = Array.isArray(payload?.data) ? payload.data : [];
    objects.push(...data);
    if (!payload?.has_more || data.length === 0) break;
    startingAfter = data.at(-1)?.id;
    if (!startingAfter) break;
  }
  return objects;
}

function isOldCanary(object, cutoffSeconds) {
  return (
    object?.metadata?.canary === MARKER &&
    Number.isFinite(Number(object.created)) &&
    Number(object.created) < cutoffSeconds
  );
}

async function main() {
  if (!KEY.startsWith("sk_test_")) {
    fail("STRIPE_SECRET_KEY must be a test-mode key (sk_test_...)");
  }
  if (!Number.isFinite(AGE_MS) || AGE_MS < 60 * 60 * 1000) {
    fail("CANARY_SWEEP_AGE_MS must be at least one hour");
  }

  const cutoffSeconds = Math.floor((Date.now() - AGE_MS) / 1000);
  const [subscriptions, customers] = await Promise.all([
    listAll("/v1/subscriptions?status=all"),
    listAll("/v1/customers"),
  ]);

  const oldSubscriptions = subscriptions.filter((object) => isOldCanary(object, cutoffSeconds)).slice(0, LIMIT);
  const oldCustomers = customers.filter((object) => isOldCanary(object, cutoffSeconds)).slice(0, LIMIT);
  const plan = {
    dryRun: !APPLY,
    cutoff: new Date(cutoffSeconds * 1000).toISOString(),
    subscriptions: oldSubscriptions.map((object) => object.id),
    customers: oldCustomers.map((object) => object.id),
  };

  if (!APPLY) {
    console.log(JSON.stringify(plan));
    return;
  }

  const deleted = { subscriptions: [], customers: [] };
  for (const subscription of oldSubscriptions) {
    await stripeRequest("DELETE", `/v1/subscriptions/${encodeURIComponent(subscription.id)}`);
    deleted.subscriptions.push(subscription.id);
  }
  for (const customer of oldCustomers) {
    await stripeRequest("DELETE", `/v1/customers/${encodeURIComponent(customer.id)}`);
    deleted.customers.push(customer.id);
  }
  console.log(JSON.stringify({ ...plan, dryRun: false, deleted }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[staging-canary-sweep] ${error.message}`);
    process.exitCode = 1;
  });
}
