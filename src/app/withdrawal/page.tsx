import type { Metadata } from "next";
import Link from "next/link";
import { LegalView } from "@/components/legal-view";
import { legalDocs } from "@/content/legal";
import { getI18n } from "@/i18n";

export const metadata: Metadata = { title: "Widerrufsinformationen" };

/**
 * Infoseite plus die gesetzlich geforderte Schaltfläche „Verträge hier
 * widerrufen“ (§ 356a BGB). Die Funktion selbst liegt unter `/widerruf` und
 * ist ohne Anmeldung erreichbar.
 */
export default async function WithdrawalPage() {
  const { locale, t } = await getI18n();
  const de = locale !== "en";

  return (
    <div className="shell py-12 sm:py-16">
      <div className="card mb-8 flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="text-sm font-semibold">
            {de ? "Widerruf direkt erklären" : "Declare the withdrawal directly"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {de
              ? "Ohne Anmeldung, mit sofortiger Bestätigung auf dem Bildschirm und per E-Mail."
              : "Without signing in, with immediate confirmation on screen and by email."}
          </p>
        </div>
        <Link href="/widerruf" className="btn btn-primary">
          {de ? "Verträge hier widerrufen" : "Withdraw contracts here"}
        </Link>
      </div>

      <LegalView doc={legalDocs.withdrawal} locale={locale} notice={t.legal.placeholderNotice} />
    </div>
  );
}
