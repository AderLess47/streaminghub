import { apiError, clientIp, isSameOrigin, json, tooManyRequests } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { backupAvailability, createBackup, listBackups } from "@/lib/backup";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/session";
import { backupFailure } from "./shared";

export const runtime = "nodejs";

/** Anzeige für das Kundenkonto: Verfügbarkeit und vorhandene Sicherungen. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return apiError("unauthorized", "Bitte melde dich an.");

  const availability = backupAvailability(user.id);
  const backups = listBackups(user.id);
  return json({
    available: availability.available,
    reason: availability.available ? null : availability.reason,
    backups,
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("unauthorized", "Bitte melde dich an.");
  if (!isSameOrigin(request)) return apiError("forbidden", "Ungültige Herkunft.");

  const limit = rateLimit(rateLimitKey("backup:create", user.id), 5, 3600);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  try {
    const record = await createBackup(user.id);
    logAudit({
      action: "backup.created",
      actorId: user.id,
      actorEmail: user.email,
      ip: clientIp(request),
      targetType: "cloud_backup",
      targetId: record.id,
    });
    return json({ backup: record }, { status: 201 });
  } catch (error) {
    return backupFailure(error);
  }
}
