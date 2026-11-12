"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { hashPassword, randomToken, verifyPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { get, nowIso, run } from "@/lib/db";
import { env } from "@/lib/env";
import {
  sendMail,
  ticketCreatedMail,
  ticketCustomerReplyMail,
  ticketReceivedMail,
} from "@/lib/mail";
import { cancelSubscription, effectiveStatus, getSubscription } from "@/lib/payments";
import {
  currentSessionTokenHash,
  invalidateUserSessions,
  SESSION_COOKIE,
  requireUser,
} from "@/lib/session";
import {
  changePasswordSchema,
  dataRequestSchema,
  profileSchema,
  ticketSchema,
} from "@/lib/validation";
import { LOCALE_COOKIE } from "@/i18n/config";

export type ActionState = {
  ok: boolean;
  message: string;
  /** Meldung je Feld, Schlüssel ist das name-Attribut des Feldes. */
  fieldErrors?: Record<string, string>;
} | null;

const firstError = (issues: { message: string }[]) => issues[0]?.message ?? "Ungültige Eingabe.";

/** Erste Meldung je betroffenem Feld, damit das Formular sie am Feld anzeigen kann. */
const fieldErrorsOf = (issues: readonly { path: PropertyKey[]; message: string }[]) =>
  issues.reduce<Record<string, string>>((acc, issue) => {
    const key = String(issue.path[0] ?? "form");
    acc[key] ??= issue.message;
    return acc;
  }, {});

export async function removeDeviceAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const deviceId = String(formData.get("deviceId") ?? "");
  const device = get<{ id: string; name: string; user_id: string }>(
    `SELECT id, name, user_id FROM devices WHERE id = ? AND user_id = ?`,
    deviceId,
    user.id,
  );
  if (!device) return;

  run(
    `UPDATE devices SET status = 'revoked', revoked_at = ?, user_id = NULL WHERE id = ?`,
    nowIso(),
    deviceId,
  );
  run(`UPDATE device_tokens SET revoked_at = ? WHERE device_id = ?`, nowIso(), deviceId);
  logAudit({
    action: "device.revoked",
    actorId: user.id,
    actorEmail: user.email,
    targetType: "device",
    targetId: deviceId,
    meta: { name: device.name },
  });
  revalidatePath("/dashboard");
}

