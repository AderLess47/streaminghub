import Link from "next/link";
import { Icon } from "@/components/icons";
import { Alert, Badge, PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import {
  resetCustomerMfaAction,
  toggleCustomerDisabledAction,
  updateCustomerRoleAction,
} from "@/lib/actions/admin";
import { all } from "@/lib/db";
import { requireStaff } from "@/lib/session";

type Row = {
  id: string;
  email: string;
  display_name: string;
  role: string;
  email_verified: number;
  created_at: string;
  last_login_at: string | null;
  disabled_at: string | null;
  devices: number;
  subscription_status: string;
};

export const dynamic = "force-dynamic";

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; ok?: string }>;
}) {
  await requireStaff();
  const { t, locale } = await getI18n();
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 80);
  const like = `%${q}%`;

  const rows = all<Row>(
    `SELECT u.id, u.email, u.display_name, u.role, u.email_verified, u.created_at, u.last_login_at, u.disabled_at,
       (SELECT COUNT(*) FROM devices d WHERE d.user_id = u.id AND d.status = 'active') AS devices,
       COALESCE((SELECT s.status FROM subscriptions s WHERE s.user_id = u.id), 'none') AS subscription_status
     FROM users u
     ${q ? "WHERE u.email LIKE ? OR u.display_name LIKE ?" : ""}
     ORDER BY u.created_at DESC LIMIT 100`,
    ...(q ? [like, like] : []),
  );

  const dateFormat = new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", { dateStyle: "short" });
  const okMessage =
    params.ok === "role"
      ? "Rolle aktualisiert."
      : params.ok === "status"
        ? "Kontostatus aktualisiert."
        : params.ok === "mfa"
          ? "MFA wurde zurückgesetzt."
          : null;

  return (
    <div className="grid gap-5">
      <PageHeader eyebrow={t.admin.nav.customers} title={t.admin.customers.title} description={t.admin.subtitle} />

      {okMessage ? <Alert tone="success">{okMessage}</Alert> : null}

      <form method="get" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={t.admin.customers.search}
          className="field max-w-sm"
          aria-label={t.admin.customers.search}
        />
        <button type="submit" className="btn btn-outline btn-sm">
          <Icon name="search" size={14} />
          {t.ui.search}
        </button>
      </form>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t.admin.customers.email}</th>
              <th>{t.admin.customers.role}</th>
              <th>{t.admin.customers.verified}</th>
              <th>{t.admin.customers.devices}</th>
              <th>{t.admin.customers.subscription}</th>
              <th>{t.admin.customers.created}</th>
              <th>{t.ui.actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={`/admin/customers/${row.id}`} className="link text-[0.82rem]">
                    {row.email}
                  </Link>
                  <p className="text-[0.68rem] text-muted">
                    {row.display_name || "—"}
                    {row.disabled_at ? " · deaktiviert" : ""}
                  </p>
                </td>
                <td>
                  <form action={updateCustomerRoleAction} className="flex items-center gap-1.5">
                    <input type="hidden" name="userId" value={row.id} />
                    <input type="hidden" name="returnTo" value="/admin/customers" />
                    <select name="role" defaultValue={row.role} className="field !w-auto !py-1 !text-xs">
                      <option value="customer">customer</option>
                      <option value="support">support</option>
                      <option value="admin">admin</option>
                    </select>
                    <button type="submit" className="btn btn-ghost btn-sm !px-2" title={t.ui.save}>
                      <Icon name="check" size={13} />
                    </button>
                  </form>
                </td>
                <td>{row.email_verified ? <Badge tone="ok">✓</Badge> : <Badge tone="warn">—</Badge>}</td>
                <td>{row.devices}</td>
                <td>
                  <Badge tone={row.subscription_status === "active" ? "ok" : "neutral"}>{row.subscription_status}</Badge>
                </td>
                <td className="whitespace-nowrap text-xs">{dateFormat.format(new Date(row.created_at))}</td>
                <td>
                  <div className="flex items-center gap-1">
                    <form action={toggleCustomerDisabledAction}>
                      <input type="hidden" name="userId" value={row.id} />
                      <input type="hidden" name="disable" value={row.disabled_at ? "0" : "1"} />
                      <input type="hidden" name="returnTo" value="/admin/customers" />
                      <button type="submit" className="btn btn-ghost btn-sm !px-2" title={row.disabled_at ? t.admin.customers.enable : t.admin.customers.disable}>
                        <Icon name={row.disabled_at ? "check" : "close"} size={13} />
                      </button>
                    </form>
                    <form action={resetCustomerMfaAction}>
                      <input type="hidden" name="userId" value={row.id} />
                      <input type="hidden" name="returnTo" value="/admin/customers" />
                      <button type="submit" className="btn btn-ghost btn-sm !px-2" title={t.admin.customers.resetMfa}>
                        <Icon name="shield" size={13} />
                      </button>
                    </form>
                    <Link href={`/admin/customers/${row.id}`} className="btn btn-ghost btn-sm !px-2" title={t.ui.details}>
                      <Icon name="arrow-right" size={13} />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-xs text-muted">
                  {t.ui.noResults}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="text-[0.68rem] leading-relaxed text-muted">
        {t.admin.roles.note}
      </p>
    </div>
  );
}
