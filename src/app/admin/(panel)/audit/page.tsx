import { PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import { all } from "@/lib/db";
import { requireStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

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

      <div className="card overflow-x-auto">
        <table className="data-table">
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
                <td className="text-[0.68rem]">{entry.ip ?? "—"}</td>
                <td className="max-w-[16rem] truncate text-[0.65rem] text-muted" title={entry.meta ?? ""}>
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
      </div>
      <p className="text-[0.68rem] leading-relaxed text-muted">
        Das Protokoll ist append-only. Einträge werden nicht nachträglich verändert; Löschung erfolgt ausschließlich
        durch die automatische Aufbewahrungsfrist (90 Tage, sofern kein Vorfall vorliegt).
      </p>
    </div>
  );
}
