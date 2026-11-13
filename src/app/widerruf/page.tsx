import type { Metadata } from "next";
import Link from "next/link";
import { WithdrawalForm } from "@/components/withdrawal-form";
import { PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";

export const metadata: Metadata = { title: "Vertrag widerrufen" };

/**
 * Widerrufsfunktion nach § 356a BGB: ohne Anmeldung erreichbar, ein Klick
 * erklärt den Widerruf, danach folgt unmittelbar die Bestätigungsseite.
 */
export default async function WithdrawContractPage() {
  const { locale, t } = await getI18n();
  const de = locale !== "en";

  return (
    <div className="shell py-12 sm:py-16">
      <PageHeader
        eyebrow={de ? "Widerruf" : "Withdrawal"}
        title={de ? "Vertrag hier widerrufen" : "Withdraw a contract here"}
        description={
          de
            ? "Du kannst kostenpflichtige Verträge mit StreamingHub ohne Angabe von Gründen binnen 14 Tagen widerrufen. Die Erklärung hier ist sofort wirksam, ohne Anmeldung und ohne Rückfrage."
            : "You can withdraw from paid contracts with StreamingHub within 14 days without giving a reason. The declaration here takes effect immediately, without signing in."
        }
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_0.7fr] lg:items-start">
        <WithdrawalForm locale={locale} privacyLabel={t.footer.privacy} />

        <aside className="grid gap-4">
          <div className="card p-5">
            <h2 className="text-sm font-semibold">{de ? "Was danach passiert" : "What happens next"}</h2>
            <ol className="mt-2 grid gap-2 text-xs leading-relaxed text-muted">
              <li>
                {de
                  ? "1. Du erhältst sofort eine Bestätigung mit Referenz und Datum — auf dieser Seite und per E-Mail."
                  : "1. You immediately receive a confirmation with reference and date — on this page and by email."}
              </li>
              <li>
                {de
                  ? "2. Wir erstatten alle Zahlungen für diesen Vertrag binnen 14 Tagen über das ursprüngliche Zahlungsmittel."
                  : "2. We refund all payments for this contract within 14 days using the original payment method."}
              </li>
              <li>
                {de
                  ? "3. Ein laufendes Abo endet mit dem Widerruf; weitere Abbuchungen gibt es nicht."
                  : "3. A running subscription ends with the withdrawal; no further charges are made."}
              </li>
            </ol>
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold">{de ? "Rechtliches" : "Legal"}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              {de
                ? "Einzelheiten, Fristen und das Muster-Widerrufsformular stehen in den Widerrufsinformationen."
                : "Details, deadlines and the model withdrawal form are in the withdrawal information."}
            </p>
            <Link href="/withdrawal" className="btn btn-outline btn-sm mt-3 btn-block">
              {de ? "Widerrufsinformationen" : "Withdrawal information"}
            </Link>
            <Link href="/kuendigung" className="btn btn-ghost btn-sm mt-2 btn-block">
              {de ? "Stattdessen kündigen" : "Cancel instead"}
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
