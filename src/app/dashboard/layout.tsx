import Link from "next/link";
import { DashboardNav, type DashNavItem } from "@/components/dashboard-nav";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui";
import { getI18n } from "@/i18n";
import { logoutAction } from "@/lib/actions/auth";
import { isStaff, requireUser } from "@/lib/session";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { t } = await getI18n();

  const items: DashNavItem[] = [
    { href: "/dashboard", label: t.dashboard.nav.overview, icon: "grid" },
    { href: "/dashboard/subscription", label: t.dashboard.nav.subscription, icon: "card" },
    { href: "/dashboard/support", label: t.dashboard.nav.support, icon: "mail" },
    { href: "/dashboard/settings", label: t.dashboard.nav.settings, icon: "settings" },
    { href: "/activate", label: t.nav.activate, icon: "key" },
  ];

  return (
    <div className="shell grid grid-cols-1 gap-6 py-8 lg:grid-cols-[15rem_1fr] lg:gap-8 lg:py-10">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="card mb-4 hidden p-4 lg:block">
          <p className="text-[0.68rem] uppercase tracking-[0.12em] text-muted">{t.dashboard.welcome}</p>
          <p className="mt-1 truncate text-sm font-semibold">{user.displayName || user.email}</p>
          <p className="truncate text-[0.72rem] text-muted">{user.email}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={user.role === "customer" ? "neutral" : "brand"}>
              {user.role === "customer" ? "Customer" : user.role}
            </Badge>
            {!user.emailVerified ? <Badge tone="warn">{t.ui.required}</Badge> : null}
          </div>
        </div>

        <DashboardNav items={items} currentLabel={t.dashboard.nav.currentPage} />

        <div className="mt-3 hidden gap-2 border-t border-line/50 pt-3 lg:grid">
          {isStaff(user.role) ? (
            <Link href="/admin" className="btn btn-ghost btn-sm justify-start">
              <Icon name="shield" size={15} />
              {t.nav.admin}
            </Link>
          ) : null}
          <Link href="/" className="btn btn-ghost btn-sm justify-start">
            <Icon name="arrow-left" size={15} />
            {t.errors.toHome}
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
