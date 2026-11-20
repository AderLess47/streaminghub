import Link from "next/link";
import { NewTicketForm } from "@/components/dashboard-forms";
import { EmptyState, PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import { createTicketAction } from "@/lib/actions/dashboard";
import { all } from "@/lib/db";
import { getEntitlements } from "@/lib/entitlements";
import { requireUser } from "@/lib/session";

type TicketRow = {
  id: string;
  subject: string;
  category: string;
  status: string;
  created_at: string;
  messages: number;
};

export default async function SupportPage() {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  // Support per E-Mail ist eine Premium-Leistung; Gratis- und Trial-Konten
  // bekommen den Weg über den Hilfebereich statt eines Formulars.
  const entitlements = getEntitlements(user.id);
  const supportEntitled = entitlements.source !== "none" && entitlements.source !== "trial";

  const tickets = all<TicketRow>(
    `SELECT t.id, t.subject, t.category, t.status, t.created_at,
            (SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id = t.id) AS messages
     FROM support_tickets t
     WHERE t.user_id = ?
     ORDER BY t.updated_at DESC`,
    user.id,
  );

  const dateFormat = new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    dateStyle: "medium",
  });

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={t.dashboard.nav.support}
        title={t.dashboard.support.title}
        description={t.dashboard.support.subtitle}
      />

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
        <div className="grid gap-3">
          {tickets.length === 0 ? (
            <EmptyState icon="mail" title={t.dashboard.support.empty} />
          ) : (
            tickets.map((ticket) => (
              <Link
                key={ticket.id}
                href={`/dashboard/support/${ticket.id}`}
                className="card card-hover flex items-center justify-between gap-3 px-4 py-3.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{ticket.subject}</p>
                  <p className="mt-0.5 text-[0.7rem] text-muted">
                    {ticket.category} · {dateFormat.format(new Date(ticket.created_at))} · {ticket.messages}{" "}
                    {locale === "de" ? "Nachrichten" : "messages"}
                  </p>
                </div>
                <span className={`chip ${ticket.status === "open" ? "chip-warn" : ticket.status === "closed" ? "" : "chip-brand"}`}>
                  {ticket.status === "open"
                    ? t.dashboard.support.statusOpen
                    : ticket.status === "closed"
                      ? t.dashboard.support.statusClosed
                      : t.dashboard.support.statusPending}
                </span>
              </Link>
            ))
          )}
        </div>

        <div className="card p-5">
          <h2 className="text-base font-semibold">
            {supportEntitled ? t.dashboard.support.newTicket : t.dashboard.support.supportPremiumOnly}
          </h2>
          <div className="mt-4">
            {supportEntitled ? (
              <NewTicketForm
                action={createTicketAction}
                t={t.dashboard.support}
                busy={t.ui.sending}
              />
            ) : (
              <div className="grid gap-3">
                <p className="text-xs leading-relaxed text-muted">{t.dashboard.support.supportPremiumBody}</p>
                <Link href="/help" className="btn btn-outline btn-sm btn-block">
                  {t.dashboard.support.supportFaqCta}
                </Link>
                <Link href="/premium" className="btn btn-ghost btn-sm btn-block">
                  {t.dashboard.support.supportPremiumCta}
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
