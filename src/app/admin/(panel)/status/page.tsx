import { Alert, PageHeader, StatusPill } from "@/components/ui";
import { getI18n } from "@/i18n";
import { get } from "@/lib/db";
import { env, isBillingConfigured, isEmailConfigured } from "@/lib/env";
import { requireStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminStatusPage() {
  await requireStaff();
  const { t, locale } = await getI18n();

  let dbOk = true;
  try {
    get(`SELECT 1 AS ok`);
  } catch {
    dbOk = false;
  }

  const mail = allCount("outbox_emails");
  const failed = allCount("outbox_emails", "status = 'failed'");
  const downloads = Object.entries(env.downloads).filter(([, value]) => Boolean(value));

  const checkedAt = new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Europe/Berlin",
  }).format(new Date());

  const rows = [
    {
      name: t.admin.status.database,
      status: dbOk ? ("operational" as const) : ("down" as const),
      detail: `${env.databasePath} · SQLite (node:sqlite)`,
    },
    {
      name: t.admin.status.email,
      status: isEmailConfigured() ? ("operational" as const) : ("not_configured" as const),
      detail: isEmailConfigured()
        ? `Provider konfiguriert · ${mail} Nachrichten, ${failed} fehlgeschlagen`
        : `Kein RESEND_API_KEY · ${mail} Nachrichten im Ausgang gespeichert`,
    },
    {
      name: t.admin.status.billing,
      status: isBillingConfigured() ? ("operational" as const) : ("not_configured" as const),
      detail: isBillingConfigured()
        ? "Stripe-Schlüssel, Preis und Webhook konfiguriert"
        : "Kein Zahlungsanbieter – Checkout liefert 503, keine Zahlung möglich",
    },
    {
      name: t.admin.status.downloads,
      status: downloads.length > 0 ? ("operational" as const) : ("not_configured" as const),
      detail:
        downloads.length > 0
          ? downloads.map(([key]) => key).join(", ")
          : "Keine Download-URLs gesetzt – Download-Seite zeigt Platzhalter",
    },
    {
      name: t.admin.status.appApi,
      status: dbOk ? ("operational" as const) : ("degraded" as const),
      detail: "POST /api/v1/pairing/request · GET /api/v1/pairing/status · GET /api/v1/me",
    },
  ];

  return (
    <div className="grid gap-5">
      <PageHeader eyebrow={t.admin.nav.status} title={t.admin.status.title} description={t.admin.status.subtitle} />

      <div className="card overflow-hidden">
        <ul>
          {rows.map((row) => (
            <li key={row.name} className="flex flex-col gap-1 border-b border-line/40 px-5 py-3.5 last:border-0 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-slate-200">{row.name}</p>
                <p className="mt-0.5 break-all text-[0.7rem] text-muted">{row.detail}</p>
              </div>
              <StatusPill status={row.status} />
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-muted">
        {t.status.checkedAt}: {checkedAt}
      </p>
      <Alert tone="info">{t.admin.status.configHint}</Alert>
    </div>
  );
}

function allCount(table: "outbox_emails", where?: string) {
  try {
    return get<{ c: number }>(`SELECT COUNT(*) AS c FROM ${table}${where ? ` WHERE ${where}` : ""}`)?.c ?? 0;
  } catch {
    return 0;
  }
}
