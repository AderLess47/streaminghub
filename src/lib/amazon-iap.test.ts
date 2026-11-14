import assert from "node:assert/strict";
import test from "node:test";
import {
  AMAZON_ERROR_MESSAGES,
  buildVerifyUrl,
  decideReceiptApplication,
  isReplayable,
  isReplayableReceipt,
  parseRvsResponse,
  receiptState,
  verifyReceipt,
  type AmazonReceipt,
} from "./amazon-iap.ts";

const DAY = 86_400_000;
const now = Date.now();
const RECEIPT_ID = "wE1EG1gsEZI9q9UnI5YoZ2OxeoVKPdR5bvPMqyKQq5Y=:1:11";
const SKU = "premium_monthly";

function receipt(overrides: Partial<AmazonReceipt> = {}): AmazonReceipt {
  return {
    receiptId: RECEIPT_ID,
    productId: SKU,
    termSku: "premium_monthly.term.1month",
    productType: "SUBSCRIPTION",
    autoRenewing: true,
    purchaseDate: now - 5 * DAY,
    renewalDate: now + 25 * DAY,
    cancelDate: null,
    gracePeriodEndDate: null,
    freeTrialEndDate: null,
    testTransaction: false,
    betaProduct: false,
    ...overrides,
  };
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    receiptId: RECEIPT_ID,
    productId: SKU,
    termSku: "premium_monthly.term.1month",
    productType: "SUBSCRIPTION",
    autoRenewing: true,
    purchaseDate: now - 5 * DAY,
    renewalDate: now + 25 * DAY,
    cancelDate: null,
    gracePeriodEndDate: null,
    freeTrialEndDate: null,
    testTransaction: false,
    betaProduct: false,
    ...overrides,
  };
}

const production = { sandbox: false, expectedProductId: SKU };
const sandbox = { sandbox: true, expectedProductId: SKU };

test("a valid monthly receipt activates premium until the renewal date", () => {
  const parsed = parseRvsResponse(200, body(), production);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const state = receiptState(parsed.receipt, now);
  assert.equal(state.status, "active");
  assert.equal(state.premiumActive, true);
  assert.equal(state.cancelAtPeriodEnd, false);
  assert.equal(state.currentPeriodEnd, new Date(now + 25 * DAY).toISOString());
});

test("an unknown receipt is rejected", () => {
  const parsed = parseRvsResponse(400, { error: "not found" }, production);
  assert.deepEqual(parsed, { ok: false, code: "invalid_receipt" });
});

test("a receipt Amazon no longer honours ends premium", () => {
  assert.deepEqual(parseRvsResponse(410, null, production), { ok: false, code: "canceled" });
});

test("a wrong shared secret or user id is a configuration error, not a user error", () => {
  assert.deepEqual(parseRvsResponse(496, null, production), { ok: false, code: "misconfigured" });
  assert.deepEqual(parseRvsResponse(497, null, production), { ok: false, code: "misconfigured" });
  assert.deepEqual(parseRvsResponse(500, null, production), { ok: false, code: "provider_error" });
});

test("test purchases never grant premium in production", () => {
  assert.deepEqual(parseRvsResponse(200, body({ testTransaction: true }), production), {
    ok: false,
    code: "test_receipt",
  });
  const accepted = parseRvsResponse(200, body({ testTransaction: true }), sandbox);
  assert.equal(accepted.ok, true);
});

test("only the configured subscription SKU is accepted", () => {
  assert.deepEqual(parseRvsResponse(200, body({ productId: "premium_yearly" }), production), {
    ok: false,
    code: "invalid_product",
  });
  assert.deepEqual(parseRvsResponse(200, body({ productType: "ENTITLED" }), production), {
    ok: false,
    code: "invalid_product",
  });
});

test("a verified receipt is replayed inside the window and re-checked afterwards", () => {
  assert.equal(isReplayable(new Date(now - 60_000).toISOString(), now), true);
  assert.equal(isReplayable(new Date(now - 11 * 60_000).toISOString(), now), false);
  assert.equal(isReplayable(null, now), false);
});

test("a canceled receipt is re-verified instead of replayed", () => {
  const fresh = new Date(now - 60_000).toISOString();
  assert.equal(isReplayableReceipt({ status: "active", verified_at: fresh }, now), true);
  // RVS 410 oder erkannter Ablauf: verified_at ist frisch, Premium aber weg.
  assert.equal(isReplayableReceipt({ status: "canceled", verified_at: fresh }, now), false);
  assert.equal(isReplayableReceipt({ status: "expired", verified_at: fresh }, now), false);
  assert.equal(
    isReplayableReceipt({ status: "active", verified_at: new Date(now - 60 * 60_000).toISOString() }, now),
    false,
  );
});

