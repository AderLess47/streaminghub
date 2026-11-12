import { json } from "@/lib/api";
import { receiptState, verifyReceipt } from "@/lib/amazon-iap";
import {
  isAllowedSigningCertUrl,
  isAllowedSubscribeUrl,
  isFreshTimestamp,
  notificationEffect,
  parseRtnMessage,
  parseSnsEnvelope,
  rtnTopicAllowed,
  verifySnsSignature,
} from "@/lib/amazon-rtn";
import {
  applyCanceledReceipt,
  applyVerifiedReceipt,
  getReceipt,
  hasNotification,
  recordNotification,
} from "@/lib/amazon-subscriptions";
import { env, isAmazonIapConfigured } from "@/lib/env";

export const runtime = "nodejs";

/**
 * Amazon Real-Time Notifications (SNS) for IAP. The notification only triggers
 * a re-verification – RVS keeps deciding what the customer is entitled to.
 */
export async function POST(request: Request) {
  if (!isAmazonIapConfigured()) {
    return json(
      { error: { code: "not_configured", message: "Amazon-Benachrichtigungen sind nicht konfiguriert." } },
      { status: 503 },
    );
  }

  const parsed = parseSnsEnvelope(await request.text());
  if (!parsed.ok) {
    return json({ error: { code: "invalid_request", message: "Ungültige SNS-Nachricht." } }, { status: 400 });
  }
  const envelope = parsed.envelope;

  if (!isFreshTimestamp(envelope.timestamp)) {
    return json({ error: { code: "forbidden", message: "Nachricht ist zu alt." } }, { status: 403 });
  }

  const certificate = await fetchSigningCertificate(envelope.signingCertUrl);
  if (!certificate || !verifySnsSignature(envelope, certificate)) {
    return json({ error: { code: "forbidden", message: "Signatur ungültig." } }, { status: 403 });
  }
  const topic = rtnTopicAllowed({
    configuredTopic: env.billing.amazonRtnTopicArn,
    messageType: envelope.type,
    topicArn: envelope.topicArn,
  });
  if (topic === "forbidden") {
    return json({ error: { code: "forbidden", message: "Unbekanntes Topic." } }, { status: 403 });
  }

  if (envelope.type === "SubscriptionConfirmation") {
    if (!envelope.subscribeUrl || !isAllowedSubscribeUrl(envelope.subscribeUrl)) {
      return json({ error: { code: "forbidden", message: "Ungültige Bestätigungs-URL." } }, { status: 403 });
    }
    try {
      await fetch(envelope.subscribeUrl, { signal: AbortSignal.timeout(5000) });
    } catch {
      return json(
        { error: { code: "provider_error", message: "Bestätigung konnte nicht gesendet werden." } },
        { status: 503 },
      );
    }
    if (topic === "bootstrap") {
      // Registration bootstrap: log the ARN so it can be configured, it is not
      // a secret. Notifications stay rejected until the env var is set.
      console.info("amazon rtn subscription confirmed for topic", envelope.topicArn);
    }
    return json({ ok: true, confirmed: true, topicArn: envelope.topicArn });
  }

  if (envelope.type !== "Notification") return json({ ok: true, ignored: true });

  const message = parseRtnMessage(envelope.message);
  if (!message || notificationEffect(message.notificationType) === "ignore") {
    return json({ ok: true, ignored: true });
  }

  // SNS retries, so the same event must not be processed twice.
  if (hasNotification(message.receiptId, message.notificationType)) {
    return json({ ok: true, duplicate: true });
  }

  const row = getReceipt(message.receiptId);
  if (!row) {
    console.warn("amazon rtn for an unknown receipt");
    return json({ ok: true, ignored: true });
  }

  const result = await verifyReceipt({
    baseUrl: env.billing.amazonRvsBase,
    sandbox: env.billing.amazonRvsSandbox,
    sharedSecret: env.billing.amazonRvsSharedSecret,
    appUserId: row.app_user_id,
    receiptId: row.receipt_id,
    expectedProductId: row.product_id,
  });

  if (!result.ok) {
    if (result.code === "canceled") {
      applyCanceledReceipt({ userId: row.user_id, receiptId: row.receipt_id });
      recordNotification(row.user_id, row.receipt_id, message.notificationType);
      return json({ ok: true, status: "canceled" });
    }
    // 200 on purpose: a permanently invalid receipt must not make SNS retry for
    // hours. The daily sync picks the receipt up again.
    console.warn("amazon rtn could not be verified", result.code);
    return json({ ok: true, ignored: true, reason: result.code });
  }

  const state = receiptState(result.receipt);
  applyVerifiedReceipt({
    userId: row.user_id,
    appUserId: row.app_user_id,
    receipt: result.receipt,
    state,
    rawResponse: null,
  });
  recordNotification(row.user_id, row.receipt_id, message.notificationType);

  return json({ ok: true, status: state.status });
}

async function fetchSigningCertificate(url: string): Promise<string | null> {
  if (!isAllowedSigningCertUrl(url)) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}
