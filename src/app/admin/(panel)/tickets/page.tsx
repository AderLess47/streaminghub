import Link from "next/link";
import { Pager } from "@/components/pager";
import { ScrollRegion } from "@/components/scroll-region";
import { Badge, PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import { all, get } from "@/lib/db";
import { parsePage } from "@/lib/pagination";
import { requireStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireStaff();
  const { t, locale } = await getI18n();
  const params = await searchParams;
  const total = get<{ c: number }>(`SELECT COUNT(*) AS c FROM support_tickets`)?.c ?? 0;
  const page = parsePage(params.page, total);

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
     LIMIT ? OFFSET ?`,
    page.pageSize,
    page.offset,
  );

  const dateFormat = new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", { dateStyle: "short" });
  const statusTone = (status: string) =>
    status === "open" ? "warn" : status === "closed" ? "neutral" : "brand";

  return (
    <div className="grid gap-5">
      <PageHeader eyebrow={t.admin.nav.tickets} title={t.admin.tickets.title} description={t.admin.subtitle} />

      <ScrollRegion label={t.admin.tickets.title} className="card hidden overflow-x-auto xl:block">
        <table className="data-table">
          <caption className="sr-only">{t.admin.tickets.title}</caption>
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
                  <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                </td>
                <td className="whitespace-nowrap text-xs">{dateFormat.format(new Date(row.created_at))}</td>
                <td>
                  <Link href={`/admin/tickets/${row.id}`} className="btn btn-ghost btn-sm !min-w-11 !px-2">
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
      </ScrollRegion>

      {/* Unter 1280px passt die Tabelle nicht in den Inhaltsbereich; dort stehen
          die Anfragen als Karten – wie bei den übrigen Admin-Listen. */}
      <ul className="grid gap-3 md:grid-cols-2 xl:hidden">
        {rows.map((row) => (
          <li key={row.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/admin/tickets/${row.id}`} className="link inline-flex min-h-9 max-w-full items-center text-[0.82rem]">
                  <span className="truncate">{row.subject}</span>
                </Link>
                <p className="truncate text-[0.68rem] text-muted">{row.email}</p>
              </div>
              <span className="shrink-0">
                <Badge tone={statusTone(row.status)}>{row.status}</Badge>
              </span>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-muted">{t.admin.tickets.category}</dt>
                <dd className="truncate">{row.category}</dd>
              </div>
              <div>
                <dt className="text-muted">{t.admin.tickets.created}</dt>
                <dd className="whitespace-nowrap">{dateFormat.format(new Date(row.created_at))}</dd>
              </div>
            </dl>

            <Link href={`/admin/tickets/${row.id}`} className="btn btn-outline btn-sm mt-3 w-full">
              {t.admin.tickets.open}
            </Link>
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="card p-6 text-center text-xs text-muted">{t.admin.tickets.empty}</li>
        ) : null}
      </ul>

      <Pager
        basePath="/admin/tickets"
        params={{}}
        page={page.page}
        pages={page.pages}
        total={page.total}
        previousLabel={t.ui.previous}
        nextLabel={t.ui.next}
        pageLabel={t.ui.pageOf}
      />
    </div>
  );
}
