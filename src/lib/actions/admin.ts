"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { get, nowIso, run } from "@/lib/db";
import { generateRecoveryCodes, generateTotpSecret, verifyTotp } from "@/lib/totp";
import { resendMail, sendMail, ticketReplyMail } from "@/lib/mail";
import { requireAdmin, requireStaff, getSessionUser } from "@/lib/session";
import { m3uPlaylistSchema } from "@/lib/validation";

export type MfaState = {
  ok: boolean;
  message: string;
  recoveryCodes?: string[];
} | null;

const ROLE_VALUES = ["customer", "support", "admin"] as const;
type RoleValue = (typeof ROLE_VALUES)[number];

function adminPath(formData: FormData, fallback: string) {
  const raw = String(formData.get("returnTo") ?? "");
  return raw.startsWith("/admin") ? raw : fallback;
}

function fail(message: string): never {
  redirect(`/admin?error=${encodeURIComponent(message)}`);
}

function playlistHost(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

export async function updateCustomerRoleAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!ROLE_VALUES.includes(role as RoleValue)) return;

  const target = get<{ id: string; email: string; role: string }>(
    `SELECT id, email, role FROM users WHERE id = ?`,
    userId,
  );
  if (!target) return;

  if (target.role === "admin" && role !== "admin") {
    const admins = get<{ c: number }>(`SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND disabled_at IS NULL`)?.c ?? 0;
    if (admins <= 1) fail("Der letzte Administrator kann seine Rolle nicht verlieren.");
  }

  run(`UPDATE users SET role = ?, updated_at = ? WHERE id = ?`, role, nowIso(), userId);
  logAudit({
    action: "admin.role_changed",
    actorId: admin.id,
    actorEmail: admin.email,
    targetType: "user",
    targetId: userId,
    meta: { from: target.role, to: role, targetEmail: target.email },
  });
  revalidatePath("/admin/customers");
  redirect(`${adminPath(formData, "/admin/customers")}?ok=role`);
}

export async function toggleCustomerDisabledAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const disable = String(formData.get("disable") ?? "") === "1";
  if (userId === admin.id) fail("Das eigene Konto kann nicht deaktiviert werden.");

  const target = get<{ email: string }>(`SELECT email FROM users WHERE id = ?`, userId);
  if (!target) return;

  run(
    `UPDATE users SET disabled_at = ?, updated_at = ? WHERE id = ?`,
    disable ? nowIso() : null,
    nowIso(),
    userId,
  );
  if (disable) run(`DELETE FROM sessions WHERE user_id = ?`, userId);

  logAudit({
    action: disable ? "admin.customer_disabled" : "admin.customer_enabled",
    actorId: admin.id,
    actorEmail: admin.email,
    targetType: "user",
    targetId: userId,
    meta: { targetEmail: target.email },
  });
  revalidatePath("/admin/customers");
  redirect(`${adminPath(formData, "/admin/customers")}?ok=status`);
}

export async function resetCustomerMfaAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  run(`DELETE FROM mfa_secrets WHERE user_id = ?`, userId);
  logAudit({
    action: "admin.mfa_reset",
    actorId: admin.id,
    actorEmail: admin.email,
    targetType: "user",
    targetId: userId,
  });
  revalidatePath("/admin/customers");
  redirect(`${adminPath(formData, "/admin/customers")}?ok=mfa`);
}

