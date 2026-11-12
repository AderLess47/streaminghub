"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { localeMeta, locales, type Locale } from "@/i18n/config";
import { Icon } from "./icons";
import { LiveRegion } from "./live-region";

/**
 * Ruhezeit nach der letzten Auswahl. Ein zugeklapptes `<select>` feuert pro
 * Pfeiltaste ein `change`; ohne diese Pause löste jedes Weiterblättern eine
 * Anfrage und ein Neuladen aus.
 */
const COMMIT_DELAY_MS = 450;

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
  const committedRef = useRef<Locale>(locale);
  const latestRef = useRef<Locale>(locale);
  const timerRef = useRef<number | null>(null);
  const busy = saving || pending;

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  async function commit(next: Locale) {
    if (next === committedRef.current) return;
    if (busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    setAnnouncement(pendingLabel);
    let succeeded = false;
    try {
      const response = await fetch("/api/locale", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      if (!response.ok) return;
      succeeded = true;
      committedRef.current = next;
      setAnnouncement(changedLabel.replace("{language}", localeMeta[next].label));
      startTransition(() => router.refresh());
    } finally {
      busyRef.current = false;
      setSaving(false);
      // Wer während der Anfrage weitergeblättert hat, bekommt seine letzte
      // Auswahl nachgeschoben, statt sie zu verlieren.
      if (succeeded && latestRef.current !== committedRef.current) {
        void commit(latestRef.current);
      }
    }
  }

  function queue(next: Locale) {
    latestRef.current = next;
    setValue(next);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void commit(latestRef.current);
    }, COMMIT_DELAY_MS);
  }

  function flush() {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    void commit(latestRef.current);
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
          onChange={(event) => queue(event.target.value as Locale)}
          onBlur={flush}
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
      <LiveRegion message={announcement} />
    </>
  );
}
