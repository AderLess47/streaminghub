"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Dictionary } from "@/i18n/de";
import { Icon } from "./icons";

const COOKIE = "sh_consent";

export function CookieConsent({ t }: { t: Dictionary["consent"] }) {
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const hasChoice = document.cookie.split("; ").some((entry) => entry.startsWith(`${COOKIE}=`));
    if (!hasChoice) {
      const timer = window.setTimeout(() => setVisible(true), 900);
      return () => window.clearTimeout(timer);
    }
    const reopen = () => setVisible(true);
    window.addEventListener("sh:open-consent", reopen);
    return () => window.removeEventListener("sh:open-consent", reopen);
  }, []);

  async function choose(choice: "all" | "necessary") {
    setSaving(true);
    try {
      await fetch("/api/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ choice }),
      });
      setVisible(false);
    } finally {
      setSaving(false);
    }
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-60 p-3 sm:p-5"
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-title"
    >
      <div className="glass-card mx-auto flex max-w-3xl flex-col gap-4 p-4 shadow-2xl sm:flex-row sm:items-start sm:p-5">
        <span className="hidden size-10 shrink-0 place-items-center rounded-full border border-cyan/30 bg-cyan/10 text-cyan sm:grid">
          <Icon name="shield" size={19} />
        </span>
        <div className="flex-1">
          <p id="consent-title" className="text-sm font-semibold text-fg">
            {t.title}
          </p>
          <p className="mt-1 text-[0.82rem] leading-relaxed text-muted">{t.text}</p>
          <Link href="/privacy#cookies" className="link mt-2 inline-block text-xs">
            {t.details}
          </Link>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:w-44">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void choose("all")}
            disabled={saving}
          >
            {t.accept}
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => void choose("necessary")}
            disabled={saving}
          >
            {t.reject}
          </button>
        </div>
      </div>
    </div>
  );
}
