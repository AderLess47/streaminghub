"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { localeMeta, locales, type Locale } from "@/i18n/config";
import { Icon } from "./icons";

export function LanguageSwitcher({
  locale,
  label,
  pendingLabel,
  changedLabel,
  compact = false,
}: {
  locale: Locale;
  label: string;
  pendingLabel: string;
  changedLabel: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState<Locale>(locale);
  const [announcement, setAnnouncement] = useState("");
  const busyRef = useRef(false);
  const busy = saving || pending;

  async function change(next: Locale) {
    if (busyRef.current) return;
    busyRef.current = true;
    setValue(next);
    setSaving(true);
    setAnnouncement(pendingLabel);
    try {
      await fetch("/api/locale", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      setAnnouncement(changedLabel.replace("{language}", localeMeta[next].label));
      startTransition(() => router.refresh());
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }

  return (
    <>
      <label
        aria-busy={busy || undefined}
        className={`inline-flex items-center gap-1.5 transition-opacity ${busy ? "opacity-70" : ""}`}
      >
        {busy ? (
          <Icon name="refresh" size={15} className="animate-spin text-cyan" />
        ) : (
          <Icon name="globe" size={15} className="text-muted" />
        )}
        <span className="sr-only">{label}</span>
        <select
          value={value}
          onChange={(event) => void change(event.target.value as Locale)}
          aria-disabled={busy || undefined}
          className={`min-h-9 cursor-pointer appearance-none rounded-lg border border-transparent bg-transparent py-1 pe-4 ps-0.5 text-xs font-medium text-muted transition hover:text-fg focus-visible:border-cyan/40 ${
            // A select sizes itself to its widest option, which pushes the header
            // past the viewport on phones. Compact mode pins it to the visible label.
            compact ? "w-[5.4rem] truncate" : "sm:text-[0.8rem]"
          }`}
          aria-label={label}
        >
          {locales.map((code) => (
            <option key={code} value={code} className="bg-ink text-fg">
              {localeMeta[code].label}
              {localeMeta[code].complete ? "" : " (EN fallback)"}
            </option>
          ))}
        </select>
      </label>
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </>
  );
}
