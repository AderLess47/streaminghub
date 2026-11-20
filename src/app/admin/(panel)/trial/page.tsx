import Link from "next/link";
import { Alert, Badge, PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import { getSetting } from "@/lib/content";
import { all, get, nowIso } from "@/lib/db";
import { DEFAULT_FREE_DEVICE_LIMIT } from "@/lib/entitlements";
import { isFeatureEnabled } from "@/lib/flags";
import { REMINDER_WINDOW_HOURS } from "@/lib/trial-jobs";
import { requireStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

const countWhere = (where: string, ...params: string[]) =>
  get<{ c: number }>(`SELECT COUNT(*) AS c FROM subscriptions WHERE ${where}`, ...params)?.c ?? 0;

/**
 * Übersicht über den Testzeitraum.
 *
 * Beantwortet die zwei Fragen, die sonst nur über Workflow-Logs oder SQL
 * gingen: Sind die Erinnerungen rausgegangen, und wie viele Testkonten haben
 * abgeschlossen? Gelesen wird ausschließlich; der Ablauf selbst läuft im
 * täglichen Job.
 */
export default async function AdminTrialPage() {
  await requireStaff();
  const { t, locale } = await getI18n();
  const copy = t.admin.trial;

  const now = nowIso();
  const windowEnd = new Date(Date.now() + REMINDER_WINDOW_HOURS * 3_600_000).toISOString();

  const running = countWhere(
    `trial_ends_at IS NOT NULL AND trial_ended_at IS NULL AND trial_ends_at > ?`,
    now,
  );
  const reminderDue = countWhere(
    `trial_ends_at IS NOT NULL AND trial_ended_at IS NULL AND trial_ends_at > ?
       AND trial_ends_at <= ? AND trial_reminder_sent_at IS NULL`,
    now,
    windowEnd,
  );
  const reminded = countWhere(`trial_reminder_sent_at IS NOT NULL`);
  const converted = countWhere(`trial_converted_at IS NOT NULL`);
  const expired = countWhere(
    `trial_ended_at IS NOT NULL AND trial_converted_at IS NULL`,
  );
  const ended = converted + expired;
  const rate = ended > 0 ? Math.round((converted / ended) * 100) : 0;

  // Nach dem Trial gilt das Free-Limit. Die Geräte bleiben verknüpft (so steht
  // es in der Abschlussmail), also zeigt diese Zahl, wie viele Konten darüber
  // liegen – Grundlage für die Entscheidung, ob durchgegriffen werden soll.
  const configuredLimit = Number(
    getSetting("free_device_limit", String(DEFAULT_FREE_DEVICE_LIMIT)),
  );
  const freeLimit =
    Number.isFinite(configuredLimit) && configuredLimit >= 0
      ? Math.floor(configuredLimit)
      : DEFAULT_FREE_DEVICE_LIMIT;
  const overLimit =
    get<{ c: number }>(
      `SELECT COUNT(*) AS c FROM subscriptions s
       WHERE s.trial_ended_at IS NOT NULL AND s.trial_converted_at IS NULL
         AND (SELECT COUNT(*) FROM devices d WHERE d.user_id = s.user_id AND d.status = 'active') > ?`,
      freeLimit,
    )?.c ?? 0;

  // Dieselbe Grenze gilt nach einem ausgelaufenen Abo – abgemeldet wird dort
  // erst seit Kurzem. Diese Zahl zeigt den Altbestand, den kein Job rückwirkend
  // bereinigt: Konten ohne Premium-Zugang mit mehr aktiven Geräten als erlaubt.
  const subscriptionOverLimit =
    get<{ c: number }>(
      `SELECT COUNT(*) AS c FROM users u
       LEFT JOIN subscriptions s ON s.user_id = u.id
       WHERE u.disabled_at IS NULL
         AND (SELECT COUNT(*) FROM devices d WHERE d.user_id = u.id AND d.status = 'active') > ?
         AND NOT COALESCE(
           (s.status = 'active' AND (s.current_period_end IS NULL OR s.current_period_end > ?))
           OR (s.trial_ends_at IS NOT NULL AND s.trial_ends_at > ?),
           0
         )`,
      freeLimit,
      now,
      now,
    )?.c ?? 0;

  const rows = all<{
    user_id: string;
    email: string;
    status: string;
    trial_source: string | null;
    trial_ends_at: string;
    trial_reminder_sent_at: string | null;
    trial_ended_at: string | null;
    trial_converted_at: string | null;
    devices: number;
  }>(
    `SELECT s.user_id, u.email, s.status, s.trial_source, s.trial_ends_at,
            s.trial_reminder_sent_at, s.trial_ended_at, s.trial_converted_at,
            (SELECT COUNT(*) FROM devices d WHERE d.user_id = s.user_id AND d.status = 'active') AS devices
     FROM subscriptions s JOIN users u ON u.id = s.user_id
     WHERE s.trial_ends_at IS NOT NULL
     ORDER BY s.trial_ended_at IS NOT NULL, s.trial_ends_at DESC
     LIMIT 200`,
  );

  const dateFormat = new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    dateStyle: "short",
    timeStyle: "short",
  });
  const formatDate = (value: string | null) => (value ? dateFormat.format(new Date(value)) : "—");

  const kpis = [
    { label: copy.running, value: running },
    { label: copy.reminderDue, value: reminderDue },
    { label: copy.reminded, value: reminded },
    {
      label: copy.converted,
      value: converted,
      hint: ended > 0 ? `${rate} %` : null,
    },
    { label: copy.expired, value: expired },
    { label: copy.overLimit, value: overLimit, hint: `${freeLimit}` },
    {
      label: copy.subscriptionOverLimit,
      value: subscriptionOverLimit,
      hint: `${freeLimit}`,
    },
  ];

  return (
    <div className="grid gap-5">
      <PageHeader eyebrow={t.admin.nav.trial} title={copy.title} description={copy.subtitle} />

      {!isFeatureEnabled("trial") ? <Alert tone="warning">{copy.flagOff}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="card p-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[0.68rem] uppercase tracking-[0.1em] text-muted">
                {kpi.label}
              </span>
              {kpi.hint ? <span className="text-[0.7rem] text-cyan">{kpi.hint}</span> : null}
            </div>
            <p className="mt-2 text-2xl font-semibold">{kpi.value}</p>
          </div>
        ))}
      </div>

      <p className="text-xs leading-relaxed text-muted">{copy.hint}</p>
      <p className="text-xs leading-relaxed text-muted">{copy.overLimitHint}</p>
      <p className="text-xs leading-relaxed text-muted">{copy.subscriptionOverLimitHint}</p>

      <section className="card overflow-x-auto">
        <table className="data-table">
          <caption className="sr-only">{copy.tableTitle}</caption>
          <thead>
            <tr>
              <th>{copy.customer}</th>
              <th>{copy.state}</th>
              <th>{copy.endsAt}</th>
              <th>{copy.remindedAt}</th>
              <th>{copy.endedAt}</th>
              <th>{copy.convertedAt}</th>
              <th>{copy.devices}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const convertedRow = Boolean(row.trial_converted_at);
              const endedRow = Boolean(row.trial_ended_at);
              const endsInFuture = Date.parse(row.trial_ends_at) > Date.now();
              const state = convertedRow
                ? { label: copy.stateConverted, tone: "ok" as const }
                : endedRow
                  ? { label: copy.stateExpired, tone: "neutral" as const }
                  : endsInFuture
                    ? { label: copy.stateRunning, tone: "brand" as const }
                    : { label: copy.stateDue, tone: "warn" as const };
              return (
                <tr key={row.user_id}>
                  <td className="max-w-[15rem] truncate text-xs" title={row.email}>
                    <Link href={`/admin/customers/${row.user_id}`} className="link">
                      {row.email}
                    </Link>
                  </td>
                  <td>
                    <Badge tone={state.tone}>{state.label}</Badge>
                  </td>
                  <td className="whitespace-nowrap text-xs">{formatDate(row.trial_ends_at)}</td>
                  <td className="whitespace-nowrap text-xs">
                    {formatDate(row.trial_reminder_sent_at)}
                  </td>
                  <td className="whitespace-nowrap text-xs">{formatDate(row.trial_ended_at)}</td>
                  <td className="whitespace-nowrap text-xs">{formatDate(row.trial_converted_at)}</td>
                  <td
                    className={`whitespace-nowrap text-xs ${
                      row.devices > freeLimit ? "text-amber-300" : ""
                    }`}
                    title={row.devices > freeLimit ? copy.overLimitRow : undefined}
                  >
                    {row.devices} / {freeLimit}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-xs text-muted">
                  {copy.empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
