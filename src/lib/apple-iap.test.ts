import { test } from "node:test";
import assert from "node:assert/strict";
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  decideAppleApplication,
  isReplayable,
  transactionState,
  verifyAppleTransaction,
  type AppleTransaction,
} from "./apple-iap.ts";

/**
 * Prüfungen gegen eine eigens erzeugte Zertifikatskette (siehe
 * `__fixtures__/apple/`). Damit laufen Kettenprüfung, Signaturprüfung und die
 * Anspruchsregeln wirklich durch – nur eben gegen eine Testwurzel statt gegen
 * Apples Root CA G3. Die produktive Wurzel steckt in `apple-root-ca.ts`.
 */
const fixture = (name: string) =>
  readFileSync(path.join(import.meta.dirname, "__fixtures__", "apple", name), "utf8");

const rootPem = fixture("root.pem");
const intermediatePem = fixture("intermediate.pem");
const leafPem = fixture("leaf.pem");
const leafKey = createPrivateKey(fixture("leaf.key.pem"));

const b64url = (value: Buffer | string) =>
  Buffer.from(value).toString("base64url");

const pemToDer = (pem: string) =>
  Buffer.from(
    pem.replace(/-----BEGIN CERTIFICATE-----/, "")
      .replace(/-----END CERTIFICATE-----/, "")
      .replace(/\s+/g, ""),
    "base64",
  );

