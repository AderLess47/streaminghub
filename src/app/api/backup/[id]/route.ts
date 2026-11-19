import { apiError, clientIp, isSameOrigin, json } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { deleteBackup } from "@/lib/backup";
import { getSessionUser } from "@/lib/session";
import { backupFailure } from "../shared";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return apiError("unauthorized", "Bitte melde dich an.");
  if (!isSameOrigin(request)) return apiError("forbidden", "Ungültige Herkunft.");

  const { id } = await params;
  try {
    await deleteBackup(user.id, id);
    logAudit({
      action: "backup.deleted",
      actorId: user.id,
      actorEmail: user.email,
      ip: clientIp(request),
      targetType: "cloud_backup",
      targetId: id,
    });
    return json({ ok: true });
  } catch (error) {
    return backupFailure(error);
  }
}
