import Link from "next/link";
import type { Clause, LegalDoc } from "@/content/legal";
import type { Locale } from "@/i18n/config";
import { PageHeader } from "./ui";

const NAV = [
  { href: "/imprint", de: "Impressum", en: "Legal notice" },
  { href: "/privacy", de: "Datenschutz", en: "Privacy" },
  { href: "/terms", de: "Nutzungsbedingungen", en: "Terms" },
  { href: "/subscription-terms", de: "Abonnementbedingungen", en: "Subscription terms" },
  { href: "/withdrawal", de: "Widerruf", en: "Withdrawal" },
];

export function LegalNav({ locale, active }: { locale: Locale; active: string }) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label={locale === "de" ? "Rechtliche Dokumente" : "Legal documents"}>
      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`chip ${active === item.href ? "chip-brand" : ""}`}
          aria-current={active === item.href ? "page" : undefined}
        >
          {locale === "de" ? item.de : item.en}
        </Link>
      ))}
    </nav>
  );
}

function Clauses({ clauses }: { clauses: Clause[] }) {
  return (
    <div className="legal mt-8 max-w-3xl">
      {clauses.map((clause) => (
        <section key={clause.heading}>
          <h2>{clause.heading}</h2>
          {clause.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          {clause.bullets?.length ? (
            <ul>
              {clause.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </div>
  );
}

export function LegalView({
  doc,
  locale,
  notice,
}: {
  doc: LegalDoc;
  locale: Locale;
  notice?: string;
}) {
  const de = locale === "de";
  return (
    <div className="shell py-12 sm:py-16">
      <PageHeader
        eyebrow={de ? "Rechtliches" : "Legal"}
        title={de ? doc.titleDe : doc.titleEn}
        description={de ? doc.introDe : doc.introEn}
      />
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <LegalNav locale={locale} active={`/${doc.slug}`} />
        <p className="text-xs text-muted">
          {de ? "Stand" : "Last updated"}:{" "}
          {new Intl.DateTimeFormat(de ? "de-DE" : "en-GB", { dateStyle: "long" }).format(
            new Date(doc.updated),
          )}
        </p>
      </div>

      {notice ? (
        <p className="mt-6 max-w-3xl rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-xs leading-relaxed text-amber-200/90">
          {notice}
        </p>
      ) : null}

      <Clauses clauses={de ? doc.clausesDe : doc.clausesEn} />

      <div className="mt-10 flex flex-wrap gap-2 border-t border-line/50 pt-6">
        <Link href="/contact" className="btn btn-outline btn-sm">
          {de ? "Fragen zum Rechtstext" : "Questions about this document"}
        </Link>
        <Link href="/" className="btn btn-ghost btn-sm">
          {de ? "Zur Startseite" : "Back to homepage"}
        </Link>
      </div>
    </div>
  );
}