function buildJws(
  payload: Record<string, unknown>,
  options: { chain?: string[]; key?: ReturnType<typeof createPrivateKey> } = {},
): string {
  const chain = options.chain ?? [leafPem, intermediatePem];
  const header = {
    alg: "ES256",
    x5c: chain.map((pem) => pemToDer(pem).toString("base64")),
  };
  const headerPart = b64url(JSON.stringify(header));
  const payloadPart = b64url(JSON.stringify(payload));
  const signature = sign("sha256", Buffer.from(`${headerPart}.${payloadPart}`, "ascii"), {
    key: options.key ?? leafKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${headerPart}.${payloadPart}.${b64url(signature)}`;
}

const now = Date.now();

function payload(overrides: Record<string, unknown> = {}) {
  return {
    transactionId: "2000000123456789",
    originalTransactionId: "1000000987654321",
    bundleId: "org.streaminghub.app",
    productId: "premium_monthly",
    type: "Auto-Renewable Subscription",
    environment: "Production",
    purchaseDate: now - 60_000,
    expiresDate: now + 30 * 86_400_000,
    inAppOwnershipType: "PURCHASED",
    ...overrides,
  };
}

const verify = (jws: string, overrides: Partial<Parameters<typeof verifyAppleTransaction>[0]> = {}) =>
  verifyAppleTransaction({
    jws,
    bundleId: "org.streaminghub.app",
    productId: "premium_monthly",
    trustedRoots: [rootPem],
    allowSandbox: false,
    now,
    ...overrides,
  });

test("a correctly signed transaction is accepted", () => {
  const result = verify(buildJws(payload()));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.transaction.originalTransactionId, "1000000987654321");
    assert.equal(result.transaction.productId, "premium_monthly");
  }
});

test("a chain without the intermediate is rejected", () => {
  const result = verify(buildJws(payload(), { chain: [leafPem] }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "untrusted_chain");
});

test("tampering with the payload breaks the signature", () => {
  const jws = buildJws(payload());
  const [header, , signature] = jws.split(".");
  const forgedPayload = b64url(JSON.stringify(payload({ expiresDate: now + 10 * 365 * 86_400_000 })));
  const result = verify(`${header}.${forgedPayload}.${signature}`);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "bad_signature");
});

test("a transaction signed by another key is rejected", () => {
  const otherKey = createPrivateKey(fixture("intermediate.key.pem"));
  const result = verify(buildJws(payload(), { key: otherKey }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "bad_signature");
});

test("an untrusted root is rejected even with a valid chain", () => {
  // Ein Zertifikat, das nicht in der Kette steht, ist keine vertrauenswuerdige Wurzel.
  const result = verify(buildJws(payload()), { trustedRoots: [leafPem] });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "untrusted_chain");
});

test("foreign bundle or product are rejected", () => {
  const wrongBundle = verify(buildJws(payload({ bundleId: "com.example.other" })));
  assert.equal(wrongBundle.ok, false);
  if (!wrongBundle.ok) assert.equal(wrongBundle.code, "wrong_bundle");

  const wrongProduct = verify(buildJws(payload({ productId: "premium_yearly" })));
  assert.equal(wrongProduct.ok, false);
  if (!wrongProduct.ok) assert.equal(wrongProduct.code, "wrong_product");
});

test("non-subscription transactions are rejected", () => {
  const result = verify(buildJws(payload({ type: "Consumable" })));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "unsupported_type");
});

test("sandbox transactions need explicit permission", () => {
  const jws = buildJws(payload({ environment: "Sandbox" }));
  const denied = verify(jws);
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.code, "sandbox_not_allowed");

  const allowed = verify(jws, { allowSandbox: true });
  assert.equal(allowed.ok, true);
});

test("expired and revoked transactions are rejected", () => {
  const expired = verify(buildJws(payload({ expiresDate: now - 1_000 })));
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.equal(expired.code, "expired");

  const revoked = verify(buildJws(payload({ revocationDate: now - 1_000 })));
  assert.equal(revoked.ok, false);
  if (!revoked.ok) assert.equal(revoked.code, "revoked");
});

test("malformed input is rejected without throwing", () => {
  for (const jws of ["", "abc", "a.b.c", "e30.e30.e30"]) {
    const result = verify(jws);
    assert.equal(result.ok, false);
  }
});

test("subscription state follows expiry and revocation", () => {
  const transaction = (overrides: Partial<AppleTransaction> = {}): AppleTransaction => ({
    transactionId: "t",
    originalTransactionId: "o",
    bundleId: "org.streaminghub.app",
    productId: "premium_monthly",
    productType: "Auto-Renewable Subscription",
    environment: "Production",
    purchaseDate: now - 1_000,
    expiresDate: now + 1_000,
    revocationDate: null,
    inAppOwnershipType: "PURCHASED",
    appAccountToken: null,
    ...overrides,
  });

  assert.deepEqual(transactionState(transaction(), now), {
    status: "active",
    currentPeriodEnd: new Date(now + 1_000).toISOString(),
    premiumActive: true,
  });
  assert.equal(transactionState(transaction({ expiresDate: now - 1 }), now).status, "expired");
  assert.equal(transactionState(transaction({ revocationDate: now - 1 }), now).status, "canceled");
});

test("conflict rule blocks a second channel but allows the same subscription", () => {
  assert.deepEqual(decideAppleApplication(null, "o1"), { ok: true });
  assert.deepEqual(
    decideAppleApplication({ channel: "apple", status: "active", providerCustomerId: "o1" }, "o1"),
    { ok: true },
  );
  assert.deepEqual(
    decideAppleApplication({ channel: "apple", status: "active", providerCustomerId: "o1" }, "o2"),
    { ok: false, code: "receipt_owned_by_other_account" },
  );
  assert.deepEqual(
    decideAppleApplication({ channel: "web", status: "active", providerCustomerId: null }, "o1"),
    { ok: false, code: "already_active_other_channel" },
  );
  assert.deepEqual(
    decideAppleApplication({ channel: "web", status: "canceled", providerCustomerId: null }, "o1"),
    { ok: true },
  );
});

test("replay window only covers freshly verified receipts", () => {
  assert.equal(isReplayable(null), false);
  assert.equal(isReplayable(new Date(now - 1_000).toISOString()), true);
  assert.equal(isReplayable(new Date(now - 60 * 60_000).toISOString()), false);
  assert.equal(isReplayable("kein Datum"), false);
});