export async function updateProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName"),
    locale: formData.get("locale"),
    marketingOptIn: formData.get("marketingOptIn") === "on",
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: firstError(parsed.error.issues),
      fieldErrors: fieldErrorsOf(parsed.error.issues),
    };
  }

  run(
    `UPDATE users SET display_name = ?, locale = ?, marketing_opt_in = ?, updated_at = ? WHERE id = ?`,
    parsed.data.displayName,
    parsed.data.locale,
    parsed.data.marketingOptIn ? 1 : 0,
    nowIso(),
    user.id,
  );
  const store = await cookies();
  store.set(LOCALE_COOKIE, parsed.data.locale, {
    path: "/",
    sameSite: "lax",
    maxAge: 365 * 86_400,
    secure: process.env.NODE_ENV === "production",
  });

  logAudit({ action: "account.profile_updated", actorId: user.id, actorEmail: user.email });
  revalidatePath("/", "layout");
  return { ok: true, message: "Profil gespeichert." };
}

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: firstError(parsed.error.issues),
      fieldErrors: fieldErrorsOf(parsed.error.issues),
    };
  }

  const row = get<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id = ?`, user.id);
  if (!row || !verifyPassword(parsed.data.currentPassword, row.password_hash)) {
    return {
      ok: false,
      message: "Das aktuelle Passwort ist falsch.",
      fieldErrors: { currentPassword: "Das aktuelle Passwort ist falsch." },
    };
  }

  run(
    `UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`,
    hashPassword(parsed.data.newPassword),
    nowIso(),
    user.id,
  );
  const current = await currentSessionTokenHash();
  invalidateUserSessions(user.id, current ?? undefined);
  logAudit({ action: "account.password_changed", actorId: user.id, actorEmail: user.email });
  return { ok: true, message: "Passwort geändert. Andere Sitzungen wurden abgemeldet." };
}

export async function createTicketAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = ticketSchema.safeParse({
    subject: formData.get("subject"),
    category: formData.get("category"),
    message: formData.get("message"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: firstError(parsed.error.issues),
      fieldErrors: fieldErrorsOf(parsed.error.issues),
    };
  }

  const ticketId = randomToken(10);
  const now = nowIso();
  run(
    `INSERT INTO support_tickets (id, user_id, email, subject, category, status, priority, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'open', 'normal', ?, ?)`,
    ticketId,
    user.id,
    user.email,
    parsed.data.subject,
    parsed.data.category,
    now,
    now,
  );
  run(
    `INSERT INTO ticket_messages (id, ticket_id, author_type, author_name, body, created_at)
     VALUES (?, ?, 'customer', ?, ?, ?)`,
    randomToken(12),
    ticketId,
    user.displayName || user.email,
    parsed.data.message,
    now,
  );
  logAudit({
    action: "support.ticket_created",
    actorId: user.id,
    actorEmail: user.email,
    targetType: "ticket",
    targetId: ticketId,
  });

  const staffMail = ticketCreatedMail({
    ticketId,
    subject: parsed.data.subject,
    category: parsed.data.category,
    message: parsed.data.message,
    userName: user.displayName || user.email,
    userEmail: user.email,
  });
  await sendMail({ to: env.supportEmail, ...staffMail, kind: "ticket_update" });

  const receipt = ticketReceivedMail({
    ticketId,
    subject: parsed.data.subject,
    locale: user.locale,
  });
  await sendMail({ to: user.email, ...receipt, kind: "ticket_update" });

  revalidatePath("/dashboard/support");
  return { ok: true, message: "Deine Anfrage wurde erstellt." };
}

export async function replyTicketAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const ticketId = String(formData.get("ticketId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (body.length < 2 || body.length > 4000) {
    const message = "Bitte gib eine Antwort zwischen 2 und 4000 Zeichen ein.";
    return { ok: false, message, fieldErrors: { body: message } };
  }
  const ticket = get<{ id: string; subject: string }>(
    `SELECT id, subject FROM support_tickets WHERE id = ? AND user_id = ?`,
    ticketId,
    user.id,
  );
  if (!ticket) return { ok: false, message: "Anfrage nicht gefunden." };

  run(
    `INSERT INTO ticket_messages (id, ticket_id, author_type, author_name, body, created_at)
     VALUES (?, ?, 'customer', ?, ?, ?)`,
    randomToken(12),
    ticketId,
    user.displayName || user.email,
    body,
    nowIso(),
  );
  run(`UPDATE support_tickets SET status = 'open', updated_at = ? WHERE id = ?`, nowIso(), ticketId);

  const mail = ticketCustomerReplyMail({
    ticketId,
    subject: ticket.subject,
    body,
    userName: user.displayName || user.email,
    userEmail: user.email,
  });
  await sendMail({ to: env.supportEmail, ...mail, kind: "ticket_update" });

  revalidatePath(`/dashboard/support/${ticketId}`);
  revalidatePath("/dashboard/support");
  return { ok: true, message: "Antwort gesendet." };
}

export async function dataRequestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = dataRequestSchema.safeParse({
    kind: formData.get("kind"),
    confirm: formData.get("confirm") === "on",
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: firstError(parsed.error.issues),
      fieldErrors: fieldErrorsOf(parsed.error.issues),
    };
  }

  const row = get<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id = ?`, user.id);
  if (!row || !verifyPassword(parsed.data.password, row.password_hash)) {
    return { ok: false, message: "Das Passwort ist falsch.", fieldErrors: { password: "Das Passwort ist falsch." } };
  }

  run(
    `INSERT INTO data_requests (id, user_id, kind, status, created_at)
     VALUES (?, ?, ?, 'requested', ?)`,
    randomToken(12),
    user.id,
    parsed.data.kind,
    nowIso(),
  );
  logAudit({
    action: `privacy.${parsed.data.kind}_requested`,
    actorId: user.id,
    actorEmail: user.email,
  });
  revalidatePath("/dashboard/settings");

  return {
    ok: true,
    message:
      parsed.data.kind === "export"
        ? "Deine Exportanfrage wurde erfasst. Du kannst den Export unten herunterladen."
        : "Deine Löschungsanfrage wurde erfasst. Wir prüfen sie und bestätigen sie per E-Mail.",
  };
}

export async function signOutOtherSessionsAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const current = await currentSessionTokenHash();
  invalidateUserSessions(user.id, current ?? undefined);
  logAudit({ action: "account.sessions_revoked", actorId: user.id, actorEmail: user.email });
  return { ok: true, message: "Andere Sitzungen wurden abgemeldet." };
}

export async function cancelSubscriptionAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const result = await cancelSubscription(user.id);
  logAudit({
    action: "subscription.cancel_requested",
    actorId: user.id,
    actorEmail: user.email,
    meta: { ok: result.ok },
  });
  revalidatePath("/dashboard/subscription");
  return { ok: result.ok, message: result.message };
}

export async function dashboardBootstrapCheck() {
  // Keeps session cookie helpers imported in this module's server context.
  const store = await cookies();
  return Boolean(store.get(SESSION_COOKIE));
}
