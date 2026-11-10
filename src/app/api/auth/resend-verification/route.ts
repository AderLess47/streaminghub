import { issueAuthToken } from "@/lib/auth";
import { apiError, clientIp, isSameOrigin, json, tooManyRequests } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { env, isEmailConfigured } from "@/lib/env";
import { sendMail, verificationMail } from "@/lib/mail";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("forbidden", "Ungültige Herkunft der Anfrage.");

  const user = await getSessionUser();
  if (!user) return apiError("unauthorized", "Bitte melde dich an.");

  const ip = clientIp(request);
  const limit = rateLimit(rateLimitKey("verify:user", user.id), 3, 3600);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  if (user.emailVerified) return json({ ok: true, alreadyVerified: true });

  const { raw } = issueAuthToken(user.id, "verify_email", 48 * 3600);
  const verifyUrl = `${env.appUrl}/api/auth/verify?token=${encodeURIComponent(raw)}`;
  const mail = verificationMail(verifyUrl, user.locale);
  const delivery = await sendMail({
    to: user.email,
    subject: mail.subject,
    text: mail.text,
    kind: "verify_email",
  });

  logAudit({ action: "auth.verification_resent", actorId: user.id, actorEmail: user.email, ip });

  return json({
    ok: true,
    delivered: delivery.delivered,
    devLink: env.email.showDevHints && !isEmailConfigured() ? verifyUrl : undefined,
  });
}
