import { test } from "node:test";
import assert from "node:assert/strict";
import { createPrivateKey } from "node:crypto";
import {
  appleTransactionPayload,
  b64url,
  buildJws,
  buildNotification,
  fixture,
  intermediatePem,
  leafPem,
  rootPem,
} from "./__fixtures__/apple/jws.ts";
import {
  decideAppleApplication,
  isReplayable,
  isReplayablePurchase,
  notificationEffect,
  transactionState,
  verifyAppleNotification,
  verifyAppleTransaction,
  type AppleNotification,
  type AppleTransaction,
} from "./apple-iap.ts";

/**
 * Prüfungen gegen eine eigens erzeugte Zertifikatskette (siehe
 * `__fixtures__/apple/`). Damit laufen Kettenprüfung, Signaturprüfung und die
 * Anspruchsregeln wirklich durch – nur eben gegen eine Testwurzel statt gegen
 * Apples Root CA G3. Die produktive Wurzel steckt in `apple-root-ca.ts`.
 */
const now = Date.now();

const payload = (overrides: Record<string, unknown> = {}) => appleTransactionPayload(overrides, now);

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

const verifyNotification = (
  signedPayload: string,
  overrides: Partial<Parameters<typeof verifyAppleNotification>[0]> = {},
) =>
  verifyAppleNotification({
    signedPayload,
    bundleId: "org.streaminghub.app",
    productId: "premium_monthly",
    trustedRoots: [rootPem],
    allowSandbox: false,
    now,
    ...overrides,
  });

function notificationFor(type: string, transaction: Record<string, unknown> = {}): AppleNotification {
  const result = verifyNotification(buildNotification({ notificationType: type, transaction, now }));
  if (!result.ok) throw new Error(`Testmeldung wurde verworfen: ${result.code}`);
  return result.notification;
}

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
    decideAppleApplication({ channel: "apple", status: "past_due", providerCustomerId: "o1" }, "o2"),
    { ok: false, code: "receipt_owned_by_other_account" },
  );
  // Nach einem Lapse darf Apple eine neue Original-ID ausstellen.
  assert.deepEqual(
    decideAppleApplication(
      { channel: "apple", status: "canceled", providerCustomerId: "o1" },
      "o2",
    ),
    { ok: true },
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

test("a lapsed receipt does not swallow the repurchase", () => {
  const verifiedAt = new Date(now - 1_000).toISOString();
  const future = now + 30 * 86_400_000;
  const purchase: AppleTransaction = {
    transactionId: "repurchase-tx",
    originalTransactionId: "repurchase-original",
    bundleId: "org.streaminghub.app",
    productId: "premium_monthly",
    productType: "Auto-Renewable Subscription",
    environment: "Production",
    purchaseDate: now - 1_000,
    expiresDate: future,
    revocationDate: null,
    inAppOwnershipType: "PURCHASED",
    appAccountToken: null,
  };

  // Gleiche Transaktion erneut gemeldet: aus dem Beleg beantworten.
  assert.equal(
    isReplayablePurchase(
      { status: "active", renewal_date: new Date(future).toISOString(), verified_at: verifiedAt },
      purchase,
      now,
    ),
    true,
  );
  // Ablauf gerade erkannt (verified_at frisch, Beleg expired): anwenden.
  assert.equal(
    isReplayablePurchase(
      { status: "expired", renewal_date: new Date(now - 86_400_000).toISOString(), verified_at: verifiedAt },
      purchase,
      now,
    ),
    false,
  );
  // Laufendes Abo, aber die Transaktion reicht weiter als der gespeicherte Zeitraum.
  assert.equal(
    isReplayablePurchase(
      { status: "active", renewal_date: new Date(now + 86_400_000).toISOString(), verified_at: verifiedAt },
      purchase,
      now,
    ),
    false,
  );
  // Alter Beleg außerhalb des Fensters wird ohnehin neu geprüft.
  assert.equal(
    isReplayablePurchase(
      {
        status: "active",
        renewal_date: new Date(future).toISOString(),
        verified_at: new Date(now - 60 * 60_000).toISOString(),
      },
      purchase,
      now,
    ),
    false,
  );
});

test("a signed notification is accepted with its transaction", () => {
  const result = verifyNotification(buildNotification({ notificationType: "DID_RENEW", now }));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.notification.notificationType, "DID_RENEW");
    assert.equal(result.notification.transaction.originalTransactionId, "1000000987654321");
    assert.equal(result.notification.environment, "Production");
  }
});