export async function saveCustomerPlaylistAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const returnTo = adminPath(formData, `/admin/customers/${userId}`);
  const target = get<{ email: string }>(`SELECT email FROM users WHERE id = ?`, userId);
  if (!target) return;

  const customerRequested = String(formData.get("customerRequested") ?? "") === "1";
  if (!customerRequested) redirect(`${returnTo}?error=playlist-request`);

  const parsed = m3uPlaylistSchema.safeParse({
    url: formData.get("url"),
    deviceId: formData.get("deviceId"),
  });
  if (!parsed.success) {
    const deviceIssue = parsed.error.issues.some((issue) => issue.path[0] === "deviceId");
    redirect(`${returnTo}?error=${deviceIssue ? "playlist-device" : "playlist"}`);
  }

  const device = get<{ id: string; name: string; status: string }>(
    `SELECT id, name, status FROM devices WHERE id = ? AND user_id = ?`,
    parsed.data.deviceId,
    userId,
  );
  if (!device || device.status !== "active") {
    redirect(`${returnTo}?error=playlist-device`);
  }

  const existing = get<{ user_id: string }>(
    `SELECT user_id FROM customer_playlists WHERE user_id = ?`,
    userId,
  );
  const now = nowIso();
  run(
    `INSERT INTO customer_playlists (user_id, device_id, url, updated_by, customer_requested, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       device_id = excluded.device_id,
       url = excluded.url,
       updated_by = excluded.updated_by,
       customer_requested = 1,
       updated_at = excluded.updated_at`,
    userId,
    parsed.data.deviceId,
    parsed.data.url,
    admin.id,
    now,
    now,
  );

  logAudit({
    action: existing ? "admin.customer_playlist_updated" : "admin.customer_playlist_added",
    actorId: admin.id,
    actorEmail: admin.email,
    targetType: "customer_playlist",
    targetId: userId,
    meta: {
      targetEmail: target.email,
      host: playlistHost(parsed.data.url),
      customerRequested: true,
      deviceId: device.id,
      deviceName: device.name,
    },
  });
  revalidatePath(`/admin/customers/${userId}`);
  redirect(`${returnTo}?ok=playlist`);
}

export async function deleteCustomerPlaylistAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const returnTo = adminPath(formData, `/admin/customers/${userId}`);
  const target = get<{ email: string }>(`SELECT email FROM users WHERE id = ?`, userId);
  if (!target) return;

  const existing = get<{ url: string }>(
    `SELECT url FROM customer_playlists WHERE user_id = ?`,
    userId,
  );
  if (!existing) return;

  run(`DELETE FROM customer_playlists WHERE user_id = ?`, userId);
  logAudit({
    action: "admin.customer_playlist_deleted",
    actorId: admin.id,
    actorEmail: admin.email,
    targetType: "customer_playlist",
    targetId: userId,
    meta: { targetEmail: target.email, host: playlistHost(existing.url) },
  });
  revalidatePath(`/admin/customers/${userId}`);
  redirect(`${returnTo}?ok=playlist-deleted`);
}

export async function revokeDeviceAction(formData: FormData) {
  const staff = await requireStaff();
  const deviceId = String(formData.get("deviceId") ?? "");
  const device = get<{ name: string; user_id: string | null }>(
    `SELECT name, user_id FROM devices WHERE id = ?`,
    deviceId,
  );
  if (!device) return;

  run(`UPDATE devices SET status = 'revoked', revoked_at = ? WHERE id = ?`, nowIso(), deviceId);
  run(`UPDATE device_tokens SET revoked_at = ? WHERE device_id = ?`, nowIso(), deviceId);
  logAudit({
    action: "admin.device_revoked",
    actorId: staff.id,
    actorEmail: staff.email,
    targetType: "device",
    targetId: deviceId,
    meta: { name: device.name },
  });
  revalidatePath("/admin/devices");
  redirect(`${adminPath(formData, "/admin/devices")}?ok=revoked`);
}

export async function setSubscriptionStatusAction(formData: FormData) {
  const staff = await requireStaff();
  const userId = String(formData.get("userId") ?? "");
  const status = String(formData.get("status") ?? "");
  const allowed = ["none", "pending", "active", "past_due", "canceled", "incomplete"];
  if (!allowed.includes(status)) return;

  const existing = get<{ id: string; status: string }>(
    `SELECT id, status FROM subscriptions WHERE user_id = ?`,
    userId,
  );
  if (!existing) return;

  run(
    `UPDATE subscriptions SET status = ?, updated_at = ? WHERE user_id = ?`,
    status,
    nowIso(),
    userId,
  );
  logAudit({
    action: "admin.subscription_status_changed",
    actorId: staff.id,
    actorEmail: staff.email,
    targetType: "subscription",
    targetId: userId,
    meta: { from: existing.status, to: status },
  });
  revalidatePath("/admin/subscriptions");
  redirect(`${adminPath(formData, "/admin/subscriptions")}?ok=status`);
}

