import type { Metadata } from "next";
import { LegalView } from "@/components/legal-view";
import { accessibilityDoc } from "@/content/accessibility";
import { getI18n } from "@/i18n";

export const metadata: Metadata = { title: "Barrierefreiheit" };

export default async function AccessibilityPage() {
  const { locale } = await getI18n();
  const de = locale === "de";

  return (
    <LegalView doc={accessibilityDoc} locale={locale}>
      <section className="mt-8 max-w-3xl rounded-xl border border-line/60 bg-white/2 px-4 py-4 text-sm leading-relaxed">
        <h2 className="text-sm font-semibold">
          {de ? "Marktüberwachungsstelle der Länder" : "Market surveillance authority of the Länder"}
        </h2>
        <p className="mt-2 text-muted">
          {de
            ? "Marktüberwachungsstelle der Länder für die Barrierefreiheit von Produkten und Dienstleistungen – Anstalt öffentlichen Rechts (MLBF AöR)"
            : "Marktüberwachungsstelle der Länder für die Barrierefreiheit von Produkten und Dienstleistungen – Anstalt öffentlichen Rechts (MLBF AöR)"}
          <br />
          Carl-Miller-Straße 6
          <br />
          39112 Magdeburg{de ? "" : ", Germany"}
        </p>
        <ul className="mt-3 grid gap-1">
          <li>
            {de ? "Telefon" : "Phone"}:{" "}
            <a className="link inline-flex min-h-9 items-center" href="tel:+4939128923023">
              +49 391 289 230 23
            </a>
          </li>
          <li>
            E-Mail:{" "}
            <a className="link inline-flex min-h-9 items-center" href="mailto:kontakt@mlbf-barrierefrei.de">
              kontakt@mlbf-barrierefrei.de
            </a>
          </li>
          <li>
            {de ? "Website" : "Website"}:{" "}
            <a className="link inline-flex min-h-9 items-center" href="https://www.mlbf-barrierefrei.de">
              www.mlbf-barrierefrei.de
            </a>
          </li>
        </ul>
        <p className="mt-2 text-xs text-muted">
          {de
            ? "Dort stehen Formulare zur Meldung von Barrieren und für Anträge nach § 32 Absatz 1 BFSG bereit."
            : "Forms for reporting barriers and for applications under section 32(1) BFSG are available there."}
        </p>
      </section>
    </LegalView>
  );
}
