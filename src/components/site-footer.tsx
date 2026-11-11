import Link from "next/link";
import type { Dictionary } from "@/i18n/de";
import type { Role } from "@/lib/session";
import { Logo } from "./logo";
import { CookieSettingsButton } from "./cookie-settings-button";

export function SiteFooter({ t, role }: { t: Dictionary; role: Role | null }) {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-line/50 bg-ink-800/60">
      <div className="shell py-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-xs">
            <Logo size={34} />
            <p className="mt-3 text-sm leading-relaxed text-muted">{t.footer.tagline}</p>
            <p className="mt-4 text-xs leading-relaxed text-muted/80">{t.footer.disclaimer}</p>
          </div>

          <FooterColumn title={t.footer.product}>
            <FooterLink href="/premium">{t.nav.premium}</FooterLink>
            <FooterLink href="/download">{t.nav.download}</FooterLink>
            <FooterLink href="/activate">{t.nav.activate}</FooterLink>
            <FooterLink href="/status">{t.nav.status}</FooterLink>
          </FooterColumn>

          <FooterColumn title={t.footer.support}>
            <FooterLink href="/help">{t.nav.help}</FooterLink>
            <FooterLink href="/faq">{t.nav.faq}</FooterLink>
            <FooterLink href="/contact">{t.nav.contact}</FooterLink>
            <li>
              <a href="mailto:service@streaminghub.org" className="transition hover:text-fg">
                service@streaminghub.org
              </a>
            </li>
          </FooterColumn>

          <FooterColumn title={t.footer.legal}>
            <FooterLink href="/imprint">{t.footer.imprint}</FooterLink>
            <FooterLink href="/privacy">{t.footer.privacy}</FooterLink>
            <FooterLink href="/account-deletion">{t.footer.accountDeletion}</FooterLink>
            <FooterLink href="/terms">{t.footer.terms}</FooterLink>
            <FooterLink href="/subscription-terms">{t.footer.subscriptionTerms}</FooterLink>
            <FooterLink href="/withdrawal">{t.footer.withdrawal}</FooterLink>
          </FooterColumn>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-line/50 pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} StreamingHub. {t.footer.rights}
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link href={role ? "/dashboard" : "/login"} className="transition hover:text-fg">
              {role ? t.footer.account : t.nav.login}
            </Link>
            <CookieSettingsButton label={t.footer.cookies} />
            <span className="text-muted/70">{t.footer.languageNote}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-fg/80">{title}</h2>
      <ul className="mt-3 grid gap-2 text-sm text-muted">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="transition hover:text-fg">
        {children}
      </Link>
    </li>
  );
}
