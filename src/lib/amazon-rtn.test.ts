import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import {
  isAllowedSigningCertUrl,
  isAllowedSubscribeUrl,
  isFreshTimestamp,
  notificationEffect,
  parseRtnMessage,
  parseSnsEnvelope,
  snsStringToSign,
  verifySnsSignature,
  type SnsEnvelope,
} from "./amazon-rtn.ts";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();

function envelope(overrides: Partial<SnsEnvelope> = {}): SnsEnvelope {
  return {
    type: "Notification",
    messageId: "2c1d3f00-0000-4000-8000-000000000001",
    topicArn: "arn:aws:sns:us-east-1:123456789012:streaminghub-iap",
    message: JSON.stringify({
      receiptId: "receipt-1",
      appUserId: "amazon-user-1",
      notificationType: "SUBSCRIPTION_RENEWED",
    }),
    subject: null,
    timestamp: new Date().toISOString(),
    token: null,
    subscribeUrl: null,
    signature: "",
    signatureVersion: "2",
    signingCertUrl: "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-test.pem",
    ...overrides,
  };
}

function signed(overrides: Partial<SnsEnvelope> = {}): SnsEnvelope {
  const value = envelope(overrides);
  const data = snsStringToSign(value);
  assert.ok(data);
  return {
    ...value,
    signature: sign("RSA-SHA256", Buffer.from(data, "utf8"), privateKey).toString("base64"),
  };
}

test("a Notification envelope is parsed", () => {
  const parsed = parseSnsEnvelope(
    JSON.stringify({
      Type: "Notification",
      MessageId: "id-1",
      TopicArn: "arn:aws:sns:eu-west-1:1:topic",
      Message: "{\"receiptId\":\"r\"}",
      Timestamp: "2026-11-12T10:00:00.000Z",
      Signature: "abc",
      SignatureVersion: "2",
      SigningCertURL: "https://sns.eu-west-1.amazonaws.com/cert.pem",
    }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.envelope.type, "Notification");
  assert.equal(parsed.envelope.signatureVersion, "2");
});

test("broken or unknown envelopes are rejected", () => {
  assert.deepEqual(parseSnsEnvelope("not json"), { ok: false, code: "invalid_envelope" });
  assert.deepEqual(parseSnsEnvelope(JSON.stringify({ Type: "Something", Message: "x" })), {
    ok: false,
    code: "invalid_envelope",
  });
  assert.deepEqual(parseSnsEnvelope(JSON.stringify({ Type: "Notification", MessageId: "only" })), {
    ok: false,
    code: "invalid_envelope",
  });
});

test("only https amazonaws.com certificates are fetched", () => {
  assert.equal(
    isAllowedSigningCertUrl("https://sns.eu-west-1.amazonaws.com/cert.pem"),
    true,
  );
  assert.equal(isAllowedSigningCertUrl("https://sns.amazonaws.com/cert.pem"), true);
  assert.equal(isAllowedSigningCertUrl("http://sns.eu-west-1.amazonaws.com/cert.pem"), false);
  assert.equal(isAllowedSigningCertUrl("https://sns.eu-west-1.amazonaws.com.evil.test/cert.pem"), false);
  assert.equal(isAllowedSigningCertUrl("https://evil.test/cert.pem"), false);
  assert.equal(isAllowedSigningCertUrl("https://user:pass@sns.amazonaws.com/cert.pem"), false);
});

test("the subscription confirmation url is only followed on amazonaws.com", () => {
  assert.equal(
    isAllowedSubscribeUrl("https://sns.eu-west-1.amazonaws.com/?Action=ConfirmSubscription"),
    true,
  );
  assert.equal(isAllowedSubscribeUrl("https://evil.test/confirm"), false);
  assert.equal(isAllowedSubscribeUrl("file:///etc/passwd"), false);
});

test("the signed string depends on the notification type", () => {
  const notification = envelope({ message: "m", messageId: "i", timestamp: "t" });
  assert.equal(snsStringToSign(notification), "m\ni\nt");

  const withSubject = envelope({ message: "m", messageId: "i", timestamp: "t", subject: "s" });
  assert.equal(snsStringToSign(withSubject), "m\ni\ns\nt");

  const confirmation = envelope({
    type: "SubscriptionConfirmation",
    message: "m",
    messageId: "i",
    timestamp: "t",
    token: "tok",
  });
  assert.equal(snsStringToSign(confirmation), "m\ni\ntok\nt");

  const withoutToken = envelope({ type: "SubscriptionConfirmation", token: null });
  assert.equal(snsStringToSign(withoutToken), null);
});

test("a valid signature is accepted and tampering is detected", () => {
  const value = signed();
  assert.equal(verifySnsSignature(value, publicPem), true);

  const tampered: SnsEnvelope = {
    ...value,
    message: JSON.stringify({
      receiptId: "receipt-1",
      appUserId: "amazon-user-1",
      notificationType: "SUBSCRIPTION_CANCELLED",
    }),
  };
  assert.equal(verifySnsSignature(tampered, publicPem), false);

  const otherKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const otherPem = otherKeys.publicKey.export({ type: "spki", format: "pem" }).toString();
  assert.equal(verifySnsSignature(value, otherPem), false);
  assert.equal(verifySnsSignature({ ...value, signature: "not-base64" }, publicPem), false);
});

test("stale messages are rejected", () => {
  const now = Date.now();
  assert.equal(isFreshTimestamp(new Date(now - 60_000).toISOString(), now), true);
  assert.equal(isFreshTimestamp(new Date(now - 2 * 3_600_000).toISOString(), now), false);
  assert.equal(isFreshTimestamp("not a date", now), false);
});

test("the notification message carries the receipt to re-verify", () => {
  assert.deepEqual(
    parseRtnMessage(
      JSON.stringify({ receiptId: "r-1", appUserId: "u-1", notificationType: "SUBSCRIPTION_RENEWED" }),
    ),
    { receiptId: "r-1", appUserId: "u-1", notificationType: "SUBSCRIPTION_RENEWED" },
  );
  assert.equal(parseRtnMessage(JSON.stringify({ receiptId: "r-1" })), null);
  assert.equal(parseRtnMessage("broken"), null);
});

test("only subscription notifications trigger a verification", () => {
  for (const type of [
    "SUBSCRIPTION_PURCHASED",
    "SUBSCRIPTION_RENEWED",
    "SUBSCRIPTION_AUTO_RENEWAL_OFF",
    "SUBSCRIPTION_CANCELLED",
    "SUBSCRIPTION_EXPIRED",
    "SUBSCRIPTION_IN_GRACE_PERIOD",
    "SUBSCRIPTION_SCHEDULED_TO_END",
    "SUBSCRIPTION_MODIFIED_IMMEDIATE",
  ]) {
    assert.equal(notificationEffect(type), "verify", type);
  }
  assert.equal(notificationEffect("ENTITLEMENT_PURCHASED"), "ignore");
  assert.equal(notificationEffect("CONSUMABLE_CANCELLED"), "ignore");
});
