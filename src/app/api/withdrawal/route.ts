import { apiError, clientIp, isSameOrigin, json, parseBody, tooManyRequests } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { contractLabel, recordWithdrawal } from "@/lib/contract-requests";
import { env } from "@/lib/env";
import { contractRequestNotice, sendMail, withdrawalMail } from "@/lib/mail";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { withdrawalSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Widerruf nach § 356a BGB. Die Erklärung ist mit dem Absenden abgegeben; die
 * Antwort enthält die Referenz, unter der die Bestätigungsseite den Datensatz
 * anzeigt. Zusätzlich geht eine Bestätigung per E-Mail raus.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return apiError("forbidden", "Ungültige Herkunft der Anfrage.");
  }

  const ip = clientIp(request);
  const limit = rateLimit(rateLimitKey("withdrawal:ip", ip), 5, 3600);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const parsed = await parseBody(request, withdrawalSchema);
  if (!parsed.ok) return parsed.response;
  const data = parsed.data;

  if (data.website) return json({ ok: true, reference: "" });
  if (data.renderedAt && Date.now() - data.renderedAt < 2500) {
    return apiError("invalid_request", "Bitte prüfe deine Angaben und sende das Formular erneut.");
  }

  const record = recordWithdrawal({
    name: data.name,
    email: data.email,
    contract: data.contract,
    note: data.note,
    ip,
  });

  const contract = contractLabel(data.contract, "de");
  const receivedAt = new Date(record.createdAt).toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    dateStyle: "long",
    timeStyle: "short",
  });

  await sendMail({
    to: record.email,
    ...withdrawalMail({ reference: record.reference, name: record.name, contract, receivedAt, locale: "de" }),
    kind: "contract_request",
  });
  await sendMail({
    to: env.contactTo,
    ...contractRequestNotice({
      kind: "withdrawal",
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
    action: "withdrawal.submitted",
    targetType: "contract_request",
    targetId: record.id,
    ip,
    meta: { reference: record.reference, contract: data.contract },
  });

  return json({ ok: true, reference: record.reference });
}
