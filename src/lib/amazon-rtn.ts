/**
 * Amazon Real-Time Notifications (SNS) envelope handling.
 *
 * Amazon pushes a JSON message with a signature; the receipt inside is only a
 * trigger, RVS remains authoritative. The signature is verified against the
 * certificate referenced by `SigningCertURL`, which is why that URL is validated
 * against a strict allowlist (never fetch arbitrary hosts).
 */
import { verify } from "node:crypto";

export type SnsEnvelope = {
  type: "Notification" | "SubscriptionConfirmation" | "UnsubscribeConfirmation";
  messageId: string;
  topicArn: string;
  message: string;
  subject: string | null;
  timestamp: string;
  token: string | null;
  subscribeUrl: string | null;
  signature: string;
  signatureVersion: string;
  signingCertUrl: string;
};

export type SnsParseResult =
  | { ok: true; envelope: SnsEnvelope }
  | { ok: false; code: "invalid_envelope" };

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

export function parseSnsEnvelope(raw: string): SnsParseResult {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ok: false, code: "invalid_envelope" };
  }

  const type = asString(payload.Type);
  if (
    type !== "Notification" &&
    type !== "SubscriptionConfirmation" &&
    type !== "UnsubscribeConfirmation"
  ) {
    return { ok: false, code: "invalid_envelope" };
  }

  const messageId = asString(payload.MessageId);
  const topicArn = asString(payload.TopicArn);
  const message = typeof payload.Message === "string" ? payload.Message : null;
  const timestamp = asString(payload.Timestamp);
  const signature = asString(payload.Signature);
  const signingCertUrl = asString(payload.SigningCertURL);
  if (!messageId || !topicArn || message === null || !timestamp || !signature || !signingCertUrl) {
    return { ok: false, code: "invalid_envelope" };
  }

  return {
    ok: true,
    envelope: {
      type,
      messageId,
      topicArn,
      message,
      subject: asString(payload.Subject),
      timestamp,
      token: asString(payload.Token),
      subscribeUrl: asString(payload.SubscribeURL),
      signature,
      signatureVersion: asString(payload.SignatureVersion) ?? "1",
      signingCertUrl,
    },
  };
}

/** SNS signs either a certificate host under amazonaws.com or nothing at all. */
export function isAllowedAmazonUrl(value: string, hosts: RegExp): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (url.username || url.password) return false;
    return hosts.test(url.hostname);
  } catch {
    return false;
  }
}

const CERT_HOSTS = /^sns(\.[a-z0-9-]+)?\.amazonaws\.com$/;
const SNS_HOSTS = /^(sns(\.[a-z0-9-]+)?\.amazonaws\.com|amazonaws\.com)$/;

export const isAllowedSigningCertUrl = (value: string) => isAllowedAmazonUrl(value, CERT_HOSTS);
export const isAllowedSubscribeUrl = (value: string) => isAllowedAmazonUrl(value, SNS_HOSTS);

/** Canonical string SNS signs, per the SNS message format. */
export function snsStringToSign(envelope: SnsEnvelope): string | null {
  if (envelope.type === "Notification") {
    return envelope.subject
      ? `${envelope.message}\n${envelope.messageId}\n${envelope.subject}\n${envelope.timestamp}`
      : `${envelope.message}\n${envelope.messageId}\n${envelope.timestamp}`;
  }
  if (!envelope.token) return null;
  return `${envelope.message}\n${envelope.messageId}\n${envelope.token}\n${envelope.timestamp}`;
}

/**
 * `pem` is the certificate downloaded from `SigningCertURL`; in tests a public
 * key in PEM form is accepted as well.
 */
export function verifySnsSignature(envelope: SnsEnvelope, pem: string): boolean {
  const data = snsStringToSign(envelope);
  if (!data) return false;
  const algorithm = envelope.signatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1";
  try {
    return verify(
      algorithm,
      Buffer.from(data, "utf8"),
      pem,
      Buffer.from(envelope.signature, "base64"),
    );
  } catch {
    return false;
  }
}

export function isFreshTimestamp(timestamp: string, now = Date.now(), maxSkewMs = 3_600_000) {
  const at = new Date(timestamp).getTime();
  if (!Number.isFinite(at)) return false;
  return Math.abs(now - at) <= maxSkewMs;
}

export type RtnMessage = {
  receiptId: string;
  appUserId: string;
  notificationType: string;
};

export function parseRtnMessage(message: string): RtnMessage | null {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(message) as Record<string, unknown>;
  } catch {
    return null;
  }
  const receiptId = asString(payload.receiptId);
  const notificationType = asString(payload.notificationType);
  if (!receiptId || !notificationType) return null;
  return {
    receiptId,
    appUserId: asString(payload.appUserId) ?? "",
    notificationType,
  };
}

export type RtnEffect = "verify" | "ignore";

/**
 * Every subscription event is re-verified with RVS, so the mapping only decides
 * whether a notification is worth a verification call at all.
 */
export function notificationEffect(notificationType: string): RtnEffect {
  return notificationType.startsWith("SUBSCRIPTION_") ? "verify" : "ignore";
}
