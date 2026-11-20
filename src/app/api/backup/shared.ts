import { apiError } from "@/lib/api";
import { BackupError } from "@/lib/backup";
import { R2RequestError } from "@/lib/r2";

/**
 * Übersetzt Backup-Fehler in API-Antworten. Bewusst ohne Details aus dem
 * Speicher: R2-Meldungen können Bucket-Namen und Schlüssel enthalten.
 */
export function backupFailure(error: unknown) {
  if (error instanceof BackupError) {
    switch (error.code) {
      case "disabled":
        return apiError("forbidden", "Cloud-Backup ist derzeit nicht verfügbar.");
      case "not_configured":
        return apiError("not_configured", "Cloud-Backup ist noch nicht eingerichtet.");
      case "premium_required":
        return apiError("premium_required", "Cloud-Backup gehört zu Premium.");
      case "too_large":
        return apiError("invalid_request", "Die Sicherung ist zu groß.");
      case "not_found":
        return apiError("not_found", "Diese Sicherung gibt es nicht mehr.");
      case "corrupt":
        return apiError("server_error", "Diese Sicherung ist nicht lesbar.");
    }
  }
  if (error instanceof R2RequestError) {
    // Status und Fehlercode helfen bei der Einrichtung, ohne den Body zu zeigen.
    console.error("cloud backup storage failed:", error.message);
    return apiError(
      "server_error",
      `Der Speicher hat abgelehnt (${error.status}${error.code ? ` ${error.code}` : ""}).`,
    );
  }
  console.error("cloud backup failed:", error instanceof Error ? error.message : error);
  return apiError("server_error", "Das Backup ist fehlgeschlagen.");
}
