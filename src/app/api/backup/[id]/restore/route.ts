import { apiError, clientIp, isSameOrigin, json, tooManyRequests } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { restoreBackup } from "@/lib/backup";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/session";
import { backupFailure } from "../../shared";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return apiError("unauthorized", "Bitte melde dich an.");
  if (!isSameOrigin(request)) return apiError("forbidden", "Ungültige Herkunft.");

  const limit = rateLimit(rateLimitKey("backup:restore", user.id), 10, 3600);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const { id } = await params;
  try {
    const result = await restoreBackup(user.id, id);
    logAudit({
      action: "backup.restored",
      actorId: user.id,
      actorEmail: user.email,
      ip: clientIp(request),
      targetType: "cloud_backup",
      targetId: id,
      meta: { progress: result.progress, playlist: result.playlist },
    });
    return json({ restored: result });
  } catch (error) {
    return backupFailure(error);
  }
}
