"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { IconName } from "./icons";
import { Icon } from "./icons";

export type DashNavItem = { href: string; label: string; icon: IconName };

const score = (pathname: string, href: string) =>
  pathname === href ? href.length + 1000 : pathname.startsWith(`${href}/`) ? href.length : -1;

export function DashboardNav({ items, currentLabel }: { items: DashNavItem[]; currentLabel?: string }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  // Only one entry can be current: the overview href is a prefix of every
  // subpage, which used to mark "Übersicht" as active everywhere.
  const activeHref = items.reduce((best, item) =>
    score(pathname, item.href) > score(pathname, best) ? item.href : best, items[0]?.href ?? "");

  // On phones the items form a horizontal strip; without this the current page
  // can sit off-screen and the strip always starts at the first entry.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || nav.scrollWidth <= nav.clientWidth + 1) return;
    const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (!active) return;
    const navBox = nav.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    const target = nav.scrollLeft + (activeBox.left - navBox.left) - (navBox.width - activeBox.width) / 2;
    nav.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [pathname]);

  return (
    <nav
      ref={navRef}
      className="no-scrollbar relative -mx-1 flex snap-x scroll-px-3 gap-1 overflow-x-auto scroll-smooth px-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0"
      aria-label="Dashboard"
    >
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 shrink-0 snap-start items-center gap-2.5 rounded-xl px-3 py-2.5 text-[0.84rem] font-medium transition ${
              active
                ? "border border-brand/30 bg-brand/12 text-fg"
                : "border border-transparent text-muted hover:bg-white/4 hover:text-fg"
            }`}
          >
            <Icon name={item.icon} size={16} className={active ? "text-cyan" : ""} />
            {item.label}
            {/* Chromium does not pass aria-current to the accessibility tree, so
                the state is spelled out for screen readers as well. */}
            {active && currentLabel ? <span className="sr-only"> ({currentLabel})</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
