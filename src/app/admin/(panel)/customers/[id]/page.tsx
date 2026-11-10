import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Icon } from "@/components/icons";
import { Alert, Badge, InfoRow, PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import {
  deleteCustomerPlaylistAction,
  resetCustomerMfaAction,
  saveCustomerPlaylistAction,
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const staff = await requireStaff();
  const { t, locale } = await getI18n();
  const { id } = await params;
  const query = await searchParams;

  const user = get<UserRow>(`SELECT * FROM users WHERE id = ?`, id);
  if (!user) notFound();

  const devices = all<{ id: string; name: string; platform: string; status: string; activated_at: string | null }>(
    `SELECT id, name, platform, status, activated_at FROM devices WHERE user_id = ? ORDER BY created_at DESC`,
    id,
  );
  const playlist = get<{
    url: string;
    device_id: string | null;
    device_name: string | null;
    customer_requested: number;
    updated_at: string;
    updated_by_email: string | null;
  }>(
    `SELECT p.url, p.device_id, d.name AS device_name, p.customer_requested, p.updated_at, u.email AS updated_by_email
     FROM customer_playlists p
     LEFT JOIN users u ON u.id = p.updated_by
     LEFT JOIN devices d ON d.id = p.device_id
     WHERE p.user_id = ?`,
    id,
  );
  const activeDevices = devices.filter((device) => device.status === "active");
  const playlistDeviceInactive =
    Boolean(playlist?.device_id) && !activeDevices.some((device) => device.id === playlist?.device_id);

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

      {query.ok === "playlist" ? (
        <Alert tone="success">{t.admin.customers.playlistSaved}</Alert>
      ) : null}
      {query.ok === "playlist-deleted" ? (
        <Alert tone="success">{t.admin.customers.playlistDeleted}</Alert>
      ) : null}
      {query.error === "playlist" ? (
        <Alert tone="danger">{t.admin.customers.playlistInvalid}</Alert>
      ) : null}
      {query.error === "playlist-request" ? (
        <Alert tone="danger">{t.admin.customers.playlistRequestRequired}</Alert>
      ) : null}
      {query.error === "playlist-device" ? (
        <Alert tone="danger">{t.admin.customers.playlistDeviceRequired}</Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {staff.role === "admin" ? (
          <section className="card p-5 lg:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">{t.admin.customers.playlistTitle}</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {t.admin.customers.playlistDescription}
                </p>
              </div>
              <Badge tone={playlist ? (playlist.customer_requested ? "ok" : "danger") : "warn"}>
                {playlist
                  ? playlist.customer_requested
                    ? t.admin.customers.playlistConfigured
                    : t.admin.customers.playlistUnconfirmedBadge
                  : t.admin.customers.playlistMissing}
              </Badge>
            </div>

            {playlist && !playlist.customer_requested ? (
              <Alert tone="danger">{t.admin.customers.playlistUnconfirmed}</Alert>
            ) : null}
            {playlistDeviceInactive ? (
              <Alert tone="danger">{t.admin.customers.playlistDeviceInactive}</Alert>
            ) : null}

            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_20rem]">
              <form action={saveCustomerPlaylistAction} className="grid gap-3">
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="returnTo" value={`/admin/customers/${user.id}`} />
                <div>
                  <label htmlFor="customer-playlist-url" className="field-label">
                    {t.admin.customers.playlistUrl}
                  </label>
                  <input
                    id="customer-playlist-url"
                    name="url"
                    type="url"
                    required
                    defaultValue={playlist?.url ?? ""}
                    placeholder={t.admin.customers.playlistPlaceholder}
                    className="field font-mono text-xs"
                    autoComplete="off"
                    spellCheck={false}
                    dir="ltr"
                  />
                  <p className="mt-1.5 text-[0.68rem] leading-relaxed text-muted">
                    {t.admin.customers.playlistHint}
                  </p>
                </div>
                <div>
                  <label htmlFor="customer-playlist-device" className="field-label">
                    {t.admin.customers.playlistDevice}
                  </label>
                  <select
                    id="customer-playlist-device"
                    name="deviceId"
                    required
                    defaultValue={playlist?.device_id ?? ""}
                    disabled={activeDevices.length === 0}
                    className="field"
                  >
                    <option value="" disabled>
                      {t.admin.customers.playlistDevicePlaceholder}
                    </option>
                    {activeDevices.map((device) => (
                      <option key={device.id} value={device.id}>
                        {device.name} · {device.platform}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-[0.68rem] leading-relaxed text-muted">
                    {t.admin.customers.playlistDeviceHint}
                  </p>
                  {activeDevices.length === 0 ? (
                    <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/6 p-2.5 text-[0.68rem] leading-relaxed text-amber-200/90">
                      {t.admin.customers.playlistNoActiveDevices}
                    </p>
                  ) : null}
                </div>
                <label className="flex items-start gap-2 rounded-lg border border-line/60 bg-white/2 p-3 text-xs leading-relaxed">
                  <input type="checkbox" name="customerRequested" value="1" required className="mt-0.5" />
                  <span>{t.admin.customers.playlistCustomerRequest}</span>
                </label>
                <p className="text-[0.68rem] leading-relaxed text-muted">
                  {t.admin.customers.playlistSourceWarning}
                </p>
                <button
                  type="submit"
                  disabled={activeDevices.length === 0}
                  className="btn btn-primary btn-sm justify-self-start"
                >
                  {playlist ? t.ui.save : t.admin.customers.playlistAdd}
                </button>
              </form>

              <div className="rounded-xl border border-line/60 bg-white/2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold">{t.admin.customers.playlistDevices}</h3>
                  <Badge tone="brand">{activeDevices.length}</Badge>
                </div>
                <ul className="mt-2 divide-y divide-line/40">
                  {devices.map((device) => (
                    <li key={device.id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                      <span className="truncate">
                        {device.name} <span className="text-muted">· {device.platform}</span>
                      </span>
                      <Badge tone={device.status === "active" ? "ok" : "neutral"}>{device.status}</Badge>
                    </li>
                  ))}
                  {devices.length === 0 ? (
                    <li className="py-2 text-xs text-muted">{t.admin.devices.empty}</li>
                  ) : null}
                </ul>
                {playlist ? (
                  <div className="mt-3">
                    <InfoRow label={t.admin.customers.playlistUpdated} value={fmt(playlist.updated_at)} />
                    <InfoRow label={t.admin.customers.playlistUpdatedBy} value={playlist.updated_by_email ?? "—"} />
                    <InfoRow
                      label={t.admin.customers.playlistDevice}
                      value={playlist.device_name ?? t.admin.customers.playlistAllDevices}
                    />
                  </div>
                ) : null}
              </div>
            </div>

            {playlist ? (
              <form action={deleteCustomerPlaylistAction} className="mt-4 border-t border-line/40 pt-3">
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="returnTo" value={`/admin/customers/${user.id}`} />
                <ConfirmSubmitButton message={t.admin.customers.playlistDeleteConfirm}>
                  {t.admin.customers.playlistDelete}
                </ConfirmSubmitButton>
              </form>
            ) : null}

            <p className="mt-3 text-[0.68rem] leading-relaxed text-muted">
              {t.admin.customers.playlistSecurityNote}
            </p>
          </section>
        ) : null}

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
