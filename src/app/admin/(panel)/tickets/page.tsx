import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import { all } from "@/lib/db";
import { requireStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminTicketsPage() {
  await requireStaff();
  const { t, locale } = await getI18n();

  const rows = all<{
    id: string;
    subject: string;
    category: string;
    status: string;
    created_at: string;
    email: string;
    messages: number;
  }>(
    `SELECT t.id, t.subject, t.category, t.status, t.created_at, t.email,
            (SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id = t.id) AS messages
     FROM support_tickets t ORDER BY
       CASE t.status WHEN 'open' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
       t.updated_at DESC
     LIMIT 200`,
  );

  const dateFormat = new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", { dateStyle: "short" });

  return (
    <div className="grid gap-5">
      <PageHeader eyebrow={t.admin.nav.tickets} title={t.admin.tickets.title} description={t.admin.subtitle} />

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t.admin.tickets.subject}</th>
              <th>{t.admin.tickets.customer}</th>
              <th>{t.admin.tickets.category}</th>
              <th>{t.admin.tickets.status}</th>
              <th>{t.admin.tickets.created}</th>
              <th>{t.ui.details}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={`/admin/tickets/${row.id}`} className="link text-[0.82rem]">
                    {row.subject}
                  </Link>
                  <p className="text-[0.68rem] text-muted">{row.messages} Nachrichten</p>
                </td>
                <td className="text-xs">{row.email}</td>
                <td className="text-xs">{row.category}</td>
                <td>
                  <Badge tone={row.status === "open" ? "warn" : row.status === "closed" ? "neutral" : "brand"}>{row.status}</Badge>
                </td>
                <td className="whitespace-nowrap text-xs">{dateFormat.format(new Date(row.created_at))}</td>
                <td>
                  <Link href={`/admin/tickets/${row.id}`} className="btn btn-ghost btn-sm !px-2">
                    {t.admin.tickets.open}
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-xs text-muted">
                  {t.admin.tickets.empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
