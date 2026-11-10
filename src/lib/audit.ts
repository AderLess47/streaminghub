import { randomToken } from "./auth";
import { nowIso, run } from "./db";

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
