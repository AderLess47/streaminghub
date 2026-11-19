import { apiError, clientIp, isSameOrigin, json, tooManyRequests } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/session";
import { startTrial, type TrialRejection } from "@/lib/trial";

export const runtime = "nodejs";

/**
 * Ablehnungsgrund → HTTP-Code. „disabled“ ist ein abgeschaltetes Feature und
 * verhält sich wie eine nicht vorhandene Funktion; fehlende E-Mail-Bestätigung
 * ist ein Recht, alles andere ein Konflikt mit dem Kontozustand.
 */
const statusByRejection: Record<
  TrialRejection,
  "not_found" | "forbidden" | "conflict"
> = {
  disabled: "not_found",
  email_unverified: "forbidden",
  already_active: "conflict",
  checkout_pending: "conflict",
  already_used: "conflict",
  payment_history: "conflict",
};

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("forbidden", "Ungültige Herkunft der Anfrage.");

  const user = await getSessionUser();
  if (!user) return apiError("unauthorized", "Bitte melde dich an.");

  const ip = clientIp(request);
  // Ein Trial pro Konto ist fachlich ausgeschlossen; das Limit bremst nur
  // wiederholte Versuche und damit auch Mailversand.
  const limit = rateLimit(rateLimitKey("trial:user", user.id), 3, 3600);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const outcome = await startTrial({ userId: user.id, source: "web" });

  logAudit({
    action: "subscription.trial_attempt",
    actorId: user.id,
    actorEmail: user.email,
    ip,
    meta: { ok: outcome.ok, code: outcome.ok ? null : outcome.code },
  });

  if (!outcome.ok) {
    return apiError(statusByRejection[outcome.code], outcome.message, {
      reason: outcome.code,
    });
  }

  return json({
    ok: true,
    trialEndsAt: outcome.trialEndsAt,
    trialDays: outcome.trialDays,
  });
}
