import Link from "next/link";
import { ScrollRegion } from "@/components/scroll-region";
import { Alert, Badge, PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import {
  CONTACT_MESSAGE_STATUSES,
  CONTACT_RETENTION_DAYS,
  contactMessageStats,
  listContactMessages,
  purgeExpiredContactMessages,
  type ContactMessageStatus,
} from "@/lib/contact-messages";
import { deleteContactMessageAction, setContactMessageStatusAction } from "@/lib/actions/admin";
import { requireStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

function parseStatus(raw?: string): ContactMessageStatus | undefined {
  return CONTACT_MESSAGE_STATUSES.includes(raw as ContactMessageStatus)
    ? (raw as ContactMessageStatus)
    : undefined;
}

function filterHref(status?: ContactMessageStatus): string {
  return status ? `/admin/contacts?status=${status}` : "/admin/contacts";
}

export default async function AdminContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; ok?: string }>;
}) {
  await requireStaff();
  const { status: statusRaw, ok } = await searchParams;
  const { locale } = await getI18n();
  const de = locale !== "en";

  const status = parseStatus(statusRaw);
  const purged = purgeExpiredContactMessages();
  const rows = listContactMessages({ status, limit: 200 });
  const stats = contactMessageStats();

  const labels: Record<ContactMessageStatus, string> = {
    new: de ? "Neu" : "New",
    read: de ? "Gelesen" : "Read",
    handled: de ? "Erledigt" : "Handled",
  };

  const dateFormat = new Intl.DateTimeFormat(de ? "de-DE" : "en-GB", {
    dateStyle: "short",
    timeStyle: "short",
  });

  const returnTo = filterHref(status);
  const retentionMonths = Math.round(CONTACT_RETENTION_DAYS / 30);

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow={de ? "Kontakt" : "Contact"}
        title={de ? "Kontaktanfragen" : "Contact messages"}
        description={
          de
            ? `Anfragen aus dem öffentlichen Kontaktformular. Jede Anfrage geht zusätzlich per E-Mail an den Support und wird nach ${retentionMonths} Monaten automatisch gelöscht.`
            : `Requests from the public contact form. Every request is also sent to support by email and deleted automatically after ${retentionMonths} months.`
        }
      />

      {purged > 0 ? (
        <Alert tone="info" live>
          {de
            ? `${purged} ${purged === 1 ? "Anfrage wurde" : "Anfragen wurden"} nach Ablauf der ${retentionMonths}-monatigen Aufbewahrungsfrist automatisch gelöscht.`
            : `${purged} ${purged === 1 ? "message was" : "messages were"} deleted automatically after the ${retentionMonths}-month retention period.`}
        </Alert>
      ) : null}

      {ok === "status" ? (
        <Alert tone="success" live>
          {de ? "Status gespeichert." : "Status saved."}
        </Alert>
      ) : null}
      {ok === "deleted" ? (
        <Alert tone="success" live>
          {de ? "Anfrage gelöscht." : "Request deleted."}
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        <Link
          href={filterHref(undefined)}
          className={`btn btn-sm ${status ? "btn-ghost" : "btn-primary"}`}
        >
          {de ? "Alle" : "All"} ({stats.total})
        </Link>
        {CONTACT_MESSAGE_STATUSES.map((value) => (
          <Link
            key={value}
            href={filterHref(value)}
            className={`btn btn-sm ${status === value ? "btn-primary" : "btn-ghost"}`}
          >
            {labels[value]} ({stats[value]})
          </Link>
        ))}
      </div>

      <ScrollRegion label={de ? "Kontaktanfragen" : "Contact messages"} className="card overflow-x-auto">
        <table className="data-table">
          <caption className="sr-only">{de ? "Kontaktanfragen" : "Contact messages"}</caption>
          <thead>
            <tr>
              <th>{de ? "Anfrage" : "Request"}</th>
              <th>{de ? "Status" : "Status"}</th>
              <th>{de ? "Eingegangen" : "Received"}</th>
              <th>{de ? "Aktionen" : "Actions"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rowStatus = parseStatus(row.status);
              return (
                <tr key={row.id}>
                  <td className="align-top">
                    <p className="text-[0.82rem] font-medium">{row.subject}</p>
                    <p className="mt-0.5 text-[0.7rem] text-muted">
                      {row.name} · {row.email}
                    </p>
                    <p className="mt-1 max-w-xl whitespace-pre-line text-xs leading-relaxed text-muted">
                      {row.message.length > 320 ? `${row.message.slice(0, 320)}…` : row.message}
                    </p>
                  </td>
                  <td className="align-top">
                    <Badge
                      tone={
                        rowStatus === "new" ? "warn" : rowStatus === "handled" ? "ok" : "brand"
                      }
                    >
                      {rowStatus ? labels[rowStatus] : row.status}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap align-top text-xs">
                    {dateFormat.format(new Date(row.createdAt))}
                  </td>
                  <td className="align-top">
                    <div className="flex flex-nowrap gap-1.5">
                      {rowStatus !== "read" ? (
                        <form action={setContactMessageStatusAction}>
                          <input type="hidden" name="id" value={row.id} />
                          <input type="hidden" name="status" value="read" />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <button type="submit" className="btn btn-ghost btn-sm">
                            {de ? "Gelesen" : "Read"}
                          </button>
                        </form>
                      ) : null}
                      {rowStatus !== "handled" ? (
                        <form action={setContactMessageStatusAction}>
                          <input type="hidden" name="id" value={row.id} />
                          <input type="hidden" name="status" value="handled" />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <button type="submit" className="btn btn-ghost btn-sm">
                            {de ? "Erledigt" : "Handled"}
                          </button>
                        </form>
                      ) : null}
                      <form action={deleteContactMessageAction}>
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                                                  <button type="submit" className="btn btn-ghost btn-sm !text-rose-300">
                            {de ? "Löschen" : "Delete"}
                          </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-xs text-muted">
                  {de ? "Keine Anfragen in diesem Filter." : "No messages for this filter."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </ScrollRegion>
    </div>
  );
}
