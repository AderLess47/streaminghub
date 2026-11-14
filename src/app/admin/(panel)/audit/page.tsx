import { ScrollRegion } from "@/components/scroll-region";
import { PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import { all } from "@/lib/db";
import { requireStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Setzt hinter Komma und Doppelpunkt ein Leerzeichen, damit die Metadaten am
 * Handy an Feldgrenzen umbrechen statt mitten im Schlüssel ("chan" / "nel").
 */
function breakableMeta(meta: string) {
  return meta.replace(/,(?=\S)/g, ", ").replace(/:(?=\S)/g, ": ");
}

export default async function AdminAuditPage() {
  await requireStaff();
  const { t, locale } = await getI18n();

  const entries = all<{
    id: string;
    actor_email: string | null;
    action: string;
    target_type: string | null;
    target_id: string | null;
    ip: string | null;
    meta: string | null;
    created_at: string;
  }>(
    `SELECT id, actor_email, action, target_type, target_id, ip, meta, created_at
     FROM audit_log ORDER BY created_at DESC LIMIT 200`,
  );

  const dateFormat = new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    dateStyle: "short",
    timeStyle: "medium",
  });

  return (
    <div className="grid gap-5">
      <PageHeader eyebrow={t.admin.nav.audit} title={t.admin.audit.title} description={t.admin.audit.subtitle} />

      <ScrollRegion label={t.admin.audit.title} className="card hidden overflow-x-auto xl:block">
        <table className="data-table">
          <caption className="sr-only">{t.admin.audit.title}</caption>
          <thead>
            <tr>
              <th>{t.admin.audit.time}</th>
              <th>{t.admin.audit.action}</th>
              <th>{t.admin.audit.actor}</th>
              <th>{t.admin.audit.target}</th>
              <th>{t.admin.audit.ip}</th>
              <th>{t.admin.audit.meta}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="whitespace-nowrap text-[0.68rem]">{dateFormat.format(new Date(entry.created_at))}</td>
                <td className="font-mono text-[0.7rem] text-cyan-200/90">{entry.action}</td>
                <td className="text-[0.68rem]">{entry.actor_email ?? "system"}</td>
                <td className="text-[0.68rem]">
                  {entry.target_type ?? "—"}
                  {entry.target_id ? <span className="text-muted"> · {entry.target_id.slice(0, 10)}</span> : null}
                </td>
                <td className="max-w-[11rem] truncate text-[0.68rem]" title={entry.ip ?? ""}>
                  {entry.ip ?? "—"}
                </td>
                <td className="max-w-[8rem] truncate text-[0.65rem] text-muted" title={entry.meta ?? ""}>
                  {entry.meta ?? "—"}
                </td>
              </tr>
            ))}
            {entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-xs text-muted">
                  {t.admin.audit.empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </ScrollRegion>

      <ul className="grid gap-3 md:grid-cols-2 xl:hidden">
        {entries.map((entry) => (
          <li key={entry.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 break-all font-mono text-[0.7rem] text-cyan-200/90">{entry.action}</p>
              <p className="shrink-0 whitespace-nowrap text-[0.68rem] text-muted">
                {dateFormat.format(new Date(entry.created_at))}
              </p>
            </div>

            <dl className="mt-3 grid gap-1.5 text-xs">
              <div className="flex items-start justify-between gap-3">
                <dt className="shrink-0 text-muted">{t.admin.audit.actor}</dt>
                <dd className="min-w-0 truncate text-right">{entry.actor_email ?? "system"}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="shrink-0 text-muted">{t.admin.audit.target}</dt>
                <dd className="min-w-0 text-right">
                  {entry.target_type ?? "—"}
                  {entry.target_id ? (
                    <span className="text-muted"> · {entry.target_id.slice(0, 10)}</span>
                  ) : null}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="shrink-0 text-muted">{t.admin.audit.ip}</dt>
                <dd className="text-right">{entry.ip ?? "—"}</dd>
              </div>
              {entry.meta ? (
                <div className="flex items-start justify-between gap-3">
                  <dt className="shrink-0 text-muted">{t.admin.audit.meta}</dt>
                  <dd className="min-w-0 break-words text-right text-[0.65rem] text-muted">
                    {breakableMeta(entry.meta)}
                  </dd>
                </div>
              ) : null}
            </dl>
          </li>
        ))}
        {entries.length === 0 ? (
          <li className="card p-6 text-center text-xs text-muted">{t.admin.audit.empty}</li>
        ) : null}
      </ul>

      <p className="text-[0.68rem] leading-relaxed text-muted">
        Das Protokoll ist append-only. Einträge werden nicht nachträglich verändert; Löschung erfolgt ausschließlich
        durch die automatische Aufbewahrungsfrist (90 Tage, sofern kein Vorfall vorliegt).
      </p>
    </div>
  );
}
