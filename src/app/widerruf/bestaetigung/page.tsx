import type { Metadata } from "next";
import Link from "next/link";
import { Alert, InfoRow, PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import { contractLabel, findContractRequest } from "@/lib/contract-requests";

export const metadata: Metadata = { title: "Widerruf bestätigt" };
export const dynamic = "force-dynamic";

export default async function WithdrawalConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  const { locale } = await getI18n();
  const de = locale !== "en";
  const record = ref ? findContractRequest(ref) : undefined;

  const receivedAt = record
    ? new Date(record.createdAt).toLocaleString(de ? "de-DE" : "en-GB", {
        timeZone: "Europe/Berlin",
        dateStyle: "long",
        timeStyle: "short",
      })
    : null;

  return (
    <div className="shell py-12 sm:py-16">
      <PageHeader
        eyebrow={de ? "Widerruf" : "Withdrawal"}
        title={de ? "Widerruf bestätigt" : "Withdrawal confirmed"}
        description={
          record
            ? de
              ? "Dein Widerruf ist eingegangen und wirksam. Diese Seite ist deine Bestätigung; zusätzlich haben wir sie per E-Mail verschickt."
              : "Your withdrawal has been received and is effective. This page is your confirmation; we also sent it by email."
            : de
              ? "Zu dieser Referenz liegt kein Widerruf vor. Bitte prüfe den Link aus der Bestätigungsmail."
              : "No withdrawal was found for this reference. Please check the link in the confirmation email."
        }
      />

      {record ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_0.7fr] lg:items-start">
          <div className="card p-6">
            <dl className="grid gap-3 text-sm">
              <InfoRow label={de ? "Referenz" : "Reference"} value={record.reference} />
              <InfoRow label={de ? "Vertrag" : "Contract"} value={contractLabel(record.contract, locale)} />
              <InfoRow label={de ? "Eingegangen" : "Received"} value={receivedAt ?? "-"} />
              <InfoRow label={de ? "E-Mail" : "Email"} value={record.email} />
            </dl>
            <div className="mt-5">
              <Alert tone="info" live={false}>
                {de
                  ? "Wir erstatten alle Zahlungen für diesen Vertrag unverzüglich und spätestens binnen 14 Tagen über das ursprünglich verwendete Zahlungsmittel. Entgelte für die Rückzahlung berechnen wir nicht."
                  : "We refund all payments for this contract without undue delay and within 14 days using the original means of payment. No fees are charged for the refund."}
              </Alert>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              {de
                ? "Bewahre die Referenz auf. Bei Fragen antworte auf die Bestätigungsmail oder schreibe an service@streaminghub.org."
                : "Keep the reference. If you have questions, reply to the confirmation email or write to service@streaminghub.org."}
            </p>
          </div>

          <aside className="grid gap-4">
            <div className="card p-5">
              <h2 className="text-sm font-semibold">{de ? "Ebenfalls erledigen" : "Also worth doing"}</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                {de
                  ? "Ein Abo über Apple oder Amazon wird zusätzlich im jeweiligen Store beendet. Der Widerruf hier gilt für den Vertrag mit StreamingHub."
                  : "A subscription via Apple or Amazon also ends in the respective store. The withdrawal here covers the contract with StreamingHub."}
              </p>
              <Link href="/kuendigung" className="btn btn-outline btn-sm mt-3 btn-block">
                {de ? "Abo kündigen" : "Cancel subscription"}
              </Link>
              <Link href="/contact" className="btn btn-ghost btn-sm mt-2 btn-block">
                {de ? "Support kontaktieren" : "Contact support"}
              </Link>
            </div>
          </aside>
        </div>
      ) : (
        <div className="mt-8 grid gap-4">
          <Link href="/widerruf" className="btn btn-primary w-fit">
            {de ? "Zum Widerrufsformular" : "Go to the withdrawal form"}
          </Link>
          <Link href="/contact" className="btn btn-outline w-fit">
            {de ? "Support kontaktieren" : "Contact support"}
          </Link>
        </div>
      )}
    </div>
  );
}
