import { ScrollRegion } from "@/components/scroll-region";
import { Badge, PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import { blockPairingCodeAction } from "@/lib/actions/admin";
import { all } from "@/lib/db";
import { requireStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminPairingPage() {
  await requireStaff();
  const { t, locale } = await getI18n();

  const rows = all<{
    id: string;
    code_prefix: string;
    device_name: string;
    platform: string;
    attempts: number;
    created_at: string;
    expires_at: string;
    claimed_at: string | null;
    email: string | null;
  }>(
    `SELECT p.id, p.code_prefix, p.device_name, p.platform, p.attempts, p.created_at, p.expires_at, p.claimed_at, u.email
     FROM pairing_requests p LEFT JOIN users u ON u.id = p.user_id
     ORDER BY p.created_at DESC LIMIT 100`,
  );

  const dateFormat = new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <div className="grid gap-5">
      <PageHeader eyebrow={t.admin.nav.pairing} title={t.admin.pairing.title} description={t.admin.pairing.subtitle} />

      <ScrollRegion label={t.admin.pairing.title} className="card hidden overflow-x-auto xl:block">
        <table className="data-table">
          <caption className="sr-only">{t.admin.pairing.title}</caption>
          <thead>
            <tr>
              <th>{t.admin.pairing.code}</th>
              <th>{t.admin.pairing.device}</th>
              <th>{t.admin.pairing.created}</th>
              <th>{t.admin.pairing.expires}</th>
              <th>{t.admin.pairing.attempts}</th>
              <th>{t.admin.pairing.status}</th>
              <th>{t.admin.pairing.claimer}</th>
              <th>{t.ui.actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const expired = new Date(row.expires_at).getTime() < Date.now();
              const status = row.claimed_at ? "claimed" : expired || row.attempts >= 5 ? "expired" : "pending";
              return (
                <tr key={row.id}>
                  <td className="font-mono text-xs">{row.code_prefix}····</td>
                  <td className="text-xs">
                    {row.device_name}
                    <span className="text-muted"> · {row.platform}</span>
                  </td>
                  <td className="whitespace-nowrap text-xs">{dateFormat.format(new Date(row.created_at))}</td>
                  <td className="whitespace-nowrap text-xs">{dateFormat.format(new Date(row.expires_at))}</td>
                  <td className="text-xs">{row.attempts}</td>
                  <td>
                    <Badge tone={status === "claimed" ? "ok" : status === "pending" ? "warn" : "neutral"}>
                      {status === "claimed" ? t.admin.pairing.claimed : status === "pending" ? t.admin.pairing.pending : t.admin.pairing.expired}
                    </Badge>
                  </td>
                  <td className="text-xs">{row.email ?? "—"}</td>
                  <td>
                    {status === "pending" ? (
                      <form action={blockPairingCodeAction}>
                        <input type="hidden" name="requestId" value={row.id} />
                        <input type="hidden" name="returnTo" value="/admin/pairing" />
                        <button type="submit" className="btn btn-ghost btn-sm">
                          {t.admin.pairing.revoke}
                        </button>
                      </form>
                    ) : (
                      <span className="text-[0.68rem] text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-xs text-muted">
                  {t.admin.pairing.empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </ScrollRegion>

      <ul className="grid gap-3 md:grid-cols-2 xl:hidden">
        {rows.map((row) => {
          const expired = new Date(row.expires_at).getTime() < Date.now();
          const status = row.claimed_at ? "claimed" : expired || row.attempts >= 5 ? "expired" : "pending";
          return (
            <li key={row.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-slate-200">{row.code_prefix}····</p>
                  <p className="mt-1 truncate text-[0.68rem] text-muted">
                    {row.device_name} · {row.platform}
                  </p>
                  <p className="truncate text-[0.68rem] text-muted">{row.email ?? "—"}</p>
                </div>
                <span className="shrink-0">
                  <Badge tone={status === "claimed" ? "ok" : status === "pending" ? "warn" : "neutral"}>
                    {status === "claimed" ? t.admin.pairing.claimed : status === "pending" ? t.admin.pairing.pending : t.admin.pairing.expired}
                  </Badge>
                </span>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-muted">{t.admin.pairing.created}</dt>
                  <dd className="whitespace-nowrap">{dateFormat.format(new Date(row.created_at))}</dd>
                </div>
                <div>
                  <dt className="text-muted">{t.admin.pairing.expires}</dt>
                  <dd className="whitespace-nowrap">{dateFormat.format(new Date(row.expires_at))}</dd>
                </div>
                <div>
                  <dt className="text-muted">{t.admin.pairing.attempts}</dt>
                  <dd>{row.attempts}</dd>
                </div>
                <div>
                  <dt className="text-muted">{t.admin.pairing.claimer}</dt>
                  <dd className="truncate">{row.email ?? "—"}</dd>
                </div>
              </dl>

              {status === "pending" ? (
                <form action={blockPairingCodeAction} className="mt-3">
                  <input type="hidden" name="requestId" value={row.id} />
                  <input type="hidden" name="returnTo" value="/admin/pairing" />
                  <button type="submit" className="btn btn-ghost btn-sm w-full">
                    {t.admin.pairing.revoke}
                  </button>
                </form>
              ) : null}
            </li>
          );
        })}
        {rows.length === 0 ? (
          <li className="card p-6 text-center text-xs text-muted">{t.admin.pairing.empty}</li>
        ) : null}
      </ul>

      <p className="text-[0.68rem] leading-relaxed text-muted">
        Codes werden ausschließlich als Hash gespeichert. Nach Einlösung, Ablauf oder fünf Fehlversuchen sind sie
        ungültig. Vollständige Codes sind hier daher nicht sichtbar.
      </p>
    </div>
  );
}
