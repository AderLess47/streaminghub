import { randomToken } from "./auth";
import { nowIso, run } from "./db";
import { env } from "./env";

export type AuditInput = {
  action: string;
  actorId?: string | null;
  actorEmail?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown>;
};

export const AUDIT_RETENTION_DAYS = env.auditRetentionDays;

/**
 * Löscht Sicherheitsprotokolle nach der Aufbewahrungsfrist (Standard 90 Tage,
 * wie in der Datenschutzerklärung zugesagt). Läuft beim Öffnen des
 * Sicherheitsprotokolls und täglich im Container.
 */
export function purgeExpiredAuditLog(
  retentionDays: number = AUDIT_RETENTION_DAYS,
  now: Date = new Date(),
): number {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const result = run(`DELETE FROM audit_log WHERE created_at < ?`, cutoff);
  const deleted = Number(result.changes ?? 0);
  if (deleted > 0) {
    // Der Löschvorgang selbst bleibt nachvollziehbar; die Zeile ist neu und
    // fällt erst nach Ablauf der Frist wieder heraus.
    logAudit({
      action: "audit.purged",
      targetType: "audit_log",
      meta: { deleted, retentionDays, cutoff },
    });
  }
  return deleted;
}

/** Append-only security/audit trail. Never log secrets, tokens or passwords. */
export function logAudit(input: AuditInput) {
  try {
    run(
      `INSERT INTO audit_log (id, actor_id, actor_email, action, target_type, target_id, ip, user_agent, meta, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      randomToken(12),
      input.actorId ?? null,
      input.actorEmail ?? null,
      input.action,
      input.targetType ?? null,
      input.targetId ?? null,
      input.ip ?? null,
      (input.userAgent ?? "").slice(0, 300),
      input.meta ? JSON.stringify(input.meta).slice(0, 4000) : null,
      nowIso(),
    );
  } catch (error) {
    console.error("audit log failed", error);
  }
}
