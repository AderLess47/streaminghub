/**
 * Support-Ticket vom Kunden bis zur Admin-Antwort: Anlage, Benachrichtigungen,
 * Kundenantwort, Staff-Antwort, Statuswechsel und Rechte.
 *
 * Aufruf: npm run test:support-tickets
 */

import assert from "node:assert/strict";
import { sessionToken } from "./fakes/next-headers.ts";
import { RedirectError } from "./fakes/next-navigation.ts";
import { revalidated } from "./fakes/next-cache.ts";

process.env.APP_URL = "https://streaminghub.org";
process.env.EMAIL_API_KEY = "";

const { all, get, nowIso, run } = await import("@/lib/db");
const { hashPassword } = await import("@/lib/auth");
const { createSession } = await import("@/lib/session");
const { ensureSubscription } = await import("@/lib/payments");
const {
  createTicketAction,
  replyTicketAction: customerReply,
} = await import("@/lib/actions/dashboard");
const {
  replyTicketAction: staffReply,
  setTicketStatusAction,
} = await import("@/lib/actions/admin");

const results: { name: string; ok: boolean; detail?: string }[] = [];

async function check(name: string, body: () => Promise<void> | void) {
  try {
    await body();
    results.push({ name, ok: true });
    console.log(`  \u2713 ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail });
    console.log(`  \u2717 ${name}\n      ${detail.split("\n")[0]}`);
  }
}

const PASSWORD_HASH = hashPassword("SicheresPasswort123");

function seedUser(id: string, email: string, role: "customer" | "admin" = "customer") {
  const at = nowIso();
  run(
    `INSERT INTO users (id, email, password_hash, display_name, locale, role, email_verified,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, 'de', ?, 1, ?, ?)`,
    id,
    email,
    PASSWORD_HASH,
    role === "admin" ? "Admin" : "Testkunde",
    role,
    at,
    at,
  );
  if (role === "admin") {
    run(
      `INSERT INTO mfa_secrets (user_id, secret, confirmed_at, created_at)
       VALUES (?, 'JBSWY3DPEHPK3PXP', ?, ?)`,
      id,
      at,
      at,
    );
  }
}

function ticketForm(subject: string, category: string, message: string) {
  const form = new FormData();
  form.set("subject", subject);
  form.set("category", category);
  form.set("message", message);
  return form;
}

function replyForm(ticketId: string, body: string) {
  const form = new FormData();
  form.set("ticketId", ticketId);
  form.set("body", body);
  return form;
}

function ticketCount() {
  return get<{ c: number }>(`SELECT COUNT(*) AS c FROM support_tickets`)?.c ?? 0;
}

function latestTicket() {
  return get<{ id: string; subject: string; status: string; email: string }>(
    `SELECT id, subject, status, email FROM support_tickets ORDER BY rowid DESC LIMIT 1`,
  );
}

function messages(ticketId: string) {
  return all<{ author_type: string; body: string }>(
    `SELECT author_type, body FROM ticket_messages WHERE ticket_id = ? ORDER BY rowid`,
    ticketId,
  ).map((row) => ({ author_type: row.author_type, body: row.body }));
}

function mails() {
  return all<{ to_email: string; subject: string }>(
    `SELECT to_email, subject FROM outbox_emails ORDER BY rowid`,
  ).map((row) => ({ to_email: row.to_email, subject: row.subject }));
}

function latestAudit() {
  return get<{ action: string; actor_id: string; target_id: string; meta: string | null }>(
    `SELECT action, actor_id, target_id, meta FROM audit_log ORDER BY created_at DESC LIMIT 1`,
  );
}

async function redirectOf(action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
  } catch (error) {
    assert.ok(error instanceof RedirectError, "Aktion muss weiterleiten");
    return error.digest;
  }
  return "";
}

seedUser("kunde-1", "kunde@example.test");
seedUser("kunde-2", "andere@example.test");
seedUser("kunde-3", "ohneabo@example.test");
seedUser("admin-1", "admin@example.test", "admin");

// kunde-1 ist zahlender Kunde: E-Mail-Support ist eine Premium-Leistung.
// kunde-3 bleibt ohne Abo und darf deshalb keine Anfrage anlegen.
ensureSubscription("kunde-1");
run(
  `UPDATE subscriptions
     SET status = 'active', plan = 'standard_monthly', channel = 'web', provider = 'stripe',
         provider_subscription_id = 'sub_test_zahlend', current_period_end = ?, updated_at = ?
   WHERE user_id = 'kunde-1'`,
  new Date(Date.now() + 30 * 86_400_000).toISOString(),
  nowIso(),
);

await check("Ohne Abo wird keine Anfrage angelegt", async () => {
  run("DELETE FROM outbox_emails");
  sessionToken.value = await createSession("kunde-3");
  const before = ticketCount();

  const result = await createTicketAction(
    null,
    ticketForm("Playlist einrichten", "playlist", "Wie richte ich meine erste Playlist ein?")
  );

  assert.equal(result?.ok, false);
  assert.match(result?.message ?? "", /Premium/);
  assert.equal(ticketCount(), before, "Gratis-Konto darf kein Ticket erzeugen");
  assert.equal(mails().length, 0, "Gratis-Konto löst keine Mail aus");
});

await check("Anlage ohne Anmeldung wird abgelehnt", async () => {
  sessionToken.value = null;
  const digest = await redirectOf(() =>
    createTicketAction(null, ticketForm("Kein Login", "other", "Bitte helfen Sie mir bei diesem Problem.")),
  );
  assert.match(digest, /\/login\?next=/);
  assert.equal(ticketCount(), 0);
});

await check("Zu kurze Beschreibung wird abgelehnt", async () => {
  run("DELETE FROM outbox_emails");
  sessionToken.value = await createSession("kunde-1");

  const result = await createTicketAction(null, ticketForm("Kurzer Text", "other", "zu kurz"));
  assert.equal(result?.ok, false);
  assert.ok(result?.fieldErrors?.message);
  assert.equal(ticketCount(), 0);
  assert.equal(mails().length, 0);
});

await check("Kunde legt ein Ticket an, beide Mails gehen raus", async () => {
  run("DELETE FROM audit_log");
  run("DELETE FROM outbox_emails");
  revalidated.length = 0;

  const result = await createTicketAction(
    null,
    ticketForm(
      "Gerät aktiviert nicht",
      "activation",
      "Mein Fire-TV-Gerät zeigt beim Aktivieren nur einen Fehler an.",
    ),
  );
  assert.equal(result?.ok, true);
  assert.match(result?.message ?? "", /Anfrage wurde erstellt/);

  const ticket = latestTicket();
  assert.ok(ticket?.id);
  assert.equal(ticket?.status, "open");
  assert.equal(ticket?.email, "kunde@example.test");
  assert.deepEqual(messages(ticket.id), [
    {
      author_type: "customer",
      body: "Mein Fire-TV-Gerät zeigt beim Aktivieren nur einen Fehler an.",
    },
  ]);

  const sent = mails();
  assert.equal(sent.length, 2);
  assert.equal(sent[0].to_email, "service@streaminghub.org");
  assert.match(sent[0].subject, /^\[Support\] Gerät aktiviert nicht/);
  assert.equal(sent[1].to_email, "kunde@example.test");
  assert.match(sent[1].subject, /Wir haben deine Anfrage erhalten/);

  const audit = latestAudit();
  assert.equal(audit?.action, "support.ticket_created");
  assert.equal(audit?.actor_id, "kunde-1");
  assert.ok(revalidated.includes("/dashboard/support"));
});

await check("Kundenantwort landet im Verlauf und mailt den Support", async () => {
  run("DELETE FROM outbox_emails");
  const ticket = latestTicket();
  assert.ok(ticket);

  const result = await customerReply(
    null,
    replyForm(ticket.id, "Ich habe es mit einem zweiten Gerät versucht, gleicher Fehler."),
  );
  assert.equal(result?.ok, true);

  const history = messages(ticket.id);
  assert.equal(history.length, 2);
  assert.equal(history[1].author_type, "customer");
  assert.equal(latestTicket()?.status, "open");

  const sent = mails();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to_email, "service@streaminghub.org");
  assert.match(sent[0].subject, /Neue Antwort/);
  assert.match(sent[0].subject, /Gerät aktiviert nicht/);
  assert.ok(revalidated.includes(`/dashboard/support/${ticket.id}`));
});

await check("Fremdes Ticket kann nicht beantwortet werden", async () => {
  const ticket = latestTicket();
  assert.ok(ticket);
  sessionToken.value = await createSession("kunde-2");

  const result = await customerReply(null, replyForm(ticket.id, "Ich bin ein fremdes Konto."));
  assert.equal(result?.ok, false);
  assert.match(result?.message ?? "", /nicht gefunden/);
  assert.equal(messages(ticket.id).length, 2);
});

await check("Staff antwortet und setzt den Status", async () => {
  run("DELETE FROM audit_log");
  run("DELETE FROM outbox_emails");
  const ticket = latestTicket();
  assert.ok(ticket);
  sessionToken.value = await createSession("admin-1");

  const form = replyForm(ticket.id, "Bitte aktualisiere die App auf Version 1.3 und versuche es erneut.");
  form.set("status", "pending");
  const digest = await redirectOf(() => staffReply(form));
  assert.match(digest, new RegExp(`/admin/tickets/${ticket.id}\\?ok=reply`));

  const history = messages(ticket.id);
  assert.equal(history.length, 3);
  assert.equal(history[2].author_type, "staff");
  assert.match(history[2].body, /Version 1\.3/);
  assert.equal(latestTicket()?.status, "pending");

  const sent = mails();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to_email, "kunde@example.test");
  assert.match(sent[0].subject, /Antwort auf deine Anfrage/);

  const audit = latestAudit();
  assert.equal(audit?.action, "admin.ticket_replied");
  assert.equal(audit?.actor_id, "admin-1");
  assert.equal(audit?.target_id, ticket.id);
});

await check("Statuswechsel wird protokolliert", async () => {
  run("DELETE FROM audit_log");
  const ticket = latestTicket();
  assert.ok(ticket);

  const form = new FormData();
  form.set("ticketId", ticket.id);
  form.set("status", "closed");
  const digest = await redirectOf(() => setTicketStatusAction(form));
  assert.match(digest, new RegExp(`/admin/tickets/${ticket.id}\\?ok=status`));

  assert.equal(latestTicket()?.status, "closed");
  const audit = latestAudit();
  assert.equal(audit?.action, "admin.ticket_status_changed");
  assert.deepEqual(JSON.parse(audit?.meta ?? "{}"), { status: "closed" });
});

await check("Ungueltiger Status wird ignoriert", async () => {
  const ticket = latestTicket();
  assert.ok(ticket);
  const form = new FormData();
  form.set("ticketId", ticket.id);
  form.set("status", "erledigt");

  const digest = await redirectOf(() => setTicketStatusAction(form));
  assert.equal(digest, "");
  assert.equal(latestTicket()?.status, "closed");
});

await check("Kunde darf nicht als Staff antworten", async () => {
  const ticket = latestTicket();
  assert.ok(ticket);
  sessionToken.value = await createSession("kunde-1");
  run("DELETE FROM outbox_emails");

  const digest = await redirectOf(() => staffReply(replyForm(ticket.id, "Ich gebe mich als Support aus.")));
  assert.match(digest, /\/dashboard\?error=forbidden/);
  assert.equal(messages(ticket.id).length, 3);
  assert.equal(mails().length, 0);
});

await check("Leere Staff-Antwort wird still verworfen", async () => {
  sessionToken.value = await createSession("admin-1");
  const ticket = latestTicket();
  assert.ok(ticket);
  run("DELETE FROM outbox_emails");

  const digest = await redirectOf(() => staffReply(replyForm(ticket.id, " ")));
  assert.equal(digest, "");
  assert.equal(messages(ticket.id).length, 3);
  assert.equal(mails().length, 0);
});

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
if (failed.length > 0) process.exitCode = 1;
