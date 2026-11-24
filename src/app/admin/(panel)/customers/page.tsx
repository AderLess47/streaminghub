import { CustomerTable } from "@/components/admin/customer-table";
import { Alert, PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import { all, get } from "@/lib/db";
import { likeTerm, parsePage } from "@/lib/pagination";
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
  searchParams: Promise<{ q?: string; ok?: string; page?: string }>;
}) {
  await requireStaff();
  const { t, locale } = await getI18n();
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 80);

  // Suche serverseitig, damit auch Konten jenseits der ersten Seite gefunden
  // werden; die Blätterung hält die Liste unabhängig von der Kontenzahl schnell.
  const where = q ? "WHERE u.email LIKE ? OR u.display_name LIKE ?" : "";
  const filters = q ? [likeTerm(q), likeTerm(q)] : [];
  const total = get<{ c: number }>(`SELECT COUNT(*) AS c FROM users u ${where}`, ...filters)?.c ?? 0;
  const page = parsePage(params.page, total);

  // Die Blätterung bezieht sich immer auf alle Konten. Sobald ein Suchbegriff
  // gesetzt ist, blendet die Tabelle sie aus, weil die Treffer dann vollständig
  // gelistet werden; die Zahlen bleiben trotzdem die der ungefilterten Liste.
  const pagerPage = parsePage(params.page, get<{ c: number }>(`SELECT COUNT(*) AS c FROM users`)?.c ?? 0);

  const rows = all<Row>(
    `SELECT u.id, u.email, u.display_name, u.role, u.email_verified, u.created_at, u.last_login_at, u.disabled_at,
       (SELECT COUNT(*) FROM devices d WHERE d.user_id = u.id AND d.status = 'active') AS devices,
       COALESCE((SELECT s.status FROM subscriptions s WHERE s.user_id = u.id), 'none') AS subscription_status
     FROM users u
     ${where}
     ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
    ...filters,
    page.pageSize,
    page.offset,
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

  const tableRows = rows.map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    verified: Boolean(row.email_verified),
    devices: row.devices,
    subscriptionStatus: row.subscription_status,
    created: dateFormat.format(new Date(row.created_at)),
    disabled: Boolean(row.disabled_at),
  }));

  return (
    <div className="grid gap-5">
      <PageHeader eyebrow={t.admin.nav.customers} title={t.admin.customers.title} description={t.admin.subtitle} />

      {okMessage ? (
        <Alert tone="success" id="customers-flash" autoFocus>
          {okMessage}
        </Alert>
      ) : null}

      <CustomerTable
        rows={tableRows}
        dictionary={t}
        initialQuery={q}
        total={total}
        locale={locale}
        pager={{
          page: pagerPage.page,
          pages: pagerPage.pages,
          total: pagerPage.total,
          previousLabel: t.ui.previous,
          nextLabel: t.ui.next,
          pageLabel: t.ui.pageOf,
        }}
      />
      <p className="text-[0.68rem] leading-relaxed text-muted">
        {t.admin.roles.note}
      </p>
    </div>
  );
}
