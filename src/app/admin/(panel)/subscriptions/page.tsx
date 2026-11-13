import { ScrollRegion } from "@/components/scroll-region";
import { Badge, PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import { setSubscriptionStatusAction } from "@/lib/actions/admin";
import { all } from "@/lib/db";
import { requireStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminSubscriptionsPage() {
  await requireStaff();
  const { t, locale } = await getI18n();

  const rows = all<{
    user_id: string;
    email: string;
    status: string;
    channel: string;
    provider: string;
    current_period_end: string | null;
    updated_at: string;
  }>(
    `SELECT s.user_id, u.email, s.status, s.channel, s.provider, s.current_period_end, s.updated_at
     FROM subscriptions s JOIN users u ON u.id = s.user_id
     ORDER BY s.updated_at DESC LIMIT 200`,
  );

  const dateFormat = new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", { dateStyle: "short" });

  return (
    <div className="grid gap-5">
      <PageHeader eyebrow={t.admin.nav.subscriptions} title={t.admin.subscriptions.title} description={t.admin.subscriptions.note} />

      <ScrollRegion label={t.admin.subscriptions.title} className="card hidden overflow-x-auto xl:block">
        <table className="data-table">
          <caption className="sr-only">{t.admin.subscriptions.title}</caption>
          <thead>
            <tr>
              <th>{t.admin.subscriptions.customer}</th>
              <th>{t.admin.subscriptions.status}</th>
              <th>{t.admin.subscriptions.channel}</th>
              <th>{t.admin.subscriptions.provider}</th>
              <th>{t.admin.subscriptions.periodEnd}</th>
              <th>{t.admin.subscriptions.updated}</th>
              <th>{t.admin.subscriptions.setStatus}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.user_id}>
                <td className="max-w-[13rem] truncate text-xs" title={row.email}>
                  {row.email}
                </td>
                <td>
                  <Badge tone={row.status === "active" ? "ok" : row.status === "pending" ? "warn" : "neutral"}>{row.status}</Badge>
                </td>
                <td className="text-xs">{row.channel}</td>
                <td className="text-xs">{row.provider}</td>
                <td className="whitespace-nowrap text-xs">{row.current_period_end ? dateFormat.format(new Date(row.current_period_end)) : "—"}</td>
                <td className="whitespace-nowrap text-xs">{dateFormat.format(new Date(row.updated_at))}</td>
                <td>
                  <form action={setSubscriptionStatusAction} className="flex items-center gap-1.5">
                    <input type="hidden" name="userId" value={row.user_id} />
                    <input type="hidden" name="returnTo" value="/admin/subscriptions" />
                    <select name="status" defaultValue={row.status} className="field !w-auto !py-1 !text-xs">
                      {["none", "pending", "active", "past_due", "canceled", "incomplete"].map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="btn btn-ghost btn-sm !min-w-11 !px-2" title={t.ui.save}>
                      ✓
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-xs text-muted">
                  {t.admin.subscriptions.empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </ScrollRegion>

      <ul className="grid gap-3 md:grid-cols-2 xl:hidden">
        {rows.map((row) => (
          <li key={row.user_id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 truncate text-xs text-slate-200">{row.email}</p>
              <span className="shrink-0">
                <Badge tone={row.status === "active" ? "ok" : row.status === "pending" ? "warn" : "neutral"}>
                  {row.status}
                </Badge>
              </span>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-muted">{t.admin.subscriptions.channel}</dt>
                <dd>{row.channel}</dd>
              </div>
              <div>
                <dt className="text-muted">{t.admin.subscriptions.provider}</dt>
                <dd>{row.provider}</dd>
              </div>
              <div>
                <dt className="text-muted">{t.admin.subscriptions.periodEnd}</dt>
                <dd className="whitespace-nowrap">
                  {row.current_period_end ? dateFormat.format(new Date(row.current_period_end)) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">{t.admin.subscriptions.updated}</dt>
                <dd className="whitespace-nowrap">{dateFormat.format(new Date(row.updated_at))}</dd>
              </div>
            </dl>

            <form action={setSubscriptionStatusAction} className="mt-3 flex items-center gap-2">
              <input type="hidden" name="userId" value={row.user_id} />
              <input type="hidden" name="returnTo" value="/admin/subscriptions" />
              <select
                name="status"
                defaultValue={row.status}
                className="field min-h-11 !w-auto flex-1 !text-xs"
                aria-label={`${t.admin.subscriptions.setStatus}: ${row.email}`}
              >
                {["none", "pending", "active", "past_due", "canceled", "incomplete"].map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn btn-ghost btn-sm !min-w-11 !px-2" title={t.ui.save}>
                ✓
              </button>
            </form>
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="card p-6 text-center text-xs text-muted">{t.admin.subscriptions.empty}</li>
        ) : null}
      </ul>

      <p className="rounded-xl border border-amber-500/20 bg-amber-500/6 px-3.5 py-3 text-xs leading-relaxed text-amber-200/90">
        {t.admin.subscriptions.note}
      </p>
    </div>
  );
}
