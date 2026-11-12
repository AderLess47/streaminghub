import Link from "next/link";
import { Icon } from "@/components/icons";
import { Badge, PageHeader, StatusPill } from "@/components/ui";
import { getI18n } from "@/i18n";
import { all, get } from "@/lib/db";
import { env, isBillingConfigured, isEmailConfigured } from "@/lib/env";
import { requireStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

const count = (sql: string, ...params: (string | number)[]) =>
  get<{ c: number }>(sql, ...params)?.c ?? 0;

export default async function AdminOverviewPage() {
  const staff = await requireStaff();
  const { t, locale } = await getI18n();

  const customers = count(`SELECT COUNT(*) AS c FROM users WHERE role = 'customer'`);
  const devices = count(`SELECT COUNT(*) AS c FROM devices WHERE status = 'active'`);
  const subscriptions = count(`SELECT COUNT(*) AS c FROM subscriptions WHERE status = 'active'`);
  const tickets = count(`SELECT COUNT(*) AS c FROM support_tickets WHERE status != 'closed'`);

  const recentAudit = all<{ id: string; action: string; actor_email: string | null; created_at: string; target_type: string | null }>(
    `SELECT id, action, actor_email, created_at, target_type FROM audit_log ORDER BY created_at DESC LIMIT 8`,
  );
  const recentUsers = all<{ id: string; email: string; display_name: string; created_at: string; role: string }>(
    `SELECT id, email, display_name, created_at, role FROM users ORDER BY created_at DESC LIMIT 6`,
  );

  const dateFormat = new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    dateStyle: "short",
    timeStyle: "short",
  });

  const kpis = [
    { label: t.admin.overview.customers, value: customers, href: "/admin/customers", icon: "users" as const },
    { label: t.admin.overview.devices, value: devices, href: "/admin/devices", icon: "devices" as const },
    { label: t.admin.overview.subscriptions, value: subscriptions, href: "/admin/subscriptions", icon: "card" as const },
    { label: t.admin.overview.tickets, value: tickets, href: "/admin/tickets", icon: "mail" as const },
  ];

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader eyebrow={t.admin.title} title={t.admin.nav.overview} description={t.admin.subtitle} />

      {!staff.mfaEnrolled ? (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-sm text-amber-100">
          <p>{t.admin.overview.mfaBanner}</p>
          <Link href="/admin/mfa" className="btn btn-outline btn-sm mt-2">
            {t.admin.overview.setupMfa}
          </Link>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <Link key={kpi.label} href={kpi.href} className="card card-hover p-4">
            <div className="flex items-center justify-between">
              <span className="text-[0.68rem] uppercase tracking-[0.1em] text-muted">{kpi.label}</span>
              <Icon name={kpi.icon} size={16} className="text-cyan" />
            </div>
            <p className="mt-2 text-2xl font-semibold">{kpi.value}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-sm font-semibold">{t.admin.overview.recentSignups}</h2>
          <ul className="mt-3 divide-y divide-line/40">
            {recentUsers.map((user) => (
              <li key={user.id} className="flex items-center justify-between gap-2 py-2 text-xs">
                <div className="min-w-0">
                  <p className="truncate text-slate-200">{user.email}</p>
                  <p className="text-[0.68rem] text-muted">
                    {user.display_name || "—"} · {dateFormat.format(new Date(user.created_at))}
                  </p>
                </div>
                <Badge tone={user.role === "customer" ? "neutral" : "brand"}>{user.role}</Badge>
              </li>
            ))}
            {recentUsers.length === 0 ? <li className="py-2 text-xs text-muted">{t.admin.overview.noData}</li> : null}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold">{t.admin.overview.recentAudit}</h2>
          <ul className="mt-3 divide-y divide-line/40">
            {recentAudit.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-2 py-2 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-mono text-[0.7rem] text-slate-300">{entry.action}</p>
                  <p className="text-[0.68rem] text-muted">
                    {entry.actor_email ?? "system"} · {dateFormat.format(new Date(entry.created_at))}
                  </p>
                </div>
                {entry.target_type ? <span className="chip">{entry.target_type}</span> : null}
              </li>
            ))}
          </ul>
          <Link href="/admin/audit" className="link mt-2 inline-block text-xs">
            {t.admin.nav.audit}
          </Link>
        </section>
      </div>

      <section className="card p-5">
        <h2 className="text-sm font-semibold">{t.admin.overview.systemTitle}</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <li className="flex items-center justify-between gap-2 rounded-lg border border-line/50 px-3 py-2 text-xs">
            <span>{t.admin.status.email}</span>
            <StatusPill status={isEmailConfigured() ? "operational" : "not_configured"} />
          </li>
          <li className="flex items-center justify-between gap-2 rounded-lg border border-line/50 px-3 py-2 text-xs">
            <span>{t.admin.status.billing}</span>
            <StatusPill status={isBillingConfigured() ? "operational" : "not_configured"} />
          </li>
          <li className="flex items-center justify-between gap-2 rounded-lg border border-line/50 px-3 py-2 text-xs">
            <span>{t.admin.status.downloads}</span>
            <StatusPill status={Object.values(env.downloads).some(Boolean) ? "operational" : "not_configured"} />
          </li>
          <li className="flex items-center justify-between gap-2 rounded-lg border border-line/50 px-3 py-2 text-xs">
            <span>{t.admin.status.database}</span>
            <StatusPill status="operational" />
          </li>
        </ul>
      </section>
    </div>
  );
}
