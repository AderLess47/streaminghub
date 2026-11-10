import type { Metadata } from "next";
import { ActivateForm } from "@/components/activate-form";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Gerät aktivieren" };

export default async function ActivatePage() {
  const { t } = await getI18n();
  const user = await getSessionUser();

  return (
    <div className="shell py-12 sm:py-16">
      <div className="mx-auto max-w-4xl">
        <PageHeader eyebrow="Kopplung" title={t.activate.title} description={t.activate.subtitle} />

        <div className="mt-8 grid gap-6 md:grid-cols-[1.1fr_0.9fr] md:items-start">
          <ActivateForm
            signedIn={Boolean(user)}
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

          <div className="card p-6">
            <h2 className="text-sm font-semibold">{t.activate.howItWorks}</h2>
            <ol className="mt-4 grid gap-3">
              {t.activate.steps.map((step, index) => (
                <li key={step} className="flex gap-3 text-[0.85rem] leading-relaxed text-muted">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full border border-line bg-white/5 text-[0.65rem] font-semibold text-cyan">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-line/60 bg-white/2 p-3 text-[0.72rem] leading-relaxed text-muted">
              <Icon name="shield" size={14} className="mt-0.5 shrink-0 text-cyan" />
              {t.activate.securityNote}
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-line/60 bg-white/2 p-4 text-xs leading-relaxed text-muted">
          <strong className="text-slate-300">
            {t.help.topics.activate.title}:
          </strong>{" "}
          {t.dashboard.devices.emptyHint}
        </div>
      </div>
    </div>
  );
}
