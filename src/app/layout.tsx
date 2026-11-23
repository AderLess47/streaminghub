import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import "./globals.css";
import { CookieConsent } from "@/components/cookie-consent";
import { LogoGradientDefs } from "@/components/logo";
import { RouteAnnouncer } from "@/components/route-announcer";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { getI18n } from "@/i18n";
import { localeMeta } from "@/i18n/config";
import { bootstrap } from "@/lib/bootstrap";
import { isMaintenanceModeEnabled } from "@/lib/maintenance";
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

/** Diese Bereiche bleiben im Wartungsmodus erreichbar. */
const MAINTENANCE_EXEMPT = ["/admin", "/status", "/api", "/_next", "/app.apk"];

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

function MaintenanceScreen({ locale }: { locale: string }) {
  const de = locale !== "en";
  return (
    <main
      id="main"
      className="shell flex min-h-dvh flex-col items-center justify-center py-20 text-center"
    >
      <p className="eyebrow">StreamingHub</p>
      <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">
        {de ? "Wartungsarbeiten" : "Scheduled maintenance"}
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
        {de
          ? "Wir aktualisieren gerade das Kundenportal und sind in wenigen Minuten wieder erreichbar. Bereits gekoppelte Geräte funktionieren weiterhin."
          : "We are updating the customer portal and will be back in a few minutes. Devices that are already paired keep working."}
      </p>
      <Link href="/status" className="btn btn-outline btn-sm mt-6">
        {de ? "Systemstatus ansehen" : "View system status"}
      </Link>
    </main>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  bootstrap();
  const { t, locale, dir } = await getI18n();
  const user = await getSessionUser();

  const pathname = (await headers()).get("x-pathname") ?? "";
  const exempt = MAINTENANCE_EXEMPT.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const maintenance =
    !exempt && !(user && isStaff(user.role)) && isMaintenanceModeEnabled();

  return (
    // Teilübersetzte Sprachen sind überwiegend englisch; dann ist Englisch die
    // richtige Dokumentsprache, und die übersetzten Stellen tragen lang={locale}.
    <html lang={localeMeta[locale].complete ? locale : "en"} dir={dir} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        {maintenance ? (
          <MaintenanceScreen locale={locale} />
        ) : (
          <>
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
          </>
        )}
      </body>
    </html>
  );
}
