import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Alert, PageHeader, StatusPill } from "@/components/ui";
import { getI18n } from "@/i18n";
import { getAnnouncement } from "@/lib/content";
import { get } from "@/lib/db";
import { env, isBillingConfigured, isEmailConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Systemstatus" };
export const dynamic = "force-dynamic";

type Status = "operational" | "degraded" | "down" | "not_configured";

export default async function StatusPage() {
  const { t, locale } = await getI18n();

  let database: Status = "operational";
  let databaseNote = "";
  try {
    const row = get<{ ok: number }>(`SELECT 1 AS ok`);
    database = row?.ok === 1 ? "operational" : "degraded";
    databaseNote = row?.ok === 1 ? "SQLite-Verbindung erfolgreich geprüft." : "Unerwartete Antwort.";
  } catch {
    database = "down";
    databaseNote = "Datenbank nicht erreichbar.";
  }

  const downloadsConfigured = Object.values(env.downloads).some(Boolean);
  const announcement = getAnnouncement(locale);

  const components: { name: string; status: Status; note: string }[] = [
    {
      name: locale === "de" ? "Website & Kundenportal" : "Website & customer portal",
      status: "operational",
      note: locale === "de" ? "Diese Seite wurde serverseitig gerendert." : "This page was rendered server-side.",
    },
    {
      name: locale === "de" ? "Datenbank" : "Database",
      status: database,
      note: databaseNote,
    },
    {
      name: locale === "de" ? "App-API & Gerätekopplung" : "App API & device pairing",
      status: database === "operational" ? "operational" : "degraded",
      note:
        locale === "de"
          ? "Kopplungs- und Geräte-Endpunkte sind verfügbar, sobald die Datenbank erreichbar ist."
          : "Pairing and device endpoints are available whenever the database is reachable.",
    },
    {
      name: locale === "de" ? "E-Mail-Versand" : "Email delivery",
      status: isEmailConfigured() ? "operational" : "not_configured",
      note: isEmailConfigured()
        ? locale === "de"
          ? "Versanddienst konfiguriert."
          : "Delivery service configured."
        : locale === "de"
          ? "Kein Versanddienst konfiguriert; Nachrichten werden im Ausgang gespeichert."
          : "No delivery service configured; messages are stored in the outbox.",
    },
    {
      name: locale === "de" ? "Zahlungsabwicklung" : "Payment processing",
      status: isBillingConfigured() ? "operational" : "not_configured",
      note: isBillingConfigured()
        ? locale === "de"
          ? "Zahlungsanbieter verbunden – Checkout kann Zahlungen auslösen."
          : "Payment provider connected – checkout can initiate payments."
        : locale === "de"
          ? "Kein Zahlungsanbieter verbunden – es werden keine Zahlungen ausgelöst."
          : "No payment provider connected – no payments are triggered.",
    },
    {
      name: locale === "de" ? "App-Downloads" : "App downloads",
      status: downloadsConfigured ? "operational" : "not_configured",
      note: downloadsConfigured
        ? locale === "de"
          ? "Mindestens ein Download-Link ist konfiguriert."
          : "At least one download link is configured."
        : locale === "de"
          ? "Noch keine freigegebenen Builds hinterlegt."
          : "No released builds configured yet.",
    },
  ];

  const checkedAt = new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Europe/Berlin",
  }).format(new Date());

  const overall: Status = components.some((component) => component.status === "down")
    ? "down"
    : components.some((component) => component.status === "degraded")
      ? "degraded"
      : "operational";

  return (
    <div className="shell py-12 sm:py-16">
      <PageHeader eyebrow="Status" title={t.status.title} description={t.status.subtitle} />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_0.7fr] lg:items-start">
        <div className="grid gap-4">
          <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-muted">
                {locale === "de" ? "Gesamtstatus" : "Overall status"}
              </p>
              <div className="mt-1.5">
                <StatusPill status={overall} />
              </div>
            </div>
            <div className="text-end">
              <p className="text-xs uppercase tracking-[0.12em] text-muted">{t.status.checkedAt}</p>
              <p className="mt-1 text-xs text-slate-300">{checkedAt}</p>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="border-b border-line/60 px-5 py-3">
              <h2 className="text-sm font-semibold">{t.status.components}</h2>
            </div>
            <ul>
              {components.map((component) => (
                <li
                  key={component.name}
                  className="flex flex-col gap-1 border-b border-line/40 px-5 py-3.5 last:border-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm text-slate-200">{component.name}</p>
                    <p className="mt-0.5 text-[0.72rem] leading-relaxed text-muted">{component.note}</p>
                  </div>
                  <StatusPill status={component.status} />
                </li>
              ))}
            </ul>
          </div>

          <Alert tone="info">{t.status.architectureNote}</Alert>
        </div>

        <aside className="grid gap-4">
          {announcement ? (
            <div className="card p-5">
              <h2 className="text-sm font-semibold">{t.status.announcement}</h2>
              <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-muted">{announcement}</p>
            </div>
          ) : (
            <div className="card p-5">
              <h2 className="text-sm font-semibold">{t.status.incidentTitle}</h2>
              <p className="mt-2 text-xs leading-relaxed text-muted">{t.status.noIncidents}</p>
            </div>
          )}

          <div className="card p-5">
            <h2 className="text-sm font-semibold">{t.help.stillNeedHelp}</h2>
            <Link href="/contact" className="btn btn-outline btn-sm mt-3 btn-block">
              <Icon name="mail" size={15} />
              {t.help.contactCta}
            </Link>
            <Link href="/help" className="btn btn-ghost btn-sm mt-2 btn-block">
              {t.help.title}
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
