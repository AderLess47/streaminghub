import type { Metadata } from "next";
import { ContactForm } from "@/components/contact-form";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Kontakt" };

export default async function ContactPage() {
  const { t } = await getI18n();

  return (
    <div className="shell py-12 sm:py-16">
      <PageHeader eyebrow="Support" title={t.contact.title} description={t.contact.subtitle} />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_0.7fr] lg:items-start">
        <ContactForm t={t.contact} privacyLabel={t.footer.privacy} />

        <aside className="grid gap-4">
          <div className="card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Icon name="mail" size={16} className="text-cyan" />
              {t.contact.supportEmailLabel}
            </h2>
            <a href={`mailto:${env.supportEmail}`} className="link mt-2 inline-block text-sm">
              {env.supportEmail}
            </a>
            <p className="mt-2 text-xs leading-relaxed text-muted">{t.contact.accountHint}</p>
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold">{t.contact.responseTime}</h2>
            <p className="mt-1.5 text-xs text-muted">{t.contact.responseTimeValue}</p>
            <h3 className="mt-4 text-sm font-semibold">{t.contact.hours}</h3>
            <p className="mt-1.5 text-xs text-muted">{t.contact.hoursValue}</p>
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold">{t.help.title}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">{t.help.subtitle}</p>
            <a href="/help" className="btn btn-outline btn-sm mt-3 btn-block">
              {t.help.title}
            </a>
            <a href="/status" className="btn btn-ghost btn-sm mt-2 btn-block">
              {t.nav.status}
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}
