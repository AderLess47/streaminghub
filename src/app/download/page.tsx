import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Alert, Badge, InfoRow, PageHeader } from "@/components/ui";
import { androidRelease } from "@/lib/android-release";
import { getI18n } from "@/i18n";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Download" };

/** Release metadata arrives as Fly secrets, so it has to be read per request. */
export const dynamic = "force-dynamic";

type PlatformKey = "firetv" | "androidtv" | "android";

export default async function DownloadPage() {
  const { t, locale } = await getI18n();

  const platforms: { key: PlatformKey; url: string; icon: "tv" | "devices" | "phone" }[] = [
    { key: "firetv", url: "/app.apk", icon: "tv" },
    { key: "androidtv", url: "/app.apk", icon: "devices" },
    { key: "android", url: "/app.apk", icon: "phone" },
  ];

  return (
    <div className="shell py-12 sm:py-16">
      <PageHeader
        eyebrow="Apps"
        title={t.download.title}
        description={t.download.subtitle}
      >
        <div className="flex flex-wrap gap-2">
          <Badge tone="ok">
            {t.download.versionLabel} {androidRelease.version}
          </Badge>
          <Badge>{androidRelease.sizeLabel}</Badge>
        </div>
      </PageHeader>

      <div className="mt-8">
        <Alert tone="info">{t.download.notice}</Alert>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {platforms.map((platform) => {
          const meta = t.download.platforms[platform.key];
          const available = Boolean(platform.url);
          return (
            <article key={platform.key} className="card flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <span className="grid size-10 place-items-center rounded-xl border border-brand/25 bg-brand/10 text-cyan">
                  <Icon name={platform.icon} size={19} />
                </span>
                {available ? (
                  <Badge tone="ok">{t.ui.available}</Badge>
                ) : (
                  <Badge tone="warn">{t.ui.notAvailable}</Badge>
                )}
              </div>
              <h2 className="mt-4 text-[1rem] font-semibold">{meta.name}</h2>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">{meta.description}</p>
              <p className="mt-3 text-xs text-muted/80">{meta.requirements}</p>
              <p className="mt-1 text-[0.7rem] text-cyan/80">
                {t.download.versionLabel} {androidRelease.version} · {androidRelease.sizeLabel}
              </p>

              {available ? (
                <a
                  href={platform.url}
                  download={androidRelease.fileName}
                  type="application/vnd.android.package-archive"
                  className="btn btn-primary btn-sm mt-4 btn-block"
                  rel="noopener noreferrer"
                >
                  <Icon name="download" size={15} />
                  {t.download.downloadCta}
                </a>
              ) : (
                <button type="button" className="btn btn-outline btn-sm mt-4 btn-block" disabled>
                  <Icon name="download" size={15} />
                  {t.download.placeholderCta}
                </button>
              )}
            </article>
          );
        })}
      </div>

      <div className="mt-6 card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-10 place-items-center rounded-xl border border-line bg-white/4 text-cyan">
            <Icon name="card" size={18} />
          </span>
          <div>
            <p className="text-sm font-medium">Amazon Appstore</p>
            <p className="mt-0.5 text-xs text-muted">
              {locale === "de"
                ? "Eine Appstore-Listung ist noch nicht verfügbar. In der Appstore-Version wird Premium derzeit nicht angeboten."
                : "An Appstore listing is not available yet. Premium is currently not offered in the Appstore build."}
            </p>
          </div>
        </div>
        {env.downloads.amazonStore ? (
          <a href={env.downloads.amazonStore} className="btn btn-outline btn-sm" rel="noopener noreferrer">
            {t.download.amazonCta}
            <Icon name="external" size={14} />
          </a>
        ) : (
          <button type="button" className="btn btn-outline btn-sm" disabled>
            {t.download.amazonPlaceholder}
          </button>
        )}
      </div>

      <section className="mt-12 grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
        <div className="card p-6">
          <h2 className="text-lg font-semibold">{t.download.sideloadTitle}</h2>
          <div className="mt-4 rounded-xl border border-cyan/20 bg-cyan/5 p-3.5">
            <p className="text-xs font-semibold text-cyan">{t.download.downloaderTitle}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{t.download.downloaderHint}</p>
            <a
              href="/app.apk"
              className="mt-2 inline-flex min-h-11 items-center font-mono text-xs text-cyan underline decoration-cyan/30 underline-offset-2"
            >
              {t.download.downloaderUrl}
            </a>
          </div>
          <ol className="mt-4 grid gap-3">
            {t.download.sideloadSteps.map((step, index) => (
              <li key={step} className="flex gap-3 text-sm leading-relaxed text-slate-300">
                <span className="grid size-6 shrink-0 place-items-center rounded-full border border-line bg-white/5 text-xs font-semibold text-cyan">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/6 px-3.5 py-3 text-xs leading-relaxed text-amber-200/90">
            {t.download.sideloadWarning}
          </p>
        </div>

        <div className="grid gap-4">
          <div className="card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Icon name="shield" size={16} className="text-cyan" />
              {t.download.verifyTitle}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-muted">{t.download.verifyBody}</p>

            <div className="mt-3">
              <InfoRow
                label={t.download.versionLabel}
                value={`${androidRelease.version} (Build ${androidRelease.versionCode})`}
              />
              <InfoRow
                label={t.download.fileLabel}
                value={<code className="font-mono text-[0.7rem]">{androidRelease.fileName}</code>}
              />
              <InfoRow label={t.download.fileSizeLabel} value={androidRelease.sizeLabel} />
            </div>

            <div className="mt-3 rounded-xl border border-line bg-white/3 p-3">
              <p className="text-[0.65rem] uppercase tracking-[0.12em] text-muted">
                {t.download.checksumLabel}
              </p>
              <code className="mt-1.5 block break-all font-mono text-[0.68rem] leading-relaxed text-slate-300">
                {androidRelease.sha256}
              </code>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Icon name="key" size={16} className="text-cyan" />
              {t.nav.activate}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-muted">{t.activate.subtitle}</p>
            <Link href="/activate" className="btn btn-outline btn-sm mt-3">
              {t.nav.activate}
              <Icon name="arrow-right" size={14} />
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
