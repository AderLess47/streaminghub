import type { Metadata } from "next";
import Link from "next/link";
import { Alert, InfoRow, PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import { contractLabel, findContractRequest } from "@/lib/contract-requests";

export const metadata: Metadata = { title: "Kündigung bestätigt" };
export const dynamic = "force-dynamic";

export default async function CancellationConfirmationPage({
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
  const effectiveAt = record?.effectiveAt
    ? new Date(record.effectiveAt).toLocaleDateString(de ? "de-DE" : "en-GB", {
        timeZone: "Europe/Berlin",
        dateStyle: "long",
      })
    : null;

  const outcome = record
    ? record.status === "canceled_web"
      ? de
        ? `Dein Abo ist gekündigt und endet${effectiveAt ? ` am ${effectiveAt}` : " zum Ende des laufenden Abrechnungszeitraums"}. Bis dahin bleibt Premium aktiv; danach erfolgt keine weitere Abbuchung.`
        : `Your subscription is cancelled and ends${effectiveAt ? ` on ${effectiveAt}` : " at the end of the current billing period"}. Premium stays active until then; no further charge is made afterwards.`
      : record.status === "store_channel"
        ? de
          ? `Dein Abo wird über ${record.channel === "apple" ? "den App Store" : "den Amazon Appstore"} verwaltet. Die Kündigung ist hier belegt; beende das Abo zusätzlich in deinem ${record.channel === "apple" ? "Apple-" : "Amazon-"}Konto, damit dort keine weitere Abbuchung erfolgt.`
          : `Your subscription is managed by ${record.channel === "apple" ? "the App Store" : "the Amazon Appstore"}. The cancellation is recorded here; also end the subscription in your ${record.channel === "apple" ? "Apple" : "Amazon"} account so that no further charge is made there.`
        : record.status === "no_subscription"
          ? de
            ? "Zu dieser E-Mail-Adresse war zum Zeitpunkt der Kündigung kein laufendes Abo hinterlegt. Es entstehen keine Kosten."
            : "No running subscription was on record for this email address at the time of cancellation. No costs arise."
          : record.status === "no_account"
            ? de
              ? "Zu dieser E-Mail-Adresse haben wir kein Konto gefunden. Falls du ein Abo über Apple oder Amazon hast, kündige es bitte dort. Sonst antworte auf die Bestätigungsmail, wir prüfen den Fall."
              : "We found no account for this email address. If you have a subscription via Apple or Amazon, please cancel it there. Otherwise reply to the confirmation email and we will look into it."
            : de
              ? "Die Kündigung konnte beim Zahlungsanbieter nicht bestätigt werden. Wir prüfen den Fall und melden uns per E-Mail."
              : "The cancellation could not be confirmed with the payment provider. We are looking into it and will get back to you by email."
    : "";

  return (
    <div className="shell py-12 sm:py-16">
      <PageHeader
        eyebrow={de ? "Kündigung" : "Cancellation"}
        title={de ? "Kündigung bestätigt" : "Cancellation confirmed"}
        description={
          record
            ? de
              ? "Deine Kündigung ist eingegangen. Diese Seite ist deine Bestätigung; dieselbe Bestätigung haben wir per E-Mail verschickt."
              : "Your cancellation has been received. This page is your confirmation; we sent the same confirmation by email."
            : de
              ? "Zu dieser Referenz liegt keine Kündigung vor. Bitte prüfe den Link aus der Bestätigungsmail."
              : "No cancellation was found for this reference. Please check the link in the confirmation email."
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
              {effectiveAt ? (
                <InfoRow label={de ? "Endet am" : "Ends on"} value={effectiveAt} />
              ) : null}
            </dl>

            <div className="mt-5">
              <Alert tone={record.status === "failed" ? "warning" : "info"} live={false}>
                {outcome}
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
              <h2 className="text-sm font-semibold">{de ? "Weiterhin erreichbar" : "Still reachable"}</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                {de
                  ? "Dein Gerät bleibt gekoppelt und deine Playlist bleibt gespeichert. Ohne aktives Abo entfallen nur die Premium-Zusätze."
                  : "Your device stays paired and your playlist stays stored. Without an active subscription only the premium extras are gone."}
              </p>
              <Link href="/contact" className="btn btn-outline btn-sm mt-3 btn-block">
                {de ? "Support kontaktieren" : "Contact support"}
              </Link>
            </div>
          </aside>
        </div>
      ) : (
        <div className="mt-8 grid gap-4">
          <Link href="/kuendigung" className="btn btn-primary w-fit">
            {de ? "Zur Kündigung" : "Go to cancellation"}
          </Link>
          <Link href="/contact" className="btn btn-outline w-fit">
            {de ? "Support kontaktieren" : "Contact support"}
          </Link>
        </div>
      )}
    </div>
  );
}
