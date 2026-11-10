import type { Metadata } from "next";
import Link from "next/link";
import { HelpTopics } from "@/components/help-topics";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { getHelpArticle, type HelpTopicKey } from "@/content/help";
import { getI18n } from "@/i18n";

export const metadata: Metadata = { title: "Hilfe-Center" };

const TOPIC_KEYS: HelpTopicKey[] = [
  "playlist",
  "install",
  "activate",
  "premium",
  "playback",
  "connection",
  "account",
  "subscription",
];

export default async function HelpPage() {
  const { t, locale } = await getI18n();

  const topics = TOPIC_KEYS.map((key) => {
    const article = getHelpArticle(key, locale);
    return {
      key,
      title: t.help.topics[key].title,
      description: t.help.topics[key].description,
      intro: article.intro,
      steps: article.steps,
      note: article.note,
    };
  });

  return (
    <div className="shell py-12 sm:py-16">
      <PageHeader eyebrow="Support" title={t.help.title} description={t.help.subtitle} />

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.6fr_0.7fr] lg:items-start">
        <HelpTopics
          topics={topics}
          labels={{
            search: t.help.searchLabel,
            searchPlaceholder: t.ui.searchPlaceholder,
            noResults: t.help.noResults,
          }}
        />

        <aside className="grid gap-4 lg:sticky lg:top-24">
          <div className="card p-5">
            <h2 className="text-sm font-semibold">{t.help.stillNeedHelp}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              {t.contact.subtitle}
            </p>
            <Link href="/contact" className="btn btn-primary btn-sm mt-3 btn-block">
              <Icon name="mail" size={15} />
              {t.help.contactCta}
            </Link>
            <Link href="/faq" className="btn btn-outline btn-sm mt-2 btn-block">
              {t.help.openFaq}
            </Link>
          </div>
          <div className="card p-5">
            <h2 className="text-sm font-semibold">{t.contact.responseTime}</h2>
            <p className="mt-1.5 text-xs text-muted">{t.contact.responseTimeValue}</p>
            <h3 className="mt-3 text-sm font-semibold">{t.contact.hours}</h3>
            <p className="mt-1.5 text-xs text-muted">{t.contact.hoursValue}</p>
            <a href="mailto:service@streaminghub.org" className="link mt-3 inline-block text-xs">
              service@streaminghub.org
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}
