import type { Metadata, Viewport } from "next";
import "./globals.css";
import { CookieConsent } from "@/components/cookie-consent";
import { LogoGradientDefs } from "@/components/logo";
import { RouteAnnouncer } from "@/components/route-announcer";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { getI18n } from "@/i18n";
import { localeMeta } from "@/i18n/config";
import { bootstrap } from "@/lib/bootstrap";
import { getSessionUser, isStaff } from "@/lib/session";

// The layout boots the SQLite schema and reads the session on every request.
// Keep all routes dynamic so the production build never writes to the database.
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#080B12",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export async function generateMetadata(): Promise<Metadata> {
  const { t, locale } = await getI18n();
  return {
    metadataBase: new URL(process.env.APP_URL ?? "https://streaminghub.org"),
    title: { default: t.meta.title, template: `%s | StreamingHub` },
    description: t.meta.description,
    applicationName: "StreamingHub",
    keywords: [
      "StreamingHub",
      "IPTV Player",
      "Fire TV",
      "Android TV",
      "eigene Playlists",
      "M3U Player",
    ],
    alternates: {
      canonical: "/",
      languages: { de: "/", en: "/?lang=en" },
    },
    openGraph: {
      type: "website",
      siteName: "StreamingHub",
      locale: locale === "de" ? "de_DE" : "en_US",
      title: t.meta.title,
      description: t.meta.description,
      url: "/",
    },
    twitter: {
      card: "summary_large_image",
      title: t.meta.title,
      description: t.meta.description,
    },
    robots: { index: true, follow: true },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  bootstrap();
  const { t, locale, dir } = await getI18n();
  const user = await getSessionUser();

  return (
    // Teilübersetzte Sprachen sind überwiegend englisch; dann ist Englisch die
    // richtige Dokumentsprache, und die übersetzten Stellen tragen lang={locale}.
    <html lang={localeMeta[locale].complete ? locale : "en"} dir={dir} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <LogoGradientDefs />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          {t.nav.skipToContent ?? (locale === "de" ? "Zum Inhalt springen" : "Skip to content")}
        </a>
        <SiteNav
          t={t.nav}
          locale={locale}
          user={
            user
              ? { displayName: user.displayName, email: user.email, role: user.role }
              : null
          }
          isStaffUser={Boolean(user && isStaff(user.role))}
        />
        <main id="main" tabIndex={-1} className="focus:outline-none">
          {children}
        </main>
        <RouteAnnouncer />
        <SiteFooter t={t} role={user?.role ?? null} locale={locale} />
        <CookieConsent t={t.consent} />
      </body>
    </html>
  );
}
