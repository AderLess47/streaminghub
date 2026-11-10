import { randomUUID } from "node:crypto";
import { apiError, clientIp, isSameOrigin, json, parseBody, tooManyRequests } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { nowIso, run } from "@/lib/db";
import { env } from "@/lib/env";
import { contactMail, sendMail } from "@/lib/mail";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { contactSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return apiError("forbidden", "Ungültige Herkunft der Anfrage.");
  }

  const ip = clientIp(request);
  const limit = rateLimit(rateLimitKey("contact:ip", ip), 5, 3600);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const parsed = await parseBody(request, contactSchema);
  if (!parsed.ok) return parsed.response;
  const data = parsed.data;

  // Honeypot: real users never fill this field.
  if (data.website) {
    return json({ ok: true });
  }
  // Reject submissions faster than a human can type.
  if (data.renderedAt && Date.now() - data.renderedAt < 2500) {
    return apiError("invalid_request", "Bitte prüfe deine Angaben und sende das Formular erneut.");
  }

  const id = randomUUID();
  run(
    `INSERT INTO contact_messages (id, name, email, subject, message, status, ip, created_at)
     VALUES (?, ?, ?, ?, ?, 'new', ?, ?)`,
    id,
    data.name,
    data.email.toLowerCase(),
    data.subject,
    data.message,
    ip,
    nowIso(),
  );

  const mail = contactMail({
    name: data.name,
    email: data.email,
    subject: data.subject,
    message: data.message,
    reference: id,
    ip,
  });
  await sendMail({ to: env.contactTo, ...mail, kind: "contact_message" });

  logAudit({
    action: "contact.submitted",
    targetType: "contact_message",
    targetId: id,
    ip,
    meta: { subject: data.subject.slice(0, 120) },
  });

  return json({ ok: true, reference: id });
}
