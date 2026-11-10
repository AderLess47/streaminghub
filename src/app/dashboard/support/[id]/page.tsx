import Link from "next/link";
import { notFound } from "next/navigation";
import { ReplyForm } from "@/components/dashboard-forms";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import { replyTicketAction } from "@/lib/actions/dashboard";
import { all, get } from "@/lib/db";
import { requireUser } from "@/lib/session";

type Ticket = {
  id: string;
  subject: string;
  category: string;
  status: string;
  created_at: string;
  email: string;
};

type Message = {
  id: string;
  author_type: string;
  author_name: string;
  body: string;
  created_at: string;
};

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const { id } = await params;

  const ticket = get<Ticket>(
    `SELECT id, subject, category, status, created_at, email FROM support_tickets WHERE id = ? AND user_id = ?`,
    id,
    user.id,
  );
  if (!ticket) notFound();

  const messages = all<Message>(
    `SELECT id, author_type, author_name, body, created_at FROM ticket_messages
     WHERE ticket_id = ? AND author_type != 'internal' ORDER BY created_at ASC`,
    ticket.id,
  );

  const dateFormat = new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow={t.dashboard.nav.support} title={ticket.subject} description={`${ticket.category} · ${ticket.email}`}>
        <Link href="/dashboard/support" className="btn btn-ghost btn-sm">
          <Icon name="arrow-left" size={15} />
          {t.ui.back}
        </Link>
      </PageHeader>

      <div className="grid gap-3">
        {messages.map((message) => (
          <article
            key={message.id}
            className={`rounded-2xl border p-4 ${
              message.author_type === "customer"
                ? "border-line/60 bg-white/3"
                : "border-brand/25 bg-brand/8"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-200">
                {message.author_type === "customer" ? t.dashboard.support.you : t.dashboard.support.staffReply}
              </p>
              <p className="text-[0.68rem] text-muted">{dateFormat.format(new Date(message.created_at))}</p>
            </div>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-300">{message.body}</p>
          </article>
        ))}
      </div>

      {ticket.status !== "closed" ? (
        <div className="card p-5">
          <ReplyForm
            action={replyTicketAction}
            ticketId={ticket.id}
            labels={{
              title: t.dashboard.support.reply,
              cta: t.dashboard.support.replyCta,
              placeholder: t.dashboard.support.replyPlaceholder,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
