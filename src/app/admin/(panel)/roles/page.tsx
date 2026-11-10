import { Badge, PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import { all } from "@/lib/db";
import { requireStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

const PERMISSIONS = [
  { area: "Kundenübersicht lesen", customer: false, support: true, admin: true },
  { area: "Geräte entkoppeln", customer: false, support: true, admin: true },
  { area: "Abonnementstatus setzen", customer: false, support: true, admin: true },
  { area: "Support-Anfragen beantworten", customer: false, support: true, admin: true },
  { area: "Aktivierungscodes sperren", customer: false, support: true, admin: true },
  { area: "Rollen ändern", customer: false, support: false, admin: true },
  { area: "Konten deaktivieren", customer: false, support: false, admin: true },
  { area: "MFA zurücksetzen", customer: false, support: false, admin: true },
  { area: "FAQ & Ankündigungen bearbeiten", customer: false, support: false, admin: true },
  { area: "Eigene Geräte & Abonnement", customer: true, support: true, admin: true },
];

export default async function AdminRolesPage() {
  await requireStaff();
  const { t } = await getI18n();

  const staff = all<{ email: string; role: string; mfa_confirmed: string | null; created_at: string }>(
    `SELECT u.email, u.role, m.confirmed_at AS mfa_confirmed, u.created_at
     FROM users u LEFT JOIN mfa_secrets m ON m.user_id = u.id
     WHERE u.role IN ('support', 'admin') ORDER BY u.role, u.email`,
  );

  return (
    <div className="grid gap-5">
      <PageHeader eyebrow={t.admin.nav.roles} title={t.admin.roles.title} description={t.admin.roles.subtitle} />

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t.admin.roles.permissions}</th>
              <th>customer</th>
              <th>support</th>
              <th>admin</th>
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((permission) => (
              <tr key={permission.area}>
                <td>{permission.area}</td>
                <td>{permission.customer ? "✓" : "—"}</td>
                <td>{permission.support ? "✓" : "—"}</td>
                <td>{permission.admin ? "✓" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card p-5">
        <h2 className="text-sm font-semibold">{t.admin.nav.roles} – {t.admin.roles.role}</h2>
        <ul className="mt-3 divide-y divide-line/40">
          {staff.map((member) => (
            <li key={member.email} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
              <span className="text-slate-200">{member.email}</span>
              <span className="flex items-center gap-2">
                <Badge tone="brand">{member.role}</Badge>
                <Badge tone={member.mfa_confirmed ? "ok" : "warn"}>
                  {member.mfa_confirmed ? "MFA aktiv" : t.admin.roles.mfaRequired}
                </Badge>
              </span>
            </li>
          ))}
          {staff.length === 0 ? <li className="py-2 text-xs text-muted">{t.admin.overview.noData}</li> : null}
        </ul>
        <p className="mt-3 text-[0.7rem] leading-relaxed text-muted">{t.admin.roles.note}</p>
      </section>
    </div>
  );
}
