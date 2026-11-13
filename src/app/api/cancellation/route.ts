import { apiError, clientIp, isSameOrigin, json, parseBody, tooManyRequests } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { contractLabel, recordCancellation } from "@/lib/contract-requests";
import { env } from "@/lib/env";
import { cancellationMail, contractRequestNotice, sendMail } from "@/lib/mail";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { cancellationSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Kündigungsschaltfläche nach § 312k BGB. Der Klick ist die Kündigung; die
 * Antwort nennt die Referenz für die Bestätigungsseite. Bei einem Abo über die
 * Website wird zusätzlich sofort beim Zahlungsanbieter gekündigt.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return apiError("forbidden", "Ungültige Herkunft der Anfrage.");
  }

  const ip = clientIp(request);
  const limit = rateLimit(rateLimitKey("cancellation:ip", ip), 5, 3600);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const parsed = await parseBody(request, cancellationSchema);
  if (!parsed.ok) return parsed.response;
  const data = parsed.data;

  if (data.website) return json({ ok: true, reference: "" });
  if (data.renderedAt && Date.now() - data.renderedAt < 2000) {
    return apiError("invalid_request", "Bitte prüfe deine Angaben und sende das Formular erneut.");
  }

  const record = await recordCancellation({ email: data.email, ip });
  const contract = contractLabel(record.contract, "de");
  const receivedAt = new Date(record.createdAt).toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    dateStyle: "long",
    timeStyle: "short",
  });
  const effectiveAt = record.effectiveAt
    ? new Date(record.effectiveAt).toLocaleDateString("de-DE", {
        timeZone: "Europe/Berlin",
        dateStyle: "long",
      })
    : null;

  await sendMail({
    to: record.email,
    ...cancellationMail({
      reference: record.reference,
      contract,
      receivedAt,
      effectiveAt,
      status: record.status,
      channel: record.channel,
      locale: "de",
    }),
    kind: "contract_request",
  });
  await sendMail({
    to: env.contactTo,
    ...contractRequestNotice({
      kind: "cancellation",
      reference: record.reference,
      email: record.email,
      name: record.name,
      contract,
      status: record.status,
      note: record.note,
      ip,
    }),
    kind: "contract_request",
  });

  logAudit({
    action: "cancellation.submitted",
    targetType: "contract_request",
    targetId: record.id,
    ip,
    meta: { reference: record.reference, status: record.status, channel: record.channel },
  });

  return json({ ok: true, reference: record.reference });
}
