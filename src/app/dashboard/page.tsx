import Link from "next/link";
import { ActivateForm } from "@/components/activate-form";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Icon } from "@/components/icons";
import { ResendVerification } from "@/components/resend-verification";
import { Alert, Badge, EmptyState, InfoRow } from "@/components/ui";
import { getI18n } from "@/i18n";
import { removeDeviceAction } from "@/lib/actions/dashboard";
import { all, get } from "@/lib/db";
import { effectiveStatus, ensureSubscription } from "@/lib/payments";
import { requireUser } from "@/lib/session";

type DeviceRow = {
  id: string;
  name: string;
  platform: string;
  status: string;
  activated_at: string | null;
  last_seen_at: string | null;
};

export default async function DashboardPage() {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const subscription = ensureSubscription(user.id);
  const status = effectiveStatus(subscription);

  const devices = all<DeviceRow>(
    `SELECT id, name, platform, status, activated_at, last_seen_at
     FROM devices WHERE user_id = ? ORDER BY activated_at DESC`,
    user.id,
  );
  const openTickets =
    get<{ c: number }>(
      `SELECT COUNT(*) AS c FROM support_tickets WHERE user_id = ? AND status != 'closed'`,
      user.id,
    )?.c ?? 0;

  const planLabel =
    status === "active"
      ? t.dashboard.overview.planPremium
      : status === "pending"
        ? t.dashboard.overview.planPending
        : t.dashboard.overview.planFree;

  const dateFormat = new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    dateStyle: "medium",
  });

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">{t.dashboard.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {t.dashboard.welcome}, {user.displayName || user.email}
          </p>
        </div>
        <Link href="/activate" className="btn btn-primary btn-sm">
          <Icon name="key" size={15} />
          {t.dashboard.overview.activateDevice}
        </Link>
      </div>

      {!user.emailVerified ? (
        <Alert tone="warning" title={t.dashboard.overview.verifyEmailBanner}>
          <div className="mt-2">
            <ResendVerification
              label={t.auth.verifyResend}
              hint={t.auth.devLinkHint}
            />
          </div>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-[0.68rem] uppercase tracking-[0.1em] text-muted">
            {t.dashboard.overview.devicesTitle}
          </p>
          <p className="mt-2 text-2xl font-semibold">{devices.filter((d) => d.status === "active").length}</p>
          <p className="text-xs text-muted">{t.dashboard.overview.devicesCount}</p>
        </div>
        <div className="card p-4">
          <p className="text-[0.68rem] uppercase tracking-[0.1em] text-muted">
            {t.dashboard.overview.planTitle}
          </p>
          <p className="mt-2 text-sm font-semibold">{planLabel}</p>
          <Link href="/dashboard/subscription" className="link mt-1 inline-block text-xs">
            {t.dashboard.overview.manageSubscription}
          </Link>
        </div>
        <div className="card p-4">
          <p className="text-[0.68rem] uppercase tracking-[0.1em] text-muted">
            {t.dashboard.overview.supportTitle}
          </p>
          <p className="mt-2 text-2xl font-semibold">{openTickets}</p>
          <p className="text-xs text-muted">{t.dashboard.overview.supportOpen}</p>
        </div>
      </div>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">{t.dashboard.devices.title}</h2>
            <p className="text-xs text-muted">{t.dashboard.devices.subtitle}</p>
          </div>
          <Badge tone="brand">{devices.filter((d) => d.status === "active").length}</Badge>
        </div>

        {devices.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon="devices"
              title={t.dashboard.devices.empty}
              description={t.dashboard.devices.emptyHint}
            />
          </div>
        ) : (
          <ul className="mt-4 grid gap-2.5">
            {devices.map((device) => (
              <li
                key={device.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line/60 bg-white/2 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-white/4 text-cyan">
                    <Icon name={device.platform === "firetv" ? "tv" : device.platform === "androidtv" ? "devices" : "phone"} size={17} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{device.name}</p>
                    <p className="text-[0.7rem] text-muted">
                      {device.platform} ·{" "}
                      {device.activated_at
                        ? `${t.dashboard.devices.activatedAt} ${dateFormat.format(new Date(device.activated_at))}`
                        : "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={device.status === "active" ? "ok" : "neutral"}>
                    {device.status === "active" ? t.dashboard.devices.statusActive : t.dashboard.devices.statusRevoked}
                  </Badge>
                  {device.status === "active" ? (
                    <form action={removeDeviceAction}>
                      <input type="hidden" name="deviceId" value={device.id} />
                      <ConfirmSubmitButton message={t.dashboard.devices.removeConfirm}>
                        {t.dashboard.devices.remove}
                      </ConfirmSubmitButton>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
        <div className="card p-5">
          <h2 className="text-base font-semibold">{t.dashboard.devices.pairingTitle}</h2>
          <p className="mt-1 text-xs text-muted">{t.dashboard.devices.pairingSubtitle}</p>
          <div className="mt-4">
            <ActivateForm
              signedIn
              labels={{
                code: t.activate.codeLabel,
                codePlaceholder: t.activate.codePlaceholder,
                device: t.activate.deviceLabel,
                devicePlaceholder: t.activate.devicePlaceholder,
                submit: t.activate.submit,
                invalid: t.activate.invalidCode,
                tooMany: t.activate.tooManyAttempts,
                successTitle: t.activate.successTitle,
                successBody: t.activate.successBody,
                loginRequired: t.activate.loginRequired,
                toLogin: t.nav.login,
                toDashboard: t.nav.dashboard,
                securityNote: t.activate.securityNote,
              }}
            />
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-base font-semibold">{t.dashboard.overview.quickActions}</h2>
          <div className="mt-3">
            <InfoRow label={t.dashboard.subscription.status} value={status} />
            <InfoRow
              label={t.dashboard.subscription.channel}
              value={subscription.channel === "amazon" ? t.dashboard.subscription.channelAmazon : t.dashboard.subscription.channelWeb}
            />
          </div>
          <div className="mt-4 grid gap-2">
            <Link href="/dashboard/subscription" className="btn btn-outline btn-sm btn-block">
              {t.dashboard.overview.manageSubscription}
            </Link>
            <Link href="/dashboard/support" className="btn btn-ghost btn-sm btn-block">
              {t.dashboard.overview.contactSupport}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
