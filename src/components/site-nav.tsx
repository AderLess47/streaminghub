"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Role } from "@/lib/session";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/de";
import { logoutAction } from "@/lib/actions/auth";
import { Icon } from "./icons";
import { LanguageSwitcher } from "./language-switcher";
import { LogoMark } from "./logo";

type NavUser = { displayName: string; email: string; role: Role } | null;

const LINKS: { href: string; key: keyof Dictionary["nav"] }[] = [
  { href: "/", key: "home" },
  { href: "/premium", key: "premium" },
  { href: "/download", key: "download" },
  { href: "/help", key: "help" },
  { href: "/faq", key: "faq" },
  { href: "/contact", key: "contact" },
];

export function SiteNav({
  t,
  locale,
  user,
  isStaffUser,
}: {
  t: Dictionary["nav"];
  locale: Locale;
  user: NavUser;
  isStaffUser: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // The open menu covers the page, so keep the keyboard inside it: Escape closes
  // and hands focus back to the toggle, Tab cycles between the toggle and the panel.
  useEffect(() => {
    if (!open) return;
    const items = () => {
      const panel = menuPanelRef.current;
      const inPanel = panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled])',
            ),
          )
        : [];
      return [menuButtonRef.current, ...inPanel].filter(
        (el): el is HTMLElement => Boolean(el),
      );
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        menuButtonRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const list = items();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !list.includes(active)) {
        event.preventDefault();
        first.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <div
        className={`glass sticky top-0 z-50 transition-shadow ${scrolled ? "shadow-[0_10px_40px_-24px_rgba(0,0,0,0.9)]" : ""}`}
      >
        <nav className="shell flex h-16 items-center justify-between gap-2 sm:gap-4" aria-label={t.mainNav}>
          <Link
            href="/"
            className="flex min-w-0 items-center gap-2.5 rounded-lg"
            aria-label={t.homeLabel}
          >
            <LogoMark size={32} />
                            {/* Below 360 px the wordmark would only show "Strea…"; the logo mark
                    keeps the link recognisable and its aria-label names the site. */}
                <span className="truncate text-[1.02rem] font-semibold tracking-tight max-[359px]:hidden">
              Streaming<span className="grad-text">Hub</span>
            </span>
          </Link>

          <ul className="hidden items-center gap-1 lg:flex">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={`rounded-lg px-3 py-2 text-[0.86rem] font-medium transition ${
                    isActive(link.href)
                      ? "bg-white/7 text-fg"
                      : "text-muted hover:bg-white/4 hover:text-fg"
                  }`}
                >
                  {t[link.key]}
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden items-center gap-2 lg:flex">
            <LanguageSwitcher locale={locale} label={t.language} compact />
            {user ? (
              <>
                {isStaffUser ? (
                  <Link href="/admin" className="btn btn-ghost btn-sm">
                    {t.admin}
                  </Link>
                ) : null}
                <Link href="/dashboard" className="btn btn-outline btn-sm">
                  {t.dashboard}
                </Link>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="btn btn-ghost btn-sm"
                    aria-label={t.logout}
                    title={t.logout}
                  >
                    <Icon name="logout" size={17} />
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/login" className="btn btn-ghost btn-sm">
                  {t.login}
                </Link>
                <Link href="/register" className="btn btn-primary btn-sm">
                  {t.register}
                </Link>
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1 lg:hidden">
            <LanguageSwitcher locale={locale} label={t.language} compact />
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-controls="mobile-menu"
              className="grid size-10 place-items-center rounded-lg border border-line/60 text-fg"
              aria-label={open ? t.closeMenu : t.menu}
            >
              <Icon name={open ? "close" : "menu"} size={20} />
            </button>
          </div>
        </nav>
      </div>

      {open ? (
        <div className="fixed inset-0 top-16 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/80 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            id="mobile-menu"
            ref={menuPanelRef}
            className="relative mx-4 mt-3 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-2xl border border-line bg-panel-2 p-4 shadow-2xl"
          >
            <ul className="grid gap-1">
              {LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`flex items-center justify-between rounded-xl px-3 py-3 text-sm font-medium ${
                      isActive(link.href) ? "bg-white/7 text-fg" : "text-muted"
                    }`}
                  >
                    {t[link.key]}
                    <Icon name="arrow-right" size={16} className="opacity-50" />
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/activate"
                  className="flex items-center justify-between rounded-xl px-3 py-3 text-sm font-medium text-muted"
                >
                  {t.activate}
                  <Icon name="key" size={16} className="opacity-50" />
                </Link>
              </li>
              <li>
                <Link
                  href="/status"
                  className="flex items-center justify-between rounded-xl px-3 py-3 text-sm font-medium text-muted"
                >
                  {t.status}
                  <Icon name="activity" size={16} className="opacity-50" />
                </Link>
              </li>
            </ul>

            <div className="mt-3 grid gap-2 border-t border-line/60 pt-3">
              {user ? (
                <>
                  <Link href="/dashboard" className="btn btn-outline btn-block">
                    {t.dashboard}
                  </Link>
                  {isStaffUser ? (
                    <Link href="/admin" className="btn btn-ghost btn-block">
                      {t.admin}
                    </Link>
                  ) : null}
                  <form action={logoutAction}>
                    <button type="submit" className="btn btn-ghost btn-block">
                      {t.logout}
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login" className="btn btn-outline btn-block">
                    {t.login}
                  </Link>
                  <Link href="/register" className="btn btn-primary btn-block">
                    {t.register}
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
