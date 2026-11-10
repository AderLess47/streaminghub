import type { Metadata } from "next";
import Link from "next/link";
import { FaqAccordion } from "@/components/faq-accordion";
import { Icon } from "@/components/icons";
import { EmptyState, PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import { getFaqItems } from "@/lib/content";
import { safeJsonLd } from "@/lib/json-ld";

export const metadata: Metadata = { title: "Häufige Fragen" };

const CATEGORIES = [
  "playlist",
  "installation",
  "devices",
  "premium",
  "troubleshooting",
  "account",
] as const;

export default async function FaqPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { t, locale } = await getI18n();
  const params = await searchParams;
  const active =
    params.category && (CATEGORIES as readonly string[]).includes(params.category)
      ? params.category
      : null;
  const items = getFaqItems(locale, active ? { category: active } : undefined);
  const allItems = active ? items : items;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: allItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return (
    <div className="shell py-12 sm:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(structuredData) }}
      />
      <PageHeader eyebrow="FAQ" title={t.faq.title} description={t.faq.subtitle} />

      <nav className="mt-6 flex flex-wrap gap-2" aria-label={t.faq.title}>
        <Link
          href="/faq"
          className={`chip ${active ? "" : "chip-brand"}`}
          aria-current={active ? undefined : "page"}
        >
          {t.faq.allCategories}
        </Link>
        {CATEGORIES.map((category) => (
          <Link
            key={category}
            href={`/faq?category=${category}`}
            className={`chip ${active === category ? "chip-brand" : ""}`}
            aria-current={active === category ? "page" : undefined}
          >
            {t.faq.categories[category]}
          </Link>
        ))}
      </nav>

      <div className="mt-8 max-w-3xl">
        {items.length > 0 ? (
          <FaqAccordion items={items} />
        ) : (
          <EmptyState icon="file-text" title={t.faq.empty} />
        )}
      </div>

      <div className="card mt-8 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">{t.help.stillNeedHelp}</p>
        <div className="flex gap-2">
          <Link href="/help" className="btn btn-outline btn-sm">
            {t.help.title}
          </Link>
          <Link href="/contact" className="btn btn-primary btn-sm">
            <Icon name="mail" size={15} />
            {t.help.contactCta}
          </Link>
        </div>
      </div>
    </div>
  );
}
