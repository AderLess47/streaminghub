import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { Badge, InfoRow, PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import {
  resetCustomerMfaAction,
  toggleCustomerDisabledAction,
  updateCustomerRoleAction,
} from "@/lib/actions/admin";
import { all, get } from "@/lib/db";
import { requireStaff } from "@/lib/session";

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  role: string;
  email_verified: number;
  created_at: string;
  last_login_at: string | null;
  disabled_at: string | null;
  marketing_opt_in: number;
  locale: string;
};

export const dynamic = "force-dynamic";

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff();
  const { t, locale } = await getI18n();
  const { id } = await params;

  const user = get<UserRow>(`SELECT * FROM users WHERE id = ?`, id);
  if (!user) notFound();

  const devices = all<{ id: string; name: string; platform: string; status: string; activated_at: string | null }>(
    `SELECT id, name, platform, status, activated_at FROM devices WHERE user_id = ? ORDER BY created_at DESC`,
    id,
  );
  const subscription = get<{ status: string; channel: string; provider: string; current_period_end: string | null; cancel_at_period_end: number }>(
    `SELECT status, channel, provider, current_period_end, cancel_at_period_end FROM subscriptions WHERE user_id = ?`,
    id,
  );
  const tickets = all<{ id: string; subject: string; status: string; created_at: string }>(
    `SELECT id, subject, status, created_at FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`,
    id,
  );
  const requests = all<{ kind: string; status: string; created_at: string }>(
    `SELECT kind, status, created_at FROM data_requests WHERE user_id = ? ORDER BY created_at DESC`,
    id,
  );

  const dateFormat = new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const fmt = (value: string | null) => (value ? dateFormat.format(new Date(value)) : "—");

  return (
    <div className="grid gap-5">
      <PageHeader eyebrow={t.admin.customers.detail} title={user.email} description={user.display_name || "—"}>
        <Link href="/admin/customers" className="btn btn-ghost btn-sm">
          <Icon name="arrow-left" size={15} />
          {t.ui.back}
        </Link>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-sm font-semibold">{t.admin.customers.detail}</h2>
          <div className="mt-3">
            <InfoRow label={t.admin.customers.name} value={user.display_name || "—"} />
            <InfoRow label={t.admin.customers.role} value={<Badge tone="brand">{user.role}</Badge>} />
            <InfoRow label={t.admin.customers.verified} value={user.email_verified ? t.ui.yes : t.ui.no} />
            <InfoRow label={t.admin.customers.created} value={fmt(user.created_at)} />
            <InfoRow label={t.admin.customers.lastLogin} value={fmt(user.last_login_at)} />
            <InfoRow label={t.ui.language} value={user.locale} />
            <InfoRow label={t.admin.customers.disable} value={user.disabled_at ? fmt(user.disabled_at) : t.ui.no} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <form action={updateCustomerRoleAction} className="flex items-center gap-1.5">
              <input type="hidden" name="userId" value={user.id} />
              <input type="hidden" name="returnTo" value={`/admin/customers/${user.id}`} />
              <select name="role" defaultValue={user.role} className="field !w-auto !py-1 !text-xs">
                <option value="customer">customer</option>
                <option value="support">support</option>
                <option value="admin">admin</option>
              </select>
              <button type="submit" className="btn btn-outline btn-sm">
                {t.ui.save}
              </button>
            </form>
            <form action={toggleCustomerDisabledAction}>
              <input type="hidden" name="userId" value={user.id} />
              <input type="hidden" name="disable" value={user.disabled_at ? "0" : "1"} />
              <input type="hidden" name="returnTo" value={`/admin/customers/${user.id}`} />
              <button type="submit" className="btn btn-danger btn-sm">
                {user.disabled_at ? t.admin.customers.enable : t.admin.customers.disable}
              </button>
            </form>
            <form action={resetCustomerMfaAction}>
              <input type="hidden" name="userId" value={user.id} />
              <input type="hidden" name="returnTo" value={`/admin/customers/${user.id}`} />
              <button type="submit" className="btn btn-ghost btn-sm">
                {t.admin.customers.resetMfa}
              </button>
            </form>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold">{t.admin.subscriptions.title}</h2>
          {subscription ? (
            <div className="mt-3">
              <InfoRow label={t.admin.subscriptions.status} value={<Badge tone={subscription.status === "active" ? "ok" : "neutral"}>{subscription.status}</Badge>} />
              <InfoRow label={t.admin.subscriptions.channel} value={subscription.channel} />
              <InfoRow label={t.admin.subscriptions.provider} value={subscription.provider} />
              <InfoRow label={t.admin.subscriptions.periodEnd} value={fmt(subscription.current_period_end)} />
              <InfoRow label={t.admin.subscriptions.setStatus} value={subscription.cancel_at_period_end ? t.ui.yes : t.ui.no} />
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted">{t.admin.overview.noData}</p>
          )}

          <h2 className="mt-5 text-sm font-semibold">{t.admin.devices.title}</h2>
          <ul className="mt-2 divide-y divide-line/40">
            {devices.map((device) => (
              <li key={device.id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                <span className="truncate">{device.name} <span className="text-muted">· {device.platform}</span></span>
                <Badge tone={device.status === "active" ? "ok" : "neutral"}>{device.status}</Badge>
              </li>
            ))}
            {devices.length === 0 ? <li className="py-2 text-xs text-muted">{t.admin.devices.empty}</li> : null}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold">{t.admin.tickets.title}</h2>
          <ul className="mt-2 divide-y divide-line/40">
            {tickets.map((ticket) => (
              <li key={ticket.id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                <Link href={`/admin/tickets/${ticket.id}`} className="link truncate">
                  {ticket.subject}
                </Link>
                <Badge tone={ticket.status === "open" ? "warn" : "neutral"}>{ticket.status}</Badge>
              </li>
            ))}
            {tickets.length === 0 ? <li className="py-2 text-xs text-muted">{t.admin.tickets.empty}</li> : null}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold">{t.dashboard.settings.privacyTitle}</h2>
          <ul className="mt-2 divide-y divide-line/40">
            {requests.map((request, index) => (
              <li key={index} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                <span>{request.kind}</span>
                <span className="text-muted">
                  {request.status} · {fmt(request.created_at)}
                </span>
              </li>
            ))}
            {requests.length === 0 ? <li className="py-2 text-xs text-muted">{t.admin.overview.noData}</li> : null}
          </ul>
          <p className="mt-3 text-[0.68rem] leading-relaxed text-muted">
            Datenexporte werden durch den Kunden selbst im Dashboard erzeugt. Löschanfragen werden hier dokumentiert und
            nach Prüfung bearbeitet.
          </p>
        </section>
      </div>
    </div>
  );
}
