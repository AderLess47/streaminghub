/**
 * Headless-Tests für die Store-Refresh-Routen mit echtem Mailversand.
 *
 * Geprüft werden `/api/v1/apple/refresh` und `/api/v1/amazon/refresh` gegen
 * eine echte SQLite-Datei und echte Geräte-Tokens. Amazon RVS ist ein lokaler
 * HTTP-Server, dessen Antwort der Test umschaltet; Apple-Käufe lassen sich ohne
 * von Apple signierten JWS nicht auslösen und werden über
 * `applyVerifiedTransaction` nachgestellt.
 *
 * Aufruf: npm run test:store-api
 */

import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

let rvsMode: "410" | "active" | "expired" = "410";
const expiredAt = Date.now() - 5_000;
const future = Date.now() + 30 * 86_400_000;

const server = createServer((request, response) => {
  const receiptId = decodeURIComponent(request.url?.split("/receiptId/")[1] ?? "unknown");
  if (rvsMode === "410") {
    response.writeHead(410).end();
    return;
  }
  response.writeHead(200, { "content-type": "application/json" });
  response.end(
    JSON.stringify({
      receiptId,
      productId: "premium_monthly",
      productType: "SUBSCRIPTION",
      autoRenewing: rvsMode === "active",
      purchaseDate: Date.now() - 31 * 86_400_000,
      renewalDate: rvsMode === "active" ? future : expiredAt,
    }),
  );
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as AddressInfo;

process.env.AMAZON_RVS_BASE = `http://127.0.0.1:${port}`;
process.env.AMAZON_RVS_SHARED_SECRET = "secret";
process.env.AMAZON_IAP_SKU = "premium_monthly";
process.env.APPLE_IAP_BUNDLE_ID = "org.streaminghub.app";
process.env.APPLE_IAP_PRODUCT_ID = "premium_monthly";
process.env.APP_URL = "https://streaminghub.org";
delete process.env.RESEND_API_KEY;

const { all, nowIso, run } = await import("@/lib/db");
const { signDeviceToken } = await import("@/lib/device-auth");
const { POST: appleRefresh } = await import("@/app/api/v1/apple/refresh/route");
const { POST: amazonRefresh } = await import("@/app/api/v1/amazon/refresh/route");
const { POST: amazonPurchase } = await import("@/app/api/v1/amazon/purchase/route");
const { applyVerifiedTransaction } = await import("@/lib/apple-subscriptions");
const { transactionState } = await import("@/lib/apple-iap");
const { POST: appleNotifications } = await import("@/app/api/v1/apple/notifications/route");
const { buildNotification } = await import("@/lib/__fixtures__/apple/jws.ts");
import type { AppleTransaction } from "@/lib/apple-iap";

const results: { name: string; ok: boolean; detail?: string }[] = [];

async function check(name: string, body: () => Promise<void> | void) {
  try {
    await body();
    results.push({ name, ok: true });
    console.log(`  \u2713 ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail });
    console.log(`  \u2717 ${name}\n      ${detail.split("\n")[0]}`);
  }
}

function resetDb() {
  for (const table of [
    "outbox_emails",
    "subscription_events",
    "iap_receipts",
    "subscriptions",
    "devices",
    "rate_limits",
    "audit_log",
    "users",
  ]) {
    run(`DELETE FROM ${table}`);
  }
}

function seedUser(id: string, locale = "de") {
  const now = nowIso();
  run(
    `INSERT INTO users (id, email, password_hash, display_name, locale, created_at, updated_at)
     VALUES (?, ?, 'x', 'Testkonto', ?, ?, ?)`,
    id,
    `${id}@example.test`,
    locale,
    now,
    now,
  );
  run(
    `INSERT INTO devices (id, user_id, name, platform, status, activated_at, created_at)
     VALUES (?, ?, 'Gerät', 'android', 'active', ?, ?)`,
    `dev-${id}`,
    id,
    now,
    now,
  );
}

function tokenFor(userId: string) {
  return signDeviceToken({
    userId,
    deviceId: `dev-${userId}`,
    exp: Math.floor(Date.now() / 1000) + 3_600,
  });
}

function call(path: string, token: string, body?: unknown): Request {
  return new Request(`https://app.example${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      host: "app.example",
      origin: "https://app.example",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function mailCount() {
  return all<{ c: number }>(`SELECT COUNT(*) AS c FROM outbox_emails`)[0].c;
}

function seedApple(userId: string, renewalDate: string, status = "active") {
  seedUser(userId);
  const at = nowIso();
  run(
    `INSERT INTO subscriptions (id, user_id, plan, status, channel, provider, provider_customer_id,
       provider_subscription_id, current_period_end, cancel_at_period_end, updated_at, created_at)
     VALUES (?, ?, 'premium', ?, 'apple', 'apple', ?, 'premium_monthly', ?, 0, ?, ?)`,
    `sub-${userId}`,
    userId,
    status === "active" ? "active" : "canceled",
    `orig-${userId}`,
    renewalDate,
    at,
    at,
  );
  run(
    `INSERT INTO iap_receipts (id, user_id, provider, receipt_id, app_user_id, product_id, product_type,
       status, auto_renewing, purchase_date, renewal_date, verified_at, created_at)
     VALUES (?, ?, 'apple', ?, ?, 'premium_monthly', 'AUTO_RENEWABLE_SUBSCRIPTION', ?, 1, ?, ?, ?, ?)`,
    `receipt-${userId}`,
    userId,
    `orig-${userId}`,
    userId,
    status,
    new Date(Date.now() - 32 * 86_400_000).toISOString(),
    renewalDate,
    at,
    at,
  );
}

function appleTransaction(userId: string, expiresDate: number): AppleTransaction {
  return {
    transactionId: `tx-${userId}`,
    originalTransactionId: `orig-${userId}`,
    bundleId: "org.streaminghub.app",
    productId: "premium_monthly",
    productType: "Auto-Renewable Subscription",
    environment: "Production",
    purchaseDate: Date.now() - 60_000,
    expiresDate,
    revocationDate: null,
    inAppOwnershipType: "PURCHASED",
    appAccountToken: null,
  };
}

/* ------------------------------ Apple Refresh ----------------------------- */

await check("apple/refresh: laufendes Abo verschickt keine Mail", async () => {
  resetDb();
  seedApple("apple-active", new Date(future).toISOString());

  const response = await appleRefresh(call("/api/v1/apple/refresh", tokenFor("apple-active")));
  assert.equal(response.status, 200);
  const data = (await response.json()) as { subscription: { premiumActive: boolean } };
  assert.equal(data.subscription.premiumActive, true);
  assert.equal(mailCount(), 0);
});

await check("apple/refresh: Ablauf mailt einmal, Wiederholung nicht", async () => {
  resetDb();
  seedApple("apple-expired", new Date(Date.now() - 86_400_000).toISOString());

  const token = tokenFor("apple-expired");
  const first = await appleRefresh(call("/api/v1/apple/refresh", token));
  assert.equal(first.status, 200);
  const firstData = (await first.json()) as { subscription: { premiumActive: boolean } };
  assert.equal(firstData.subscription.premiumActive, false);
  assert.equal(mailCount(), 1);

  await appleRefresh(call("/api/v1/apple/refresh", token));
  assert.equal(mailCount(), 1, "derselbe Ablauf darf nur eine Mail erzeugen");
});

await check("apple/refresh: Wiederkauf mailt nichts, naechster Ablauf wieder", async () => {
  resetDb();
  seedApple("apple-cycle", new Date(Date.now() - 86_400_000).toISOString());
  const token = tokenFor("apple-cycle");

  await appleRefresh(call("/api/v1/apple/refresh", token));
  assert.equal(mailCount(), 1);

  // Wiederkauf: die Route selbst kann ohne Apple-JWS nicht laufen, der Effekt
  // ist derselbe Schreibvorgang wie nach erfolgreicher Prüfung.
  const purchased = appleTransaction("apple-cycle", future);
  applyVerifiedTransaction({
    userId: "apple-cycle",
    transaction: purchased,
    state: transactionState(purchased),
  });
  assert.equal(mailCount(), 1, "der Kauf darf keine Abschlussmail auslösen");

  // Naechster Zeitraum laeuft ab (Zeitpunkt in der Vergangenheit gesetzt).
  const nextEnd = new Date(Date.now() - 3_600_000).toISOString();
  run(`UPDATE iap_receipts SET status = 'active', renewal_date = ?, verified_at = ? WHERE receipt_id = ?`,
    nextEnd, nowIso(), "orig-apple-cycle");
  run(`UPDATE subscriptions SET status = 'active', current_period_end = ? WHERE user_id = ?`,
    nextEnd, "apple-cycle");

  await appleRefresh(call("/api/v1/apple/refresh", token));
  assert.equal(mailCount(), 2, "der zweite Ablauf braucht wieder eine Mail");

  await appleRefresh(call("/api/v1/apple/refresh", token));
  assert.equal(mailCount(), 2, "auch der zweite Ablauf wird dedupliziert");
});

await check("apple/notifications: EXPIRED mailt einmal, Refresh dedupliziert", async () => {
  resetDb();
  const expiredEnd = Date.now() - 3_600_000;
  seedApple("apple-note", new Date(expiredEnd).toISOString());
  const token = tokenFor("apple-note");

  const signedPayload = buildNotification({
    notificationType: "EXPIRED",
    transaction: {
      originalTransactionId: "orig-apple-note",
      expiresDate: expiredEnd,
    },
  });

  const response = await appleNotifications(
    call("/api/v1/apple/notifications", token, { signedPayload }),
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { handled: boolean; status?: string };
  assert.equal(body.handled, true);
  assert.equal(mailCount(), 1);

  // Der Pull-Refresh stellt denselben Ablauf fest und darf nicht erneut mailen.
  const refreshed = await appleRefresh(call("/api/v1/apple/refresh", token));
  assert.equal(refreshed.status, 200);
  assert.equal(mailCount(), 1, "Notification und Refresh teilen sich die Markierung");

  // Dieselbe Transaktion als zweite Meldung (neue UUID): weiterhin eine Mail.
  const duplicate = buildNotification({
    notificationType: "EXPIRED",
    transaction: {
      originalTransactionId: "orig-apple-note",
      expiresDate: expiredEnd,
    },
  });
  await appleNotifications(call("/api/v1/apple/notifications", token, { signedPayload: duplicate }));
  assert.equal(mailCount(), 1);
});

/* ----------------------------- Amazon Refresh ----------------------------- */

function seedAmazon(userId: string, renewalDate: string) {
  seedUser(userId);
  const at = nowIso();
  run(
    `INSERT INTO subscriptions (id, user_id, plan, status, channel, provider, provider_customer_id,
       provider_subscription_id, current_period_end, cancel_at_period_end, updated_at, created_at)
     VALUES (?, ?, 'premium', 'canceled', 'amazon', 'amazon', ?, 'premium_monthly', ?, 0, ?, ?)`,
    `sub-${userId}`,
    userId,
    `amz-${userId}`,
    renewalDate,
    at,
    at,
  );
  run(
    `INSERT INTO iap_receipts (id, user_id, provider, receipt_id, app_user_id, product_id, product_type,
       status, auto_renewing, purchase_date, renewal_date, verified_at, created_at)
     VALUES (?, ?, 'amazon', ?, ?, 'premium_monthly', 'SUBSCRIPTION', 'canceled', 0, ?, ?, ?, ?)`,
    `receipt-${userId}`,
    userId,
    `amz_receipt_${userId}`,
    `amz-${userId}`,
    new Date(Date.now() - 32 * 86_400_000).toISOString(),
    renewalDate,
    at,
    at,
  );
}

await check("amazon/refresh: 410 mailt einmal, Wiederholung nicht", async () => {
  resetDb();
  seedAmazon("amz-expired", new Date(Date.now() - 86_400_000).toISOString());
  rvsMode = "410";
  const token = tokenFor("amz-expired");

  const first = await amazonRefresh(call("/api/v1/amazon/refresh", token));
  assert.equal(first.status, 200);
  assert.equal(mailCount(), 1);

  await amazonRefresh(call("/api/v1/amazon/refresh", token));
  assert.equal(mailCount(), 1);
});

await check("amazon/refresh: Wiederkauf mailt nichts, naechster Ablauf wieder", async () => {
  resetDb();
  seedAmazon("amz-cycle", new Date(Date.now() - 86_400_000).toISOString());
  const token = tokenFor("amz-cycle");

  rvsMode = "410";
  await amazonRefresh(call("/api/v1/amazon/refresh", token));
  assert.equal(mailCount(), 1);

  rvsMode = "active";
  const purchase = await amazonPurchase(
    call("/api/v1/amazon/purchase", token, {
      receiptId: "amz_receipt_amz-cycle",
      appUserId: "amz-amz-cycle",
      productId: "premium_monthly",
    }),
  );
  assert.equal(purchase.status, 200);
  const purchased = (await purchase.json()) as { subscription: { premiumActive: boolean } };
  assert.equal(purchased.subscription.premiumActive, true);
  assert.equal(mailCount(), 1, "der Wiederkauf darf keine Abschlussmail auslösen");

  rvsMode = "expired";
  await amazonRefresh(call("/api/v1/amazon/refresh", token));
  assert.equal(mailCount(), 2, "der zweite Ablauf braucht wieder eine Mail");

  await amazonRefresh(call("/api/v1/amazon/refresh", token));
  assert.equal(mailCount(), 2, "derselbe Ablauf wird dedupliziert");
});

/* -------------------------------- Ergebnis -------------------------------- */

await new Promise<void>((resolve) => server.close(() => resolve()));

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
if (failed.length > 0) {
  process.exitCode = 1;
}
