import { Alert, Badge, PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import { all, get } from "@/lib/db";
import { isBackupConfigured } from "@/lib/env";
import { isFeatureEnabled } from "@/lib/flags";
import { requireStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

/** R2-Freibetrag pro Monat, nur als Orientierung für die Kachel. */
const FREE_STORAGE_BYTES = 10 * 1024 * 1024 * 1024;

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 KB";
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Nutzung des Cloud-Backups.
 *
 * Gezählt wird, was tatsächlich in der Datenbank steht: Konten mit mindestens
 * einer Sicherung, Anzahl der Sicherungen und die Summe der gespeicherten
 * Objektgrößen (verschlüsselt, also die reale Belegung). Beträge und Rechte
 * werden hier nicht verändert.
 */
export default async function AdminBackupPage() {
  await requireStaff();
  const { t, locale } = await getI18n();
  const copy = t.admin.backup;

  const totals =
    get<{ accounts: number; backups: number; bytes: number; last: string | null }>(
      `SELECT COUNT(DISTINCT user_id) AS accounts, COUNT(*) AS backups,
              COALESCE(SUM(size_bytes), 0) AS bytes, MAX(created_at) AS last
       FROM cloud_backups`,
    ) ?? { accounts: 0, backups: 0, bytes: 0, last: null };

  const lastRestore =
    get<{ at: string | null }>(`SELECT MAX(restored_at) AS at FROM cloud_backups`)?.at ?? null;
  const premiumAccounts =
    get<{ c: number }>(`SELECT COUNT(*) AS c FROM subscriptions WHERE status = 'active'`)?.c ?? 0;

  const rows = all<{
    user_id: string;
    email: string;
    backups: number;
    bytes: number;
    last: string;
    restored: string | null;
  }>(
    `SELECT b.user_id, u.email, COUNT(*) AS backups, COALESCE(SUM(b.size_bytes), 0) AS bytes,
            MAX(b.created_at) AS last, MAX(b.restored_at) AS restored
     FROM cloud_backups b JOIN users u ON u.id = b.user_id
     GROUP BY b.user_id, u.email
     ORDER BY bytes DESC, last DESC
     LIMIT 200`,
  );

  const dateFormat = new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    dateStyle: "short",
    timeStyle: "short",
  });
  const formatDate = (value: string | null) => (value ? dateFormat.format(new Date(value)) : "—");

  const share =
    premiumAccounts > 0 ? Math.round((totals.accounts / premiumAccounts) * 100) : 0;
  const quota = Math.min(100, Math.round((totals.bytes / FREE_STORAGE_BYTES) * 100));

  const kpis = [
    { label: copy.accountsPremium, value: premiumAccounts, hint: null },
    {
      label: copy.accountsWithBackup,
      value: totals.accounts,
      hint: premiumAccounts > 0 ? `${share} %` : null,
    },
    { label: copy.backups, value: totals.backups, hint: null },
    { label: copy.storage, value: formatBytes(totals.bytes), hint: `${quota} %` },
  ];

  return (
    <div className="grid gap-5">
      <PageHeader eyebrow={t.admin.nav.backup} title={copy.title} description={copy.subtitle} />

      {!isFeatureEnabled("cloudBackup") ? (
        <Alert tone="warning">{copy.flagOff}</Alert>
      ) : null}
      {!isBackupConfigured() ? <Alert tone="warning">{copy.notConfigured}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="card p-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[0.68rem] uppercase tracking-[0.1em] text-muted">
                {kpi.label}
              </span>
              {kpi.hint ? <span className="text-[0.7rem] text-cyan">{kpi.hint}</span> : null}
            </div>
            <p className="mt-2 text-2xl font-semibold">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card p-4">
          <p className="text-[0.68rem] uppercase tracking-[0.1em] text-muted">{copy.lastBackup}</p>
          <p className="mt-1 text-sm">{formatDate(totals.last)}</p>
        </div>
        <div className="card p-4">
          <p className="text-[0.68rem] uppercase tracking-[0.1em] text-muted">{copy.lastRestore}</p>
          <p className="mt-1 text-sm">{formatDate(lastRestore)}</p>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-muted">{copy.quotaNote}</p>

      <section className="card overflow-x-auto">
        <table className="data-table">
          <caption className="sr-only">{copy.tableTitle}</caption>
          <thead>
            <tr>
              <th>{copy.customer}</th>
              <th>{copy.count}</th>
              <th>{copy.size}</th>
              <th>{copy.created}</th>
              <th>{copy.restored}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.user_id}>
                <td className="max-w-[15rem] truncate text-xs" title={row.email}>
                  {row.email}
                </td>
                <td className="text-xs">{row.backups}</td>
                <td className="whitespace-nowrap text-xs">{formatBytes(row.bytes)}</td>
                <td className="whitespace-nowrap text-xs">{formatDate(row.last)}</td>
                <td className="whitespace-nowrap text-xs">{formatDate(row.restored)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-xs text-muted">
                  {copy.empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge tone="neutral">{copy.hintRetention}</Badge>
        <Badge tone="neutral">{copy.hintEncrypted}</Badge>
      </div>
    </div>
  );
}
