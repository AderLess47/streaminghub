import type { Metadata } from "next";
import Link from "next/link";
import { CancellationForm } from "@/components/cancellation-form";
import { PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";

export const metadata: Metadata = { title: "Abo kündigen" };

/**
 * Kündigungsschaltfläche nach § 312k BGB: jederzeit und ohne Anmeldung
 * erreichbar, ein Klick kündigt, danach folgt die Bestätigungsseite.
 */
export default async function CancelSubscriptionPage() {
  const { locale } = await getI18n();
  const de = locale !== "en";

  return (
    <div className="shell py-12 sm:py-16">
      <PageHeader
        eyebrow={de ? "Kündigung" : "Cancellation"}
        title={de ? "Abo hier kündigen" : "Cancel your subscription here"}
        description={
          de
            ? "Du kannst dein StreamingHub-Abo jederzeit ohne Angabe von Gründen kündigen — ohne Anmeldung, ohne Rückfrage und sofort wirksam zum Ende des laufenden Abrechnungszeitraums."
            : "You can cancel your StreamingHub subscription at any time without giving a reason — without signing in, without follow-up questions, effective at the end of the current billing period."
        }
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_0.7fr] lg:items-start">
        <CancellationForm locale={locale} />

        <aside className="grid gap-4">
          <div className="card p-5">
            <h2 className="text-sm font-semibold">{de ? "Bestätigung" : "Confirmation"}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              {de
                ? "Nach dem Klick siehst du sofort eine Bestätigungsseite mit Datum, Inhalt und Wirkung der Kündigung. Dieselbe Bestätigung geht per E-Mail raus."
                : "After the click you immediately see a confirmation page with the date, content and effect of the cancellation. The same confirmation is sent by email."}
            </p>
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold">{de ? "Abo über Apple oder Amazon" : "Subscription via Apple or Amazon"}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              {de
                ? "Diese Abos werden vom jeweiligen Store verwaltet. Die Kündigung hier wird belegt und bestätigt; beende das Abo zusätzlich in deinem Apple- oder Amazon-Konto, damit dort keine weitere Abbuchung erfolgt."
                : "These subscriptions are managed by the respective store. The cancellation here is recorded and confirmed; also end the subscription in your Apple or Amazon account so that no further charge is made there."}
            </p>
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold">{de ? "Stattdessen widerrufen" : "Withdraw instead"}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              {de
                ? "Innerhalb von 14 Tagen nach Vertragsschluss kannst du den Vertrag widerrufen und erhältst die Zahlungen zurück."
                : "Within 14 days of concluding the contract you can withdraw and get your payments back."}
            </p>
            <Link href="/widerruf" className="btn btn-outline btn-sm mt-3 btn-block">
              {de ? "Vertrag widerrufen" : "Withdraw contract"}
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
