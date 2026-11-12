"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { localeMeta, locales, type Locale } from "@/i18n/config";
import { Icon } from "./icons";

export function LanguageSwitcher({
  locale,
  label,
  compact = false,
}: {
  locale: Locale;
  label: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<Locale>(locale);

  async function change(next: Locale) {
    setValue(next);
    await fetch("/api/locale", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locale: next }),
    });
    startTransition(() => router.refresh());
  }

  return (
    <label className={`inline-flex items-center gap-1.5 ${pending ? "opacity-70" : ""}`}>
      <Icon name="globe" size={15} className="text-muted" />
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => void change(event.target.value as Locale)}
        className={`min-h-9 cursor-pointer appearance-none rounded-lg border border-transparent bg-transparent py-1 pe-4 ps-0.5 text-xs font-medium text-muted transition hover:text-fg focus-visible:border-cyan/40 ${
          // A select sizes itself to its widest option, which pushes the header
          // past the viewport on phones. Compact mode pins it to the visible label.
          compact ? "w-[5.4rem] truncate" : "sm:text-[0.8rem]"
        }`}
        aria-label={label}
        disabled={pending}
      >
        {locales.map((code) => (
          <option key={code} value={code} className="bg-ink text-fg">
            {localeMeta[code].label}
            {localeMeta[code].complete ? "" : " (EN fallback)"}
          </option>
        ))}
      </select>
    </label>
  );
}