export async function blockPairingCodeAction(formData: FormData) {
  const staff = await requireStaff();
  const requestId = String(formData.get("requestId") ?? "");
  run(
    `UPDATE pairing_requests SET attempts = 99, expires_at = ? WHERE id = ? AND claimed_at IS NULL`,
    nowIso(),
    requestId,
  );
  logAudit({
    action: "admin.pairing_code_blocked",
    actorId: staff.id,
    actorEmail: staff.email,
    targetType: "pairing_request",
    targetId: requestId,
  });
  revalidatePath("/admin/pairing");
  redirect(`${adminPath(formData, "/admin/pairing")}?ok=blocked`);
}

export async function replyTicketAction(formData: FormData) {
  const staff = await requireStaff();
  const ticketId = String(formData.get("ticketId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const status = String(formData.get("status") ?? "pending");
  if (body.length < 2) return;

  const ticket = get<{ id: string; subject: string; email: string; locale: string }>(
    `SELECT t.id, t.subject, t.email, u.locale
     FROM support_tickets t JOIN users u ON u.id = t.user_id
     WHERE t.id = ?`,
    ticketId,
  );
  if (!ticket) return;

  run(
    `INSERT INTO ticket_messages (id, ticket_id, author_type, author_name, body, created_at)
     VALUES (?, ?, 'staff', ?, ?, ?)`,
    randomToken(12),
    ticketId,
    `Support (${staff.displayName || staff.email})`,
    body.slice(0, 5000),
    nowIso(),
  );
  run(`UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?`, status, nowIso(), ticketId);
  const mail = ticketReplyMail({
    ticketId,
    subject: ticket.subject,
    body: body.slice(0, 5000),
    locale: ticket.locale,
  });
  await sendMail({ to: ticket.email, ...mail, kind: "ticket_update" });

  logAudit({
    action: "admin.ticket_replied",
    actorId: staff.id,
    actorEmail: staff.email,
    targetType: "ticket",
    targetId: ticketId,
  });
  revalidatePath(`/admin/tickets/${ticketId}`);
  redirect(`/admin/tickets/${ticketId}?ok=reply`);
}

export async function setTicketStatusAction(formData: FormData) {
  const staff = await requireStaff();
  const ticketId = String(formData.get("ticketId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["open", "pending", "closed"].includes(status)) return;

  run(`UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?`, status, nowIso(), ticketId);
  logAudit({
    action: "admin.ticket_status_changed",
    actorId: staff.id,
    actorEmail: staff.email,
    targetType: "ticket",
    targetId: ticketId,
    meta: { status },
  });
  revalidatePath(`/admin/tickets/${ticketId}`);
  redirect(`/admin/tickets/${ticketId}?ok=status`);
}

export async function releaseEmailSuppressionAction(formData: FormData) {
  const admin = await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return;
  run(`DELETE FROM email_suppressions WHERE email = ?`, email);
  logAudit({
    action: "admin.email_suppression_released",
    actorId: admin.id,
    actorEmail: admin.email,
    targetType: "email",
    targetId: email,
  });
  revalidatePath("/admin/emails");
  redirect("/admin/emails?ok=suppression");
}

export async function retryEmailAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("emailId") ?? "");
  const result = await resendMail(id);
  logAudit({
    action: "admin.email_retry",
    actorId: admin.id,
    actorEmail: admin.email,
    targetType: "outbox_email",
    targetId: id,
    meta: { delivered: result.delivered, reason: result.reason },
  });
  revalidatePath("/admin/emails");
  redirect(`/admin/emails?ok=${result.delivered ? "sent" : "failed"}`);
}

export async function saveSettingsAction(formData: FormData) {
  const admin = await requireAdmin();
  const keys = ["announcement_de", "announcement_en", "product_summary_de", "product_summary_en"];
  for (const key of keys) {
    if (!formData.has(key)) continue;
    const value = String(formData.get(key) ?? "").slice(0, 4000);
    run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      key,
      value,
      nowIso(),
    );
  }
  logAudit({ action: "admin.settings_updated", actorId: admin.id, actorEmail: admin.email });
  revalidatePath("/admin/content");
  revalidatePath("/status");
  redirect("/admin/content?ok=settings");
}

export async function saveFaqAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("faqId") ?? "");
  const values = {
    category: String(formData.get("category") ?? "account").slice(0, 40),
    question_de: String(formData.get("questionDe") ?? "").slice(0, 300),
    answer_de: String(formData.get("answerDe") ?? "").slice(0, 4000),
    question_en: String(formData.get("questionEn") ?? "").slice(0, 300),
    answer_en: String(formData.get("answerEn") ?? "").slice(0, 4000),
    sort_order: Number(formData.get("sortOrder") ?? 0) || 0,
    published: formData.get("published") === "on" ? 1 : 0,
  };
  if (!values.question_de || !values.answer_de) return;

  if (id) {
    run(
      `UPDATE faq_items SET category = ?, question_de = ?, answer_de = ?, question_en = ?, answer_en = ?,
        sort_order = ?, published = ?, updated_at = ? WHERE id = ?`,
      values.category,
      values.question_de,
      values.answer_de,
      values.question_en,
      values.answer_en,
      values.sort_order,
      values.published,
      nowIso(),
      id,
    );
  } else {
    run(
      `INSERT INTO faq_items (id, category, sort_order, question_de, answer_de, question_en, answer_en, published, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      randomToken(10),
      values.category,
      values.sort_order,
      values.question_de,
      values.answer_de,
      values.question_en,
      values.answer_en,
      values.published,
      nowIso(),
    );
  }

  logAudit({
    action: id ? "admin.faq_updated" : "admin.faq_created",
    actorId: admin.id,
    actorEmail: admin.email,
    targetType: "faq",
    targetId: id || null,
  });
  revalidatePath("/admin/content");
  revalidatePath("/faq");
  redirect("/admin/content?ok=faq");
}

export async function deleteFaqAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("faqId") ?? "");
  run(`DELETE FROM faq_items WHERE id = ?`, id);
  logAudit({
    action: "admin.faq_deleted",
    actorId: admin.id,
    actorEmail: admin.email,
    targetType: "faq",
    targetId: id,
  });
  revalidatePath("/admin/content");
  revalidatePath("/faq");
  redirect("/admin/content?ok=deleted");
}

/* ------------------------------ MFA enrollment ----------------------------- */

export async function startMfaSetupAction() {
  const user = await getSessionUser();
  if (!user || (user.role !== "admin" && user.role !== "support")) {
    redirect("/dashboard?error=forbidden");
  }
  const existing = get<{ confirmed_at: string | null }>(
    `SELECT confirmed_at FROM mfa_secrets WHERE user_id = ?`,
    user.id,
  );
  if (existing?.confirmed_at) redirect("/admin");

  if (!existing) {
    run(
      `INSERT INTO mfa_secrets (user_id, secret, recovery_codes, created_at) VALUES (?, ?, '[]', ?)`,
      user.id,
      generateTotpSecret(),
      nowIso(),
    );
  }
  revalidatePath("/admin/mfa");
}

export async function confirmMfaSetupAction(_prev: MfaState, formData: FormData): Promise<MfaState> {
  const user = await getSessionUser();
  if (!user || (user.role !== "admin" && user.role !== "support")) {
    return { ok: false, message: "Nicht berechtigt." };
  }
  const code = String(formData.get("code") ?? "").trim();
  const row = get<{ secret: string; confirmed_at: string | null }>(
    `SELECT secret, confirmed_at FROM mfa_secrets WHERE user_id = ?`,
    user.id,
  );
  if (!row) return { ok: false, message: "Kein Einrichtungsvorgang gefunden. Bitte Seite neu laden." };
  if (row.confirmed_at) return { ok: true, message: "MFA ist bereits aktiv." };

  if (!verifyTotp(row.secret, code)) {
    logAudit({ action: "admin.mfa_setup_failed", actorId: user.id, actorEmail: user.email });
    return { ok: false, message: "Der Code ist ungültig. Bitte prüfe die Uhrzeit deines Geräts." };
  }

  const recoveryCodes = generateRecoveryCodes();
  run(
    `UPDATE mfa_secrets SET confirmed_at = ?, recovery_codes = ? WHERE user_id = ?`,
    nowIso(),
    JSON.stringify(recoveryCodes),
    user.id,
  );
  logAudit({ action: "admin.mfa_enabled", actorId: user.id, actorEmail: user.email });
  revalidatePath("/admin/mfa");
  return { ok: true, message: "MFA ist aktiv.", recoveryCodes };
}

