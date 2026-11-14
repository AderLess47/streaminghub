import { logAudit } from "./audit";
import { all, get, run } from "./db";
import { env } from "./env";

/** Kontaktanfragen aus dem öffentlichen Formular. */
export const CONTACT_MESSAGE_STATUSES = ["new", "read", "handled"] as const;
export type ContactMessageStatus = (typeof CONTACT_MESSAGE_STATUSES)[number];

/** Standard sind 24 Monate, entsprechend der Datenschutzerklärung. */
export const CONTACT_RETENTION_DAYS = env.contactRetentionDays;

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  ip: string | null;
  createdAt: string;
};

const COLUMNS = `id, name, email, subject, message, status, ip, created_at AS createdAt`;

export function listContactMessages(
  filter: { status?: ContactMessageStatus; limit?: number } = {},
): ContactMessage[] {
  const limit = Math.min(Math.max(filter.limit ?? 200, 1), 500);
  if (!filter.status) {
    return all<ContactMessage>(
      `SELECT ${COLUMNS} FROM contact_messages
       ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'read' THEN 1 ELSE 2 END,
                created_at DESC
       LIMIT ?`,
      limit,
    );
  }
  return all<ContactMessage>(
    `SELECT ${COLUMNS} FROM contact_messages WHERE status = ? ORDER BY created_at DESC LIMIT ?`,
    filter.status,
    limit,
  );
}

export function contactMessageStats(): {
  new: number;
  read: number;
  handled: number;
  total: number;
} {
  const rows = all<{ status: string; c: number }>(
    `SELECT status, COUNT(*) AS c FROM contact_messages GROUP BY status`,
  );
  const count = (status: string) =>
    Number(rows.find((row) => row.status === status)?.c ?? 0);

  return {
    new: count("new"),
    read: count("read"),
    handled: count("handled"),
    total: rows.reduce((sum, row) => sum + Number(row.c), 0),
  };
}

export function setContactMessageStatus(id: string, status: ContactMessageStatus): boolean {
  const result = run(`UPDATE contact_messages SET status = ? WHERE id = ?`, status, id);
  return Number(result.changes ?? 0) > 0;
}

/**
 * Löscht Anfragen, die älter als die Aufbewahrungsfrist sind. Läuft beim Öffnen
 * des Posteingangs, damit keine manuelle Pflege nötig ist. Gibt die Anzahl der
 * gelöschten Zeilen zurück.
 */
export function purgeExpiredContactMessages(
  retentionDays: number = env.contactRetentionDays,
  now: Date = new Date(),
): number {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const result = run(`DELETE FROM contact_messages WHERE created_at < ?`, cutoff);
  const deleted = Number(result.changes ?? 0);
  if (deleted > 0) {
    logAudit({
      action: "contact_messages.purged",
      targetType: "contact_message",
      meta: { deleted, retentionDays, cutoff },
    });
  }
  return deleted;
}

/** Löscht eine Anfrage und gibt ihren Inhalt für den Audit-Eintrag zurück. */
export function deleteContactMessage(id: string): ContactMessage | undefined {
  const row = get<ContactMessage>(`SELECT ${COLUMNS} FROM contact_messages WHERE id = ?`, id);
  if (!row) return undefined;
  run(`DELETE FROM contact_messages WHERE id = ?`, id);
  return row;
}
