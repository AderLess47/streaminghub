import { Icon } from "@/components/icons";
import { ScrollRegion } from "@/components/scroll-region";
import { Badge, PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import { revokeDeviceAction } from "@/lib/actions/admin";
import { all } from "@/lib/db";
import { requireStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminDevicesPage() {
  await requireStaff();
  const { t, locale } = await getI18n();

  const devices = all<{
    id: string;
    name: string;
    platform: string;
    status: string;
    activated_at: string | null;
    last_seen_at: string | null;
    email: string | null;
  }>(
    `SELECT d.id, d.name, d.platform, d.status, d.activated_at, d.last_seen_at, u.email
     FROM devices d LEFT JOIN users u ON u.id = d.user_id
     ORDER BY d.created_at DESC LIMIT 200`,
  );

  const dateFormat = new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", { dateStyle: "short" });

  return (
    <div className="grid gap-5">
      <PageHeader eyebrow={t.admin.nav.devices} title={t.admin.devices.title} description={t.admin.subtitle} />

      <ScrollRegion label={t.admin.devices.title} className="card overflow-x-auto">
        <table className="data-table">
          <caption className="sr-only">{t.admin.devices.title}</caption>
          <thead>
            <tr>
              <th>{t.admin.devices.name}</th>
              <th>{t.admin.devices.owner}</th>
              <th>{t.admin.devices.platform}</th>
              <th>{t.admin.devices.status}</th>
              <th>{t.admin.devices.activated}</th>
              <th>{t.admin.devices.lastSeen}</th>
              <th>{t.ui.actions}</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => (
              <tr key={device.id}>
                <td>{device.name}</td>
                <td className="text-xs">{device.email ?? "—"}</td>
                <td className="text-xs">{device.platform}</td>
                <td>
                  <Badge tone={device.status === "active" ? "ok" : "neutral"}>{device.status}</Badge>
                </td>
                <td className="whitespace-nowrap text-xs">{device.activated_at ? dateFormat.format(new Date(device.activated_at)) : "—"}</td>
                <td className="whitespace-nowrap text-xs">{device.last_seen_at ? dateFormat.format(new Date(device.last_seen_at)) : "—"}</td>
                <td>
                  {device.status === "active" ? (
                    <form action={revokeDeviceAction}>
                      <input type="hidden" name="deviceId" value={device.id} />
                      <input type="hidden" name="returnTo" value="/admin/devices" />
                      <button type="submit" className="btn btn-danger btn-sm">
                        <Icon name="close" size={13} />
                        {t.admin.devices.revoke}
                      </button>
                    </form>
                  ) : (
                    <span className="text-[0.68rem] text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
            {devices.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-xs text-muted">
                  {t.admin.devices.empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </ScrollRegion>
    </div>
  );
}
