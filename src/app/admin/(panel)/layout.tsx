import Link from "next/link";
import { DashboardNav, type DashNavItem } from "@/components/dashboard-nav";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui";
import { getI18n } from "@/i18n";
import { logoutAction } from "@/lib/actions/auth";
import { requireStaff } from "@/lib/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const { t } = await getI18n();

  const items: DashNavItem[] = [
    { href: "/admin", label: t.admin.nav.overview, icon: "activity" },
    { href: "/admin/customers", label: t.admin.nav.customers, icon: "users" },
    { href: "/admin/devices", label: t.admin.nav.devices, icon: "devices" },
    { href: "/admin/subscriptions", label: t.admin.nav.subscriptions, icon: "card" },
    { href: "/admin/pairing", label: t.admin.nav.pairing, icon: "key" },
    { href: "/admin/tickets", label: t.admin.nav.tickets, icon: "mail" },
    { href: "/admin/emails", label: t.admin.nav.emails, icon: "file-text" },
    { href: "/admin/content", label: t.admin.nav.content, icon: "layers" },
    { href: "/admin/roles", label: t.admin.nav.roles, icon: "shield" },
    { href: "/admin/status", label: t.admin.nav.status, icon: "server" },
    { href: "/admin/audit", label: t.admin.nav.audit, icon: "list" },
  ];

  return (
    <div className="shell grid gap-6 py-8 lg:grid-cols-[16rem_1fr] lg:gap-8 lg:py-10">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="card mb-4 p-4">
          <p className="flex items-center gap-2 text-[0.68rem] uppercase tracking-[0.12em] text-muted">
            <Icon name="shield" size={13} className="text-cyan" />
            {t.admin.title}
          </p>
          <p className="mt-2 truncate text-sm font-semibold">{user.displayName || user.email}</p>
          <p className="truncate text-[0.72rem] text-muted">{user.email}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="brand">{user.role}</Badge>
            <Badge tone="ok">MFA</Badge>
          </div>
        </div>

        <DashboardNav items={items} />

        <div className="mt-3 hidden gap-1 border-t border-line/50 pt-3 lg:grid">
          <Link href="/dashboard" className="btn btn-ghost btn-sm justify-start">
            <Icon name="grid" size={15} />
            {t.nav.dashboard}
          </Link>
          <Link href="/" className="btn btn-ghost btn-sm justify-start">
            <Icon name="arrow-left" size={15} />
            {t.admin.nav.backToSite}
          </Link>
          <form action={logoutAction}>
            <button type="submit" className="btn btn-ghost btn-sm w-full justify-start">
              <Icon name="logout" size={15} />
              {t.nav.logout}
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
