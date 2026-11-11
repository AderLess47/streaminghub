import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";

export const metadata: Metadata = { title: "Konto löschen" };

export default async function AccountDeletionPage() {
  const { t } = await getI18n();
  const copy = t.accountDeletion;

  return (
    <div className="shell py-12 sm:py-16">
      <PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />
      <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted/90">{copy.updated}</p>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <section className="card p-6" aria-labelledby="deletion-signed-in">
          <h2 id="deletion-signed-in" className="text-xl font-semibold">
            {copy.inAppTitle}
          </h2>
          <ol className="mt-4 grid gap-3 text-sm leading-relaxed text-muted">
            {copy.inAppSteps.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-white/7 text-xs font-semibold text-fg">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs leading-relaxed text-muted/80">{copy.inAppNote}</p>
          <Link href="/login" className="btn btn-primary btn-sm mt-5">
            {copy.openDashboard}
          </Link>
        </section>

        <section className="card p-6" aria-labelledby="deletion-by-email">
          <h2 id="deletion-by-email" className="text-xl font-semibold">
            {copy.webTitle}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">{copy.webText}</p>
          <ol className="mt-4 grid gap-3 text-sm leading-relaxed text-muted">
            {copy.webSteps.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-white/7 text-xs font-semibold text-fg">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs leading-relaxed text-muted/80">{copy.webNote}</p>
          <a
            href={`mailto:service@streaminghub.org?subject=${encodeURIComponent(copy.mailSubject)}`}
            className="btn btn-outline btn-sm mt-5"
          >
            <Icon name="mail" size={15} />
            {copy.writeEmail}
          </a>
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-6" aria-labelledby="deletion-removed">
          <h2 id="deletion-removed" className="text-xl font-semibold">
            {copy.deletedTitle}
          </h2>
          <ul className="mt-4 grid gap-2 text-sm leading-relaxed text-muted">
            {copy.deletedItems.map((item) => (
              <li key={item} className="flex gap-2">
                <Icon name="check" size={16} className="mt-0.5 shrink-0 text-emerald-300" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-6" aria-labelledby="deletion-retained">
          <h2 id="deletion-retained" className="text-xl font-semibold">
            {copy.retainedTitle}
          </h2>
          <ul className="mt-4 grid gap-2 text-sm leading-relaxed text-muted">
            {copy.retainedItems.map((item) => (
              <li key={item} className="flex gap-2">
                <Icon name="info" size={16} className="mt-0.5 shrink-0 text-sky-300" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card mt-6 p-6" aria-labelledby="deletion-device">
        <h2 id="deletion-device" className="text-xl font-semibold">
          {copy.appTitle}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">{copy.appText}</p>
      </section>

      <section className="card mt-6 p-6" aria-labelledby="deletion-contact">
        <h2 id="deletion-contact" className="text-xl font-semibold">
          {copy.contactTitle}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">{copy.contactText}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/privacy" className="btn btn-outline btn-sm">
            {copy.privacyLink}
          </Link>
          <Link href="/contact" className="btn btn-ghost btn-sm">
            {copy.contactLink}
          </Link>
        </div>
      </section>
    </div>
  );
}
