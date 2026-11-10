import { issueAuthToken } from "@/lib/auth";
import { apiError, clientIp, isSameOrigin, json, parseBody, tooManyRequests } from "@/lib/api";
import { get } from "@/lib/db";
import { env, isEmailConfigured } from "@/lib/env";
import { resetMail, sendMail } from "@/lib/mail";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { forgotPasswordSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("forbidden", "Ungültige Herkunft der Anfrage.");

  const ip = clientIp(request);
  const ipLimit = rateLimit(rateLimitKey("forgot:ip", ip), 10, 3600);
  if (!ipLimit.allowed) return tooManyRequests(ipLimit.retryAfterSeconds);

  const parsed = await parseBody(request, forgotPasswordSchema);
  if (!parsed.ok) return parsed.response;
  const email = parsed.data.email.toLowerCase();

  const emailLimit = rateLimit(rateLimitKey("forgot:email", email), 3, 3600);
  if (!emailLimit.allowed) return tooManyRequests(emailLimit.retryAfterSeconds);

  const user = get<{ id: string; locale: string; disabled_at: string | null }>(
    `SELECT id, locale, disabled_at FROM users WHERE email = ?`,
    email,
  );

  let devLink: string | undefined;
  if (user && !user.disabled_at) {
    const { raw } = issueAuthToken(user.id, "reset_password", 3600);
    const resetUrl = `${env.appUrl}/reset-password?token=${encodeURIComponent(raw)}`;
    const mail = resetMail(resetUrl, user.locale);
    await sendMail({ to: email, subject: mail.subject, text: mail.text, kind: "reset_password" });
    if (env.email.showDevHints && !isEmailConfigured()) devLink = resetUrl;
  }

  // Always identical response – no account enumeration.
  return json({ ok: true, devLink });
}
