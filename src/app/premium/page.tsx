import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutButton } from "@/components/checkout-button";
import { FaqAccordion } from "@/components/faq-accordion";
import { Icon } from "@/components/icons";
import { Alert, Badge, SectionHeading } from "@/components/ui";
import { getI18n } from "@/i18n";
import { getFaqItems } from "@/lib/content";
import { billingConfigured, PREMIUM_PRICE_EUR } from "@/lib/payments";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Premium" };

export default async function PremiumPage() {
  const { t, locale } = await getI18n();
  const user = await getSessionUser();
  const faq = getFaqItems(locale, { category: "premium" });
  const configured = billingConfigured();

  const statusTone = (status: string) =>
    status === "Verfügbar" || status === "Available"
      ? "ok"
      : status.startsWith("Teilweise") || status.startsWith("Partially")
        ? "warn"
        : "warn";

  return (
    <>
      <section className="shell pt-12 sm:pt-16">
        <div className="max-w-2xl">
          <p className="eyebrow">StreamingHub Premium</p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-5xl">{t.premium.title}</h1>
          <p className="mt-4 text-muted sm:text-lg">{t.premium.subtitle}</p>
        </div>
      </section>

      <section className="shell mt-10 grid grid-cols-1 gap-6 pb-16 lg:grid-cols-[1.35fr_1fr] lg:items-start">
        <div className="grid grid-cols-1 gap-4">
          <div className="card p-6">
            <h2 className="text-lg font-semibold">{t.premium.featuresTitle}</h2>
            <ul className="mt-4 grid grid-cols-1 gap-3">
              {t.premium.features.map((feature) => (
                <li key={feature.title} className="rounded-xl border border-line/60 bg-white/2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-[0.95rem] font-medium">
                      <Icon name="sparkles" size={16} className="text-cyan" />
                      {feature.title}
                    </p>
                    <Badge tone={statusTone(feature.status)}>{feature.status}</Badge>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{feature.description}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-6">
            <h2 className="text-lg font-semibold">{t.premium.channelTitle}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-line/60 p-4">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Icon name="globe" size={15} className="text-cyan" />
                  Web / Sideload
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted">{t.premium.channels.web}</p>
              </div>
              <div className="rounded-xl border border-line/60 p-4">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Icon name="card" size={15} className="text-cyan" />
                  Amazon Appstore
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted">{t.premium.channels.amazon}</p>
              </div>
            </div>
          </div>

          {configured ? (
            <Alert tone="info" title={locale === "de" ? "Zahlung über Stripe" : "Payment via Stripe"}>
              {t.premium.billingLiveNotice}
            </Alert>
          ) : (
            <Alert tone="warning" title={locale === "de" ? "Wichtiger Hinweis zur Zahlung" : "Important payment notice"}>
              {t.premium.billingNotice}
            </Alert>
          )}
        </div>

        <aside className="card sticky top-24 p-6">
          <p className="text-xs uppercase tracking-[0.14em] text-muted">StreamingHub Premium</p>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="text-5xl font-semibold tracking-tight">{t.premium.price}</span>
            <span className="text-sm text-muted">{t.premium.period}</span>
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted">{t.premium.vat}</p>

          <div className="mt-5 grid gap-2.5 border-t border-line/60 pt-5">
            <CheckoutButton
              label={t.premium.ctaPrimary}
              disabledLabel={t.dashboard.subscription.checkoutNotConfigured}
              configured={configured}
              signedIn={Boolean(user)}
            />
            <Link
              href={user ? "/dashboard/subscription" : "/login?next=/dashboard/subscription"}
              className="btn btn-outline btn-block"
            >
              {t.premium.ctaSecondary}
            </Link>
            {!user ? (
              <Link href="/register?next=/dashboard/subscription" className="btn btn-ghost btn-block btn-sm">
                {t.nav.register}
              </Link>
            ) : null}
          </div>

          <ul className="mt-5 grid gap-2 text-xs text-muted">
            <li className="flex items-start gap-2">
              <Icon name="check" size={13} className="mt-0.5 text-cyan" />
              {locale === "de" ? "Monatlich kündbar, keine Mindestlaufzeit" : "Cancel monthly, no minimum term"}
            </li>
            <li className="flex items-start gap-2">
              <Icon name="check" size={13} className="mt-0.5 text-cyan" />
              {locale === "de" ? "Status jederzeit im Dashboard prüfbar" : "Status verifiable in the dashboard at any time"}
            </li>
            <li className="flex items-start gap-2">
              <Icon name="check" size={13} className="mt-0.5 text-cyan" />
              {locale === "de"
                ? `Preis: ${PREMIUM_PRICE_EUR.toFixed(2).replace(".", ",")} € pro Monat; keine Umsatzsteuer (Kleinunternehmerregelung).`
                : `Price: €${PREMIUM_PRICE_EUR.toFixed(2)} per month; no VAT (small business regulation).`}
            </li>
          </ul>
        </aside>
      </section>

      {faq.length > 0 ? (
        <section className="section border-t border-line/40">
          <div className="shell grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div>
              <SectionHeading eyebrow="FAQ" title={t.premium.faqTitle} />
              <Link href="/faq" className="btn btn-outline btn-sm mt-5">
                {t.nav.faq}
                <Icon name="arrow-right" size={15} />
              </Link>
            </div>
            <FaqAccordion items={faq} />
          </div>
        </section>
      ) : null}

      <section className="section border-t border-line/40">
        <div className="shell">
          <div className="card p-6">
            <h2 className="text-lg font-semibold">{t.legal.title}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              {locale === "de"
                ? "Die Bedingungen für das Premium-Abonnement, Widerrufsinformationen und die Kündigung sind verbindlich in den Rechtstexten beschrieben."
                : "The binding conditions for the premium subscription, withdrawal information and cancellation are described in the legal documents."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/subscription-terms" className="btn btn-outline btn-sm">
                {t.footer.subscriptionTerms}
              </Link>
              <Link href="/withdrawal" className="btn btn-outline btn-sm">
                {t.footer.withdrawal}
              </Link>
              <Link href="/terms" className="btn btn-outline btn-sm">
                {t.footer.terms}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
