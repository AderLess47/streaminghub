import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Alert, PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";

export const metadata: Metadata = { title: "App-API" };

const ENDPOINTS = [
  {
    method: "POST",
    path: "/api/v1/pairing/request",
    auth: "keine (Rate Limit pro IP)",
    description:
      "Erzeugt einen Kopplungscode (10 Minuten gültig), einen Poll-Token und eine requestId. Der Code wird nur einmal im Klartext zurückgegeben.",
  },
  {
    method: "GET",
    path: "/api/v1/pairing/status?requestId=…",
    auth: "Bearer Poll-Token",
    description:
      "Liefert pending, claimed oder expired. Nach erfolgreicher Kopplung enthält die Antwort ein signiertes activationToken sowie den Gerätestatus.",
  },
  {
    method: "GET",
    path: "/api/v1/me",
    auth: "Bearer Activation-Token",
    description:
      "Konto-, Geräte- und Abonnementstatus für die App. Entkoppelte Geräte erhalten 403 – die Sperre wirkt sofort.",
  },
];

export default async function ApiDocsPage() {
  const { t } = await getI18n();

  return (
    <div className="shell py-12 sm:py-16">
      <PageHeader
        eyebrow="Developer"
        title="StreamingHub App-API"
        description="Dokumentierte REST-Schnittstelle für die Anbindung der StreamingHub-App (Fire TV, Android TV, Android). Die App stellt keine Inhalte bereit und erhält keine Playlist-Daten."
      />

      <div className="mt-8 grid min-w-0 gap-6 lg:grid-cols-[1.5fr_0.8fr] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="card min-w-0 overflow-hidden">
            {/* Tabelle darf bei 320 px waagerecht scrollen, statt die Seite zu
                verbreitern; tabIndex macht den Bereich mit der Tastatur
                scrollbar (WCAG 2.1.1, 1.4.10). */}
            <div
              role="region"
              aria-label="Endpunkte der App-API"
              tabIndex={0}
              className="min-w-0 overflow-x-auto"
            >
            <table className="data-table">
              <thead>
                <tr>
                  <th>Methode</th>
                  <th>Pfad</th>
                  <th>Auth</th>
                </tr>
              </thead>
              <tbody>
                {ENDPOINTS.map((endpoint) => (
                  <tr key={endpoint.path}>
                    <td>
                      <span className="chip chip-brand font-mono">{endpoint.method}</span>
                    </td>
                    <td className="font-mono text-[0.72rem]">{endpoint.path}</td>
                    <td className="text-xs">{endpoint.auth}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          <div className="grid gap-3">
            {ENDPOINTS.map((endpoint) => (
              <article key={endpoint.path} className="card p-5">
                <p className="font-mono text-xs text-cyan-200">{endpoint.path}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">{endpoint.description}</p>
              </article>
            ))}
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold">Kopplungsablauf</h2>
            <ol className="mt-3 grid gap-2 text-sm text-slate-300">
              {[
                "App ruft POST /api/v1/pairing/request auf und zeigt den Code an.",
                "Kunde meldet sich auf streaminghub.org/activate an und gibt den Code ein.",
                "Backend prüft Code, Ablauf, Versuche und Gerätelimit und verknüpft das Gerät.",
                "App pollt GET /api/v1/pairing/status und erhält activationToken.",
                "App prüft den Status regelmäßig über GET /api/v1/me.",
              ].map((step, index) => (
                <li key={step} className="flex gap-2.5">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full border border-line bg-white/5 text-[0.62rem] font-semibold text-cyan">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold">Beispiel</h2>
            <pre className="mt-3 overflow-x-auto rounded-lg border border-line/50 bg-ink/70 p-4 text-[0.72rem] leading-relaxed text-slate-300">
{`curl -X POST https://streaminghub.org/api/v1/pairing/request \\
  -H "Content-Type: application/json" \\
  -d '{"deviceName":"Wohnzimmer TV","platform":"firetv","appVersion":"1.0.0"}'

# → { "requestId": "…", "code": "AB12-CD34", "pollToken": "…",
#     "expiresAt": "2026-11-09T21:55:00.000Z" }

curl "https://streaminghub.org/api/v1/pairing/status?requestId=…" \\
  -H "Authorization: Bearer <pollToken>"

# → { "status": "claimed", "activationStatus": "active",
#     "activationToken": "…", "device": { … } }`}
            </pre>
          </div>
        </div>

        <aside className="grid min-w-0 gap-4">
          <div className="card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Icon name="file-text" size={16} className="text-cyan" />
              OpenAPI
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Maschinenlesbare Spezifikation (OpenAPI 3.1) für Codegenerierung und Tests.
            </p>
            <Link href="/api/v1/openapi.json" className="btn btn-outline btn-sm mt-3 btn-block">
              openapi.json
            </Link>
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold">Sicherheit</h2>
            <ul className="mt-2 grid gap-2 text-xs leading-relaxed text-muted">
              <li>Codes nur als SHA-256-Hash gespeichert, 10 Minuten gültig, einmalig.</li>
              <li>Maximal 5 Einlöseversuche, danach Sperre; IP- und Konto-Rate-Limits.</li>
              <li>Activation-Tokens sind HMAC-signiert, laufen ab und werden bei Entkopplung sofort ungültig.</li>
              <li>Gerätelimit abhängig vom Abonnementstatus (Free/Premium).</li>
            </ul>
          </div>

          <Alert tone="warning" title="App-Anbindung">
            Die Endpunkte sind implementiert und getestet. Die StreamingHub-App muss diese Schnittstelle noch
            anbinden; im Repo ist keine App-Implementierung enthalten.
          </Alert>

          <div className="card p-5">
            <h2 className="text-sm font-semibold">{t.help.stillNeedHelp}</h2>
            <Link href="/contact" className="btn btn-ghost btn-sm mt-2 btn-block">
              {t.help.contactCta}
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
