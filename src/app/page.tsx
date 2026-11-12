import Link from "next/link";
import { AppPreview } from "@/components/app-preview";
import { FaqAccordion } from "@/components/faq-accordion";
import { Icon, type IconName } from "@/components/icons";
import { Badge, SectionHeading } from "@/components/ui";
import { getI18n } from "@/i18n";
import { getFaqItems, getSetting } from "@/lib/content";
import { safeJsonLd } from "@/lib/json-ld";
import { PREMIUM_PRICE_EUR } from "@/lib/payments";
import { getSessionUser } from "@/lib/session";

const FEATURE_KEYS = [
  { key: "remote", icon: "tv" },
  { key: "playlists", icon: "list" },
  { key: "library", icon: "grid" },
  { key: "performance", icon: "zap" },
  { key: "adaptive", icon: "activity" },
  { key: "languages", icon: "globe" },
  { key: "devices", icon: "devices" },
  { key: "premium", icon: "sparkles" },
  { key: "continueWatching", icon: "layers" },
] as const satisfies readonly { key: string; icon: IconName }[];

export default async function HomePage() {
  const { t, locale } = await getI18n();
  const user = await getSessionUser();
  const faq = getFaqItems(locale, { limit: 4 });
  const productSummary = getSetting(
    locale === "de" ? "product_summary_de" : "product_summary_en",
    t.meta.description,
  );
  const [headlineStart, headlineEnd] = t.home.hero.title.split("StreamingHub");

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "StreamingHub",
        url: "https://streaminghub.org",
        logo: "https://streaminghub.org/icon.svg",
        email: "service@streaminghub.org",
      },
      {
        "@type": "SoftwareApplication",
        name: "StreamingHub",
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Fire OS, Android TV, Android",
        description: productSummary,
        offers: {
          "@type": "Offer",
          price: PREMIUM_PRICE_EUR.toFixed(2),
          priceCurrency: "EUR",
          description:
            "StreamingHub Premium, monatliches Abonnement für 2,49 €; Endpreis ohne Umsatzsteuer gemäß § 19 UStG (Kleinunternehmerregelung).",
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: safeJsonLd(structuredData) }}
      />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="grid-lines pointer-events-none absolute inset-0 -z-10" />
        <div className="shell grid items-center gap-14 pb-16 pt-14 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-24">
          <div className="fade-up max-w-xl" lang={locale}>
            <p className="eyebrow">
              <span className="status-dot bg-cyan" />
              {t.home.hero.eyebrow}
            </p>
            <h1 className="mt-4 text-[2.35rem] font-semibold leading-[1.06] sm:text-5xl lg:text-[3.35rem]">
              {headlineStart}
              <span className="grad-text">StreamingHub</span>
              {headlineEnd}
            </h1>
            <p className="mt-5 max-w-lg text-[1rem] leading-relaxed text-muted sm:text-lg">
              {t.home.hero.subtitle}
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="#features" className="btn btn-primary">
                {t.home.hero.ctaPrimary}
                <Icon name="arrow-right" size={17} />
              </Link>
              <Link href="/download" className="btn btn-outline">
                <Icon name="download" size={17} />
                {t.home.hero.ctaSecondary}
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {t.home.hero.badges.map((badge) => (
                <span key={badge} className="chip">
                  <Icon name="check" size={12} className="text-cyan" />
                  {badge}
                </span>
              ))}
            </div>

            <p className="mt-6 max-w-md text-xs leading-relaxed text-muted/85">{t.home.hero.note}</p>
          </div>

          <div className="fade-up fade-up-delay-1 lg:pl-4">
            <AppPreview t={t.home.preview} />
          </div>
        </div>

        <div className="shell pb-14">
          <dl className="grid gap-3 sm:grid-cols-3">
            {t.home.metrics.map((metric) => (
              <div key={metric.label} className="glass-card px-4 py-3.5">
                <dt className="text-[0.7rem] uppercase tracking-[0.12em] text-muted">{metric.label}</dt>
                <dd className="mt-1 text-sm font-semibold text-fg">{metric.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="section border-t border-line/40">
        <div className="shell">
          <SectionHeading
            eyebrow="Funktionen"
            title={t.home.features.title}
            description={t.home.features.subtitle}
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURE_KEYS.map(({ key, icon }) => {
              const feature = t.home.features.items[key];
              const planned = key === "continueWatching";
              return (
                <article key={key} className="card card-hover relative p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-10 place-items-center rounded-xl border border-brand/30 bg-brand/12 text-cyan">
                      <Icon name={icon} size={19} />
                    </span>
                    {planned ? <Badge tone="warn">{t.ui.inDevelopment}</Badge> : null}
                  </div>
                  <h3 className="mt-4 text-[1rem] font-semibold">{feature.title}</h3>
                  <p className="mt-1.5 text-[0.86rem] leading-relaxed text-muted">
                    {feature.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section className="section border-t border-line/40 bg-ink-800/40">
        <div className="shell">
          <SectionHeading eyebrow="Ablauf" title={t.home.workflow.title} description={t.home.workflow.subtitle} />
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {t.home.workflow.steps.map((step, index) => (
              <li key={step.title} className="card relative p-5">
                <span className="text-3xl font-semibold text-brand/45">0{index + 1}</span>
                <h3 className="mt-2 text-[1rem] font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-[0.86rem] leading-relaxed text-muted">{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Premium */}
      <section className="section border-t border-line/40">
        <div className="shell">
          <div className="relative overflow-hidden rounded-[1.75rem] border border-brand/25 bg-[linear-gradient(130deg,rgba(37,99,235,0.18),rgba(6,182,212,0.08)_45%,rgba(8,11,18,0.9))] p-6 sm:p-10">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-brand/20 blur-3xl"
            />
            <div className="relative grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:items-center">
              <div>
                <p className="eyebrow">{t.home.premium.eyebrow}</p>
                <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">{t.home.premium.title}</h2>
                <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted sm:text-[0.98rem]">
                  {t.home.premium.subtitle}
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href="/premium" className="btn btn-primary">
                    {t.home.premium.ctaPrimary}
                    <Icon name="arrow-right" size={17} />
                  </Link>
                  <Link href={user ? "/dashboard/subscription" : "/login?next=/dashboard/subscription"} className="btn btn-outline">
                    {t.home.premium.ctaSecondary}
                  </Link>
                </div>
                <p className="mt-5 max-w-md text-xs leading-relaxed text-muted/80">{t.home.premium.note}</p>
              </div>

              <div className="glass-card p-6">
                <p className="text-xs uppercase tracking-[0.14em] text-muted">Premium</p>
                <p className="mt-2 flex items-baseline gap-2">
                  <span className="text-5xl font-semibold tracking-tight">{t.premium.price}</span>
                  <span className="text-sm text-muted">{t.premium.period}</span>
                </p>
                <p className="mt-2 text-xs text-muted">{t.premium.vat}</p>
                <ul className="mt-5 grid gap-2.5 text-sm">
                  {t.premium.features.map((feature) => (
                    <li key={feature.title} className="flex items-start gap-2.5 text-[0.87rem] text-slate-300">
                      <Icon name="check" size={15} className="mt-0.5 shrink-0 text-cyan" />
                      <span>
                        {feature.title}
                        {feature.status !== "Verfügbar" && feature.status !== "Available" ? (
                          <span className="ms-2 align-middle text-[0.66rem] uppercase tracking-wide text-amber-300/80">
                            {feature.status}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sales channels */}
      <section className="section border-t border-line/40 bg-ink-800/40">
        <div className="shell">
          <SectionHeading eyebrow="Vertrieb" title={t.home.channels.title} description={t.home.channels.subtitle} />
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {(["web", "amazon"] as const).map((channel) => {
              const data = t.home.channels[channel];
              return (
                <article key={channel} className="card p-6">
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-9 place-items-center rounded-lg border border-line bg-white/4 text-cyan">
                      <Icon name={channel === "web" ? "globe" : "card"} size={17} />
                    </span>
                    <h3 className="text-[1.02rem] font-semibold">{data.title}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{data.description}</p>
                  <ul className="mt-4 grid gap-2">
                    {data.points.map((point) => (
                      <li key={point} className="flex items-start gap-2 text-[0.85rem] text-slate-300">
                        <Icon name="check" size={14} className="mt-0.5 shrink-0 text-brand-light" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Transparency */}
      <section className="section border-t border-line/40">
        <div className="shell grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          <SectionHeading eyebrow="Transparenz" title={t.home.transparency.title} />
          <div className="card p-6">
            <p className="text-sm leading-relaxed text-slate-300">{t.home.transparency.body}</p>
            <ul className="mt-5 grid gap-2.5">
              {t.home.transparency.points.map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-sm text-muted">
                  <Icon name="shield" size={16} className="mt-0.5 shrink-0 text-cyan" />
                  {point}
                </li>
              ))}
            </ul>
            <Link href="/help" className="link mt-5 inline-flex min-h-11 items-center gap-1 text-sm">
              {t.help.title}
              <Icon name="arrow-right" size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ teaser */}
      {faq.length > 0 ? (
        <section className="section border-t border-line/40 bg-ink-800/40">
          <div className="shell grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div>
              <SectionHeading eyebrow="FAQ" title={t.home.faqTeaser.title} />
              <Link href="/faq" className="btn btn-outline btn-sm mt-5">
                {t.home.faqTeaser.cta}
                <Icon name="arrow-right" size={15} />
              </Link>
            </div>
            <FaqAccordion items={faq} />
          </div>
        </section>
      ) : null}

      {/* Download CTA */}
      <section className="section border-t border-line/40">
        <div className="shell">
          <div className="card flex flex-col items-start justify-between gap-5 p-6 sm:flex-row sm:items-center sm:p-8">
            <div>
              <h2 className="text-xl font-semibold sm:text-2xl">{t.download.title}</h2>
              <p className="mt-2 max-w-xl text-sm text-muted">{t.download.subtitle}</p>
            </div>
            <Link href="/download" className="btn btn-primary">
              <Icon name="download" size={17} />
              {t.home.hero.ctaSecondary}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