test("refunds and expiries are valid notifications", () => {
  // Beim Kauf sind beide abgelehnt – als Meldung sind sie der Normalfall.
  const refund = verifyNotification(
    buildNotification({ notificationType: "REFUND", transaction: { revocationDate: now - 1_000 }, now }),
  );
  assert.equal(refund.ok, true);
  if (refund.ok) {
    assert.equal(transactionState(refund.notification.transaction, now).status, "canceled");
  }

  const expired = verifyNotification(
    buildNotification({ notificationType: "EXPIRED", transaction: { expiresDate: now - 1_000 }, now }),
  );
  assert.equal(expired.ok, true);
  if (expired.ok) {
    assert.equal(transactionState(expired.notification.transaction, now).status, "expired");
  }
});

test("a notification for another app or product is rejected", () => {
  const wrongEnvelope = verifyNotification(
    buildNotification({ notificationType: "DID_RENEW", bundleId: "com.example.other", now }),
  );
  assert.equal(wrongEnvelope.ok, false);
  if (!wrongEnvelope.ok) assert.equal(wrongEnvelope.code, "wrong_bundle");

  const wrongTransaction = verifyNotification(
    buildNotification({ notificationType: "DID_RENEW", transaction: { bundleId: "com.example.other" }, now }),
  );
  assert.equal(wrongTransaction.ok, false);
  if (!wrongTransaction.ok) assert.equal(wrongTransaction.code, "wrong_bundle");

  const wrongProduct = verifyNotification(
    buildNotification({ notificationType: "DID_RENEW", transaction: { productId: "premium_yearly" }, now }),
  );
  assert.equal(wrongProduct.ok, false);
  if (!wrongProduct.ok) assert.equal(wrongProduct.code, "wrong_product");
});

test("tampering with a notification breaks the signature", () => {
  const signed = buildNotification({ notificationType: "DID_RENEW", now });
  const [header, , signature] = signed.split(".") as [string, string, string];
  const forged = b64url(
    JSON.stringify({ notificationType: "REFUND", notificationUUID: "x", data: {} }),
  );
  const result = verifyNotification(`${header}.${forged}.${signature}`);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "bad_signature");
});

test("a notification without a signed transaction is malformed", () => {
  const signedPayload = buildJws({
    notificationType: "DID_RENEW",
    notificationUUID: "5f0c1d0e-0000-4000-8000-000000000002",
    data: { bundleId: "org.streaminghub.app", environment: "Production" },
  });
  const result = verifyNotification(signedPayload);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "malformed");
});

test("sandbox notifications need explicit permission", () => {
  const signedPayload = buildNotification({
    notificationType: "DID_RENEW",
    environment: "Sandbox",
    transaction: { environment: "Sandbox" },
    now,
  });
  const denied = verifyNotification(signedPayload);
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.code, "sandbox_not_allowed");

  assert.equal(verifyNotification(signedPayload, { allowSandbox: true }).ok, true);
});

test("renewal info is part of the verification", () => {
  const renewal = {
    originalTransactionId: "1000000987654321",
    autoRenewProductId: "premium_monthly",
    autoRenewStatus: 1,
    expirationIntent: 0,
  };
  const accepted = verifyNotification(
    buildNotification({ notificationType: "DID_RENEW", renewalInfo: renewal, now }),
  );
  assert.equal(accepted.ok, true);
  if (accepted.ok) assert.equal(accepted.notification.renewalInfo?.autoRenewStatus, 1);

  const broken = verifyNotification(
    buildNotification({
      notificationType: "DID_RENEW",
      now,
      data: { signedRenewalInfo: buildJws(renewal, { chain: [leafPem] }) },
    }),
  );
  assert.equal(broken.ok, false);
  if (!broken.ok) assert.equal(broken.code, "untrusted_chain");
});

test("notification effect only applies state-changing messages", () => {
  assert.deepEqual(notificationEffect(notificationFor("DID_RENEW")), { kind: "apply" });
  assert.deepEqual(notificationEffect(notificationFor("REFUND")), { kind: "apply" });
  assert.deepEqual(notificationEffect(notificationFor("EXPIRED")), { kind: "apply" });
  assert.deepEqual(notificationEffect(notificationFor("DID_CHANGE_RENEWAL_STATUS")), {
    kind: "ignore",
    reason: "no_state_change",
  });
  assert.deepEqual(notificationEffect(notificationFor("SOMETHING_NEW")), {
    kind: "ignore",
    reason: "unknown_type",
  });
});
