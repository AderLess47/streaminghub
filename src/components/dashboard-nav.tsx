"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { IconName } from "./icons";
import { Icon } from "./icons";

export type DashNavItem = { href: string; label: string; icon: IconName };

export function DashboardNav({ items }: { items: DashNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible" aria-label="Dashboard">
      {items.map((item) => {
        const active =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-[0.84rem] font-medium transition ${
              active
                ? "border border-brand/30 bg-brand/12 text-fg"
                : "border border-transparent text-muted hover:bg-white/4 hover:text-fg"
            }`}
          >
            <Icon name={item.icon} size={16} className={active ? "text-cyan" : ""} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
