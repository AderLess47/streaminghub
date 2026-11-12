import Link from "next/link";
import {
  DataRequestForm,
  PasswordForm,
  ProfileForm,
  SessionsForm,
} from "@/components/dashboard-forms";
import { Icon } from "@/components/icons";
import { Alert, PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import type { Locale } from "@/i18n/config";
import {
  changePasswordAction,
  dataRequestAction,
  signOutOtherSessionsAction,
  updateProfileAction,
} from "@/lib/actions/dashboard";
import { all, get } from "@/lib/db";
import { requireUser } from "@/lib/session";

export default async function SettingsPage() {
  const user = await requireUser();
  const { t } = await getI18n();

  const profile = get<{ marketing_opt_in: number; locale: string }>(
    `SELECT marketing_opt_in, locale FROM users WHERE id = ?`,
    user.id,
  );
  const exportRequest = get<{ created_at: string }>(
    `SELECT created_at FROM data_requests WHERE user_id = ? AND kind = 'export' ORDER BY created_at DESC LIMIT 1`,
    user.id,
  );
  const pendingDeletion = get<{ created_at: string }>(
    `SELECT created_at FROM data_requests WHERE user_id = ? AND kind = 'deletion' AND status = 'requested' ORDER BY created_at DESC LIMIT 1`,
    user.id,
  );
  const sessions = all<{ created_at: string; ip: string | null }>(
    `SELECT created_at, ip FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC LIMIT 5`,
    user.id,
  );

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={t.dashboard.nav.settings}
        title={t.dashboard.settings.title}
        description={t.dashboard.settings.emailNote}
      />

      {pendingDeletion ? (
        <Alert tone="warning" title={t.dashboard.settings.deleteCta}>
          {t.dashboard.settings.deleteNote}
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <section className="card p-5">
          <h2 className="text-base font-semibold">{t.dashboard.settings.profileTitle}</h2>
          <div className="mt-4">
            <ProfileForm
              action={updateProfileAction}
              t={t.dashboard.settings}
              busy={t.ui.saving}
              user={{
                displayName: user.displayName,
                email: user.email,
                locale: ((profile?.locale ?? user.locale) as Locale),
                marketingOptIn: Boolean(profile?.marketing_opt_in),
              }}
            />
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-base font-semibold">{t.dashboard.settings.passwordTitle}</h2>
          <div className="mt-4">
            <PasswordForm action={changePasswordAction} t={t.dashboard.settings} busy={t.ui.saving} />
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-base font-semibold">{t.dashboard.settings.privacyTitle}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">{t.dashboard.settings.exportNote}</p>
          <div className="mt-4 grid gap-3">
            <DataRequestForm
              action={dataRequestAction}
              t={t.dashboard.settings}
              busy={t.ui.saving}
              kind="export"
              label={t.dashboard.settings.exportCta}
              description={t.dashboard.settings.exportNote}
              confirmText={
                "Ich bestätige, dass ich einen Export meiner gespeicherten Kontodaten anfordere."
              }
            />
            {exportRequest ? (
              <a href="/api/account/export" className="btn btn-outline btn-sm justify-self-start">
                <Icon name="download" size={14} />
                {t.dashboard.settings.downloadExport}
              </a>
            ) : null}
            <DataRequestForm
              action={dataRequestAction}
              t={t.dashboard.settings}
              busy={t.ui.saving}
              kind="deletion"
              label={t.dashboard.settings.deleteCta}
              description={t.dashboard.settings.deleteNote}
              confirmText={
                "Ich bestätige, dass ich die Löschung meines Kontos beantragen möchte."
              }
              danger
            />
          </div>
          <p className="mt-3 text-[0.68rem] leading-relaxed text-muted">
            {t.dashboard.settings.deleteNote}{" "}
            <Link href="/privacy" className="link">
              {t.footer.privacy}
            </Link>
          </p>
        </section>

        <section className="card p-5">
          <h2 className="text-base font-semibold">{t.dashboard.settings.sessionsTitle}</h2>
          <p className="mt-1 text-xs text-muted">{t.dashboard.settings.sessionsNote}</p>
          <ul className="mt-3 grid gap-1.5 text-[0.72rem] text-muted">
            {sessions.map((session, index) => (
              <li key={index} className="flex justify-between gap-2 border-b border-line/40 pb-1.5">
                <span>{session.ip ?? "—"}</span>
                <span>{new Date(session.created_at).toLocaleString("de-DE")}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <SessionsForm action={signOutOtherSessionsAction} t={t.dashboard.settings} busy={t.ui.saving} />
          </div>
        </section>
      </div>
    </div>
  );
}
