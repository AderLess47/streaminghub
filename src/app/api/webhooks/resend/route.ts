import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { get, nowIso, run } from "@/lib/db";
import { env } from "@/lib/env";

export const runtime = "nodejs";

/**
 * Delivery events from the mail provider (Svix-signed webhooks).
 *
 * Configure the endpoint as https://streaminghub.org/api/webhooks/resend and
 * set EMAIL_WEBHOOK_SECRET to the signing secret (whsec_...). Without the
 * secret the endpoint stays disabled (503) – it never accepts unsigned events.
 *
 * Hard bounces and spam complaints add the recipient to `email_suppressions`,
 * so no further transactional mail is sent to that address until an
 * administrator releases it.
 */

const MAX_CLOCK_SKEW_SECONDS = 300;

type WebhookEvent = {
  type?: string;
  data?: {
    email_id?: string;
    to?: string[];
    bounce?: { type?: string; message?: string };
  };
};

const EVENT_STATUS: Record<
  string,
  { status: "sent" | "failed" | "suppressed"; providerStatus: string; suppress?: "bounce" | "complaint" }
> = {
  "email.sent": { status: "sent", providerStatus: "sent" },
  "email.delivered": { status: "sent", providerStatus: "delivered" },
  "email.delivery_delayed": { status: "sent", providerStatus: "delayed" },
  "email.bounced": { status: "failed", providerStatus: "bounced", suppress: "bounce" },
  "email.complained": { status: "failed", providerStatus: "complained", suppress: "complaint" },
  "email.failed": { status: "failed", providerStatus: "failed" },
  "email.suppressed": { status: "suppressed", providerStatus: "suppressed" },
};

function verifySignature(payload: string, headers: Headers) {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signature = headers.get("svix-signature");
  if (!id || !timestamp || !signature) return false;

  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return false;
  if (Math.abs(Date.now() / 1000 - seconds) > MAX_CLOCK_SKEW_SECONDS) return false;

  const secret = env.email.webhookSecret.replace(/^whsec_/, "");
  const key = Buffer.from(secret, "base64");
  if (key.length === 0) return false;

  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest();

  return signature.split(" ").some((entry) => {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export async function POST(request: Request) {
  if (!env.email.webhookSecret) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const payload = await request.text();
  if (!verifySignature(payload, request.headers)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let event: WebhookEvent;
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const target = event.type ? EVENT_STATUS[event.type] : undefined;
  const providerId = event.data?.email_id;
  if (!target || !providerId) {
    // Acknowledge unknown event types so the provider does not retry forever.
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const row = get<{ to_email: string }>(
    `SELECT to_email FROM outbox_emails WHERE provider_id = ?`,
    providerId,
  );
  const recipient = event.data?.to?.[0] ?? row?.to_email ?? null;
  const bounceType = String(event.data?.bounce?.type ?? "").toLowerCase();

  const result = run(
    `UPDATE outbox_emails SET provider_status = ?, status = ? WHERE provider_id = ?`,
    target.providerStatus,
    target.status,
    providerId,
  );

  if (target.suppress && recipient) {
    // Resend reports permanent and temporary bounces. Only hard bounces and
    // complaints are suppressed; a temporary bounce is retried by the sender.
    const permanent =
      target.suppress === "complaint" || bounceType === "" || bounceType === "permanent";
    if (permanent) {
      run(
        `INSERT INTO email_suppressions (email, reason, detail, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET reason = excluded.reason, detail = excluded.detail`,
        recipient.toLowerCase(),
        target.suppress,
        (event.data?.bounce?.message ?? event.type ?? "").slice(0, 300),
        nowIso(),
      );
    }
  }

  return NextResponse.json({
    ok: true,
    updated: Number(result.changes ?? 0),
    suppressed: Boolean(target.suppress && recipient),
  });
}
