import { apiError, clientIp, json, tooManyRequests } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { all, get, nowIso, run } from "@/lib/db";
import { getSubscription } from "@/lib/payments";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";

/** GDPR data export (Art. 15/20). Requires an authenticated session. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("unauthorized", "Bitte melde dich an.");

  const ip = clientIp(request);
  const limit = rateLimit(rateLimitKey("export:user", user.id), 3, 3600);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const account = get<{
    id: string;
    email: string;
    display_name: string;
    locale: string;
    role: string;
    email_verified: number;
    marketing_opt_in: number;
    created_at: string;
    last_login_at: string | null;
  }>(
    `SELECT id, email, display_name, locale, role, email_verified, marketing_opt_in, created_at, last_login_at
     FROM users WHERE id = ?`,
    user.id,
  );

  const exportData = {
    exportedAt: nowIso(),
    notice:
      "Maschinenlesbarer Datenexport gemäß Art. 15 und 20 DSGVO. Passwort-Hashes, Sitzungstoken und Kopplungscode-Hashes sind aus Sicherheitsgründen nicht enthalten.",
    account,
    playlist: get<{
      url: string;
      device_id: string | null;
      device_name: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT p.url, p.device_id, d.name AS device_name, p.created_at, p.updated_at
       FROM customer_playlists p
       LEFT JOIN devices d ON d.id = p.device_id
       WHERE p.user_id = ? AND p.customer_requested = 1`,
      user.id,
    ) ?? null,
    devices: all(
      `SELECT id, name, platform, app_version, status, activated_at, revoked_at, created_at
       FROM devices WHERE user_id = ?`,
      user.id,
    ),
    subscription: getSubscription(user.id),
    tickets: all(
      `SELECT t.id, t.subject, t.category, t.status, t.created_at,
              (SELECT json_group_array(json_object('author', m.author_type, 'body', m.body, 'createdAt', m.created_at))
               FROM ticket_messages m WHERE m.ticket_id = t.id AND m.author_type != 'internal') AS messages
       FROM support_tickets t WHERE t.user_id = ?`,
      user.id,
    ),
    legalAcceptances: all(
      `SELECT document, version, accepted_at FROM legal_acceptances WHERE user_id = ?`,
      user.id,
    ),
    dataRequests: all(
      `SELECT kind, status, created_at, processed_at FROM data_requests WHERE user_id = ?`,
      user.id,
    ),
  };

  run(
    `UPDATE data_requests SET status = 'completed', processed_at = ?
     WHERE user_id = ? AND kind = 'export' AND status = 'requested'`,
    nowIso(),
    user.id,
  );
  logAudit({ action: "privacy.export_downloaded", actorId: user.id, actorEmail: user.email, ip });

  return new Response(JSON.stringify(exportData, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="streaminghub-datenexport-${user.id}.json"`,
      "cache-control": "no-store",
    },
  });
}
