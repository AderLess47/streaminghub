import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { Alert, Badge, PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import { replyTicketAction, setTicketStatusAction } from "@/lib/actions/admin";
import { all, get } from "@/lib/db";
import { requireStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminTicketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  await requireStaff();
  const { t, locale } = await getI18n();
  const { id } = await params;
  const query = await searchParams;

  const ticket = get<{ id: string; subject: string; category: string; status: string; email: string; created_at: string }>(
    `SELECT id, subject, category, status, email, created_at FROM support_tickets WHERE id = ?`,
    id,
  );
  if (!ticket) notFound();

  const messages = all<{ id: string; author_type: string; author_name: string; body: string; created_at: string }>(
    `SELECT id, author_type, author_name, body, created_at FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC`,
    id,
  );

  const dateFormat = new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="grid gap-5">
      <PageHeader eyebrow={t.admin.tickets.detail} title={ticket.subject} description={`${ticket.email} · ${ticket.category}`}>
        <Link href="/admin/tickets" className="btn btn-ghost btn-sm">
          <Icon name="arrow-left" size={15} />
          {t.ui.back}
        </Link>
      </PageHeader>

      {query.ok === "reply" ? (
        <Alert tone="success" id="ticket-flash-reply" autoFocus>
          {t.admin.tickets.updated}
        </Alert>
      ) : null}
      {query.ok === "status" ? (
        <Alert tone="success" id="ticket-flash-status" autoFocus>
          {t.admin.tickets.statusChange}
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={ticket.status === "open" ? "warn" : ticket.status === "closed" ? "neutral" : "brand"}>
          {ticket.status}
        </Badge>
        <span className="text-[0.7rem] text-muted">
          {t.admin.tickets.created}: {dateFormat.format(new Date(ticket.created_at))}
        </span>
      </div>

      <div className="grid gap-3">
        {messages.map((message) => (
          <article
            key={message.id}
            className={`rounded-2xl border p-4 ${
              message.author_type === "staff"
                ? "border-brand/25 bg-brand/8"
                : message.author_type === "internal"
                  ? "border-amber-500/25 bg-amber-500/6"
                  : "border-line/60 bg-white/3"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-200">
                {message.author_name}
                <span className="ms-2 text-[0.65rem] font-normal uppercase tracking-wide text-muted">
                  {message.author_type}
                </span>
              </p>
              <p className="text-[0.68rem] text-muted">{dateFormat.format(new Date(message.created_at))}</p>
            </div>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-300">{message.body}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr] lg:items-start">
        <form action={replyTicketAction} className="card grid gap-3 p-5">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <div>
            <label htmlFor="admin-reply" className="field-label">
              {t.admin.tickets.reply}
            </label>
            <textarea
              id="admin-reply"
              name="body"
              rows={5}
              required
              minLength={2}
              maxLength={5000}
              placeholder={t.admin.tickets.replyPlaceholder}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="admin-reply-status" className="field-label">
              {t.admin.tickets.statusChange}
            </label>
            <select id="admin-reply-status" name="status" defaultValue="pending" className="field">
              <option value="pending">{t.dashboard.support.statusPending}</option>
              <option value="open">{t.dashboard.support.statusOpen}</option>
              <option value="closed">{t.dashboard.support.statusClosed}</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary btn-sm justify-self-start">
            <Icon name="mail" size={14} />
            {t.admin.tickets.reply}
          </button>
        </form>

        <form action={setTicketStatusAction} className="card grid gap-3 p-5">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <p id="admin-status-heading" className="text-sm font-semibold">
            {t.admin.tickets.statusChange}
          </p>
          <select
            name="status"
            defaultValue={ticket.status}
            className="field"
            aria-labelledby="admin-status-heading"
          >
            <option value="open">{t.dashboard.support.statusOpen}</option>
            <option value="pending">{t.dashboard.support.statusPending}</option>
            <option value="closed">{t.dashboard.support.statusClosed}</option>
          </select>
          <button type="submit" className="btn btn-outline btn-sm justify-self-start">
            {t.ui.save}
          </button>
          <p className="text-[0.68rem] leading-relaxed text-muted">
            Antworten werden im Audit-Protokoll erfasst. E-Mail-Benachrichtigungen an Kunden werden über den
            E-Mail-Ausgang erzeugt, sofern ein Versanddienst konfiguriert ist.
          </p>
        </form>
      </div>
    </div>
  );
}
