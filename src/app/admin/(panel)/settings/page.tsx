import { Alert, PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import { saveMonetizationAction } from "@/lib/actions/admin";
import { getSetting } from "@/lib/content";
import { FEATURE_FLAGS, isEnabledValue } from "@/lib/flags";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Schalter für die Monetarisierungs-Funktionen.
 *
 * Ein Flag aus heißt: Das Verhalten bleibt wie ohne die Funktion. Die Werte
 * liegen in `settings` und gelten sofort – ein Deploy ist nicht nötig.
 */
export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  await requireAdmin();
  const { t } = await getI18n();
  const params = await searchParams;

  const flags = [
    { key: FEATURE_FLAGS.trial, label: t.admin.monetization.trial },
    { key: FEATURE_FLAGS.conversionCoupon, label: t.admin.monetization.conversion },
    { key: FEATURE_FLAGS.retention, label: t.admin.monetization.retention },
    { key: FEATURE_FLAGS.cloudBackup, label: t.admin.monetization.cloudBackup },
    { key: FEATURE_FLAGS.annualBilling, label: t.admin.monetization.annual },
  ];

  return (
    <div className="grid grid-cols-1 gap-5">
      <PageHeader
        eyebrow={t.admin.nav.settings}
        title={t.admin.monetization.title}
        description={t.admin.monetization.subtitle}
      />

      {params.ok ? <Alert tone="success">{t.admin.monetization.saved}</Alert> : null}

      <form action={saveMonetizationAction} className="card grid grid-cols-1 gap-4 p-5">
        <div className="grid gap-3">
          {flags.map((flag) => (
            <label key={flag.key} className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                name={flag.key}
                defaultChecked={isEnabledValue(getSetting(flag.key, "0"))}
                className="mt-0.5 size-4 rounded border-line bg-transparent"
              />
              <span>
                {flag.label}
                <span className="ml-2 font-mono text-[0.68rem] text-muted">{flag.key}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="max-w-xs">
          <label htmlFor="trial_days" className="field-label">
            {t.admin.monetization.trialDays}
          </label>
          <input
            id="trial_days"
            name="trial_days"
            type="number"
            min={1}
            max={60}
            defaultValue={getSetting("trial_days", "14")}
            className="field"
          />
        </div>

        <p className="text-xs leading-relaxed text-muted">{t.admin.monetization.hint}</p>

        <div>
          <button type="submit" className="btn btn-primary btn-sm">
            {t.admin.monetization.save}
          </button>
        </div>
      </form>
    </div>
  );
}
