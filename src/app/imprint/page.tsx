import type { Metadata } from "next";
import { LegalNav } from "@/components/legal-view";
import { PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import { operator } from "@/lib/env";

export const metadata: Metadata = { title: "Impressum" };

export default async function ImprintPage() {
  const { locale, t } = await getI18n();
  const de = locale === "de";

  return (
    <div className="shell py-12 sm:py-16">
      <PageHeader
        eyebrow={de ? "Rechtliches" : "Legal"}
        title={de ? "Impressum" : "Legal notice"}
        description={
          de
            ? "Angaben gemäß § 5 DDG (Digitale-Dienste-Gesetz) und § 18 MStV."
            : "Information pursuant to § 5 DDG (German Digital Services Act) and § 18 MStV."
        }
      />

      <div className="mt-6">
        <LegalNav locale={locale} active="/imprint" />
      </div>

      <div className="legal mt-8 max-w-3xl">
        {operator.hasPlaceholders ? (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-xs leading-relaxed text-amber-200/90">
            {t.legal.placeholderNotice}
          </div>
        ) : null}

        <h2>{t.legal.providerHeading}</h2>
        <p>
          {operator.legalName}
          <br />
          {operator.street}
          <br />
          {operator.postalCode} {operator.city}
          <br />
          {operator.country}
        </p>

        <h2>{t.legal.contactHeading}</h2>
        <p>
          {de ? "E-Mail" : "Email"}:{" "}
          <a href={`mailto:${operator.email}`}>{operator.email}</a>
          <br />
          {de ? "Telefon" : "Phone"}: {operator.phone}
        </p>

        <h2>{t.legal.representationHeading}</h2>
        <p>{operator.representative}</p>

        {operator.hasRegister ? (
          <>
            <h2>{t.legal.registerHeading}</h2>
            <p>
              {operator.registerCourt}
              {operator.registerNumber ? (
                <>
                  <br />
                  {operator.registerNumber}
                </>
              ) : null}
            </p>
          </>
        ) : null}

        <h2>{t.legal.vatHeading}</h2>
        {operator.smallBusiness ? (
          <p>
            {de
              ? "Kleinunternehmerregelung gemäß § 19 UStG. Es wird keine Umsatzsteuer ausgewiesen."
              : "Small business regulation pursuant to § 19 of the German VAT Act. No VAT is charged."}
          </p>
        ) : (
          <p>
            {de ? "Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG" : "VAT ID pursuant to § 27a UStG"}:{" "}
            {operator.vatId}
          </p>
        )}

        <h2>{t.legal.responsibleHeading}</h2>
        <p>
          {de
            ? "Verantwortlich für journalistisch-redaktionelle Inhalte gemäß § 18 Abs. 2 MStV:"
            : "Responsible for journalistic-editorial content pursuant to § 18(2) MStV:"}{" "}
          {operator.representative}
        </p>

        <h2>{t.legal.disputeHeading}</h2>
        <p>
          {de
            ? "Die EU-Plattform zur Online-Streitbeilegung wurde zum 20. Juli 2025 eingestellt. Wir sind nicht verpflichtet und nicht bereit, an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen."
            : "The EU online dispute resolution platform was discontinued on 20 July 2025. We are neither obliged nor willing to participate in dispute resolution proceedings before a consumer arbitration board."}
        </p>

        <h2>{de ? "Produkt- und Haftungshinweis" : "Product and liability notice"}</h2>
        <p>
          {de
            ? "StreamingHub ist ausschließlich ein technischer Medienplayer. Es werden keine IPTV-Playlists, Fernsehsender, Filme, Serien oder sonstigen geschützten Streaming-Inhalte angeboten oder vermittelt. Nutzer sind selbst dafür verantwortlich, nur Inhalte und Quellen zu verwenden, für die sie die erforderlichen Rechte besitzen."
            : "StreamingHub is purely a technical media player. We do not offer or broker IPTV playlists, television channels, films, series or other protected streaming content. Users are responsible for using only content and sources they are entitled to access."}
        </p>

        <h2>{de ? "Haftung für Links" : "Liability for links"}</h2>
        <p>
          {de
            ? "Die Website enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter verantwortlich. Zum Zeitpunkt der Verlinkung wurden keine Rechtsverstöße erkannt."
            : "The website contains links to external third-party websites whose content we cannot influence. The respective provider is always responsible for the content of linked pages. No legal violations were identified at the time of linking."}
        </p>
      </div>
    </div>
  );
}