test("turning auto-renew off keeps premium until the cancel date", () => {
  const state = receiptState(
    receipt({ autoRenewing: false, cancelDate: now + 3 * DAY, renewalDate: null }),
    now,
  );
  assert.equal(state.status, "active");
  assert.equal(state.premiumActive, true);
  assert.equal(state.cancelAtPeriodEnd, true);
  assert.equal(state.currentPeriodEnd, new Date(now + 3 * DAY).toISOString());
});

test("an expired renewal date ends premium", () => {
  const state = receiptState(
    receipt({ autoRenewing: false, renewalDate: now - 2 * DAY, cancelDate: null }),
    now,
  );
  assert.equal(state.status, "canceled");
  assert.equal(state.premiumActive, false);
  assert.equal(state.currentPeriodEnd, new Date(now - 2 * DAY).toISOString());
});

test("a grace period keeps premium active", () => {
  const state = receiptState(
    receipt({ renewalDate: now - DAY, gracePeriodEndDate: now + 2 * DAY }),
    now,
  );
  assert.equal(state.status, "active");
  assert.equal(state.premiumActive, true);
  assert.equal(state.currentPeriodEnd, new Date(now + 2 * DAY).toISOString());
});

test("a free trial receipt activates premium", () => {
  const state = receiptState(
    receipt({ renewalDate: null, freeTrialEndDate: now + 5 * DAY }),
    now,
  );
  assert.equal(state.status, "active");
  assert.equal(state.premiumActive, true);
});

test("conflict rules keep channels deterministic", () => {
  assert.deepEqual(decideReceiptApplication(null, "amazon-user"), { ok: true });

  assert.deepEqual(
    decideReceiptApplication(
      { channel: "web", status: "active", providerCustomerId: null },
      "amazon-user",
    ),
    { ok: false, code: "already_active_web" },
  );

  assert.deepEqual(
    decideReceiptApplication(
      { channel: "amazon", status: "active", providerCustomerId: "other-user" },
      "amazon-user",
    ),
    { ok: false, code: "receipt_owned_by_other_account" },
  );

  assert.deepEqual(
    decideReceiptApplication(
      { channel: "amazon", status: "active", providerCustomerId: "amazon-user" },
      "amazon-user",
    ),
    { ok: true },
  );

  assert.deepEqual(
    decideReceiptApplication(
      { channel: "web", status: "canceled", providerCustomerId: null },
      "amazon-user",
    ),
    { ok: true },
  );
});

test("the RVS url follows Amazon's format and encodes the values", () => {
  const url = buildVerifyUrl({
    baseUrl: "https://appstore-sdk.amazon.com/",
    sandbox: true,
    sharedSecret: "s3cret/value",
    appUserId: "user:id",
    receiptId: "a+b/c=",
  });
  assert.equal(
    url,
    "https://appstore-sdk.amazon.com/sandbox/version/1.0/verifyReceiptId/developer/s3cret%2Fvalue/user/user%3Aid/receiptId/a%2Bb%2Fc%3D",
  );
  assert.equal(
    buildVerifyUrl({
      baseUrl: "https://appstore-sdk.amazon.com",
      sandbox: false,
      sharedSecret: "x",
      appUserId: "u",
      receiptId: "r",
    }).includes("/sandbox/"),
    false,
  );
});

test("verifyReceipt retries throttling and never leaks the secret", async () => {
  const calls: string[] = [];
  const responses = [
    new Response("{}", { status: 429 }),
    new Response(JSON.stringify(body()), { status: 200 }),
  ];
  let index = 0;

  const result = await verifyReceipt({
    baseUrl: "https://appstore-sdk.amazon.com",
    sandbox: false,
    sharedSecret: "shared-secret-value",
    appUserId: "user",
    receiptId: RECEIPT_ID,
    expectedProductId: SKU,
    fetchImpl: (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return responses[index++];
    }) as typeof fetch,
    sleep: async () => {},
  });

  assert.equal(calls.length, 2);
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(result).includes("shared-secret-value"), false);
});

test("a network failure becomes a provider error without the secret", async () => {
  const result = await verifyReceipt({
    baseUrl: "https://appstore-sdk.amazon.com",
    sandbox: false,
    sharedSecret: "shared-secret-value",
    appUserId: "user",
    receiptId: RECEIPT_ID,
    expectedProductId: SKU,
    fetchImpl: (async () => {
      throw new Error("offline");
    }) as typeof fetch,
    sleep: async () => {},
  });

  assert.deepEqual(result, { ok: false, code: "provider_error" });
  assert.equal(JSON.stringify(result).includes("shared-secret-value"), false);
  assert.equal(Object.keys(AMAZON_ERROR_MESSAGES).includes("provider_error"), true);
});
