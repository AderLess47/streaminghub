import { z } from "zod";
import { apiError, clientIp, isSameOrigin, json, parseBody, tooManyRequests } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { acceptRetentionOffer, declineRetentionOffer } from "@/lib/retention";
import type { RetentionUnavailable } from "@/lib/retention";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";

const bodySchema = z.object({ decision: z.enum(["accept", "decline"]) });

/**
 * Grund → HTTP-Code. Ein abgeschaltetes oder nicht vorhandenes Angebot ist wie
 * eine fehlende Funktion (404); alles andere ist ein Konflikt mit dem
 * Abozustand. Ein Anbieterfehler bleibt ein Konflikt: der Versuch ist
 * wiederholbar, die Sitzung ist gültig.
 */
const statusByReason: Record<RetentionUnavailable | "provider_error", "not_found" | "conflict"> =
  {
    disabled: "not_found",
    not_configured: "not_found",
    not_active: "conflict",
    store_channel: "conflict",
    already_scheduled: "conflict",
    already_decided: "conflict",
    provider_error: "conflict",
  };

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("forbidden", "Ungültige Herkunft der Anfrage.");

  const user = await getSessionUser();
  if (!user) return apiError("unauthorized", "Bitte melde dich an.");

  const ip = clientIp(request);
  const limit = rateLimit(rateLimitKey("retention:user", user.id), 5, 600);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const parsed = await parseBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  const outcome =
    parsed.data.decision === "accept"
      ? await acceptRetentionOffer(user.id)
      : declineRetentionOffer(user.id);

  logAudit({
    action: "subscription.retention_decision",
    actorId: user.id,
    actorEmail: user.email,
    ip,
    meta: {
      decision: parsed.data.decision,
      ok: outcome.ok,
      reason: outcome.ok ? null : outcome.reason,
    },
  });

  if (!outcome.ok) {
    return apiError(statusByReason[outcome.reason], outcome.message, {
      reason: outcome.reason,
    });
  }

  return json({ ok: true, outcome: outcome.outcome });
}
