"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/i18n/de";
import { Icon } from "./icons";
import { LiveRegion } from "./live-region";

const COOKIE = "sh_consent";

export function CookieConsent({ t }: { t: Dictionary["consent"] }) {
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const openedByTriggerRef = useRef(false);

  useEffect(() => {
    const hasChoice = document.cookie.split("; ").some((entry) => entry.startsWith(`${COOKIE}=`));
    if (!hasChoice) {
      const timer = window.setTimeout(() => setVisible(true), 900);
      return () => window.clearTimeout(timer);
    }
    const reopen = () => {
      openedByTriggerRef.current = true;
      setVisible(true);
    };
    window.addEventListener("sh:open-consent", reopen);
    return () => window.removeEventListener("sh:open-consent", reopen);
  }, []);

  // The banner opens on its own, so it only takes focus when nobody is working
  // elsewhere on the page; whoever opened it from the footer gets focus inside,
  // and both ways hand focus back to where it came from.
  useEffect(() => {
    if (!visible) return;
    const active = document.activeElement;
    const idle = !active || active === document.body;
    const takeFocus = openedByTriggerRef.current || idle;
    openedByTriggerRef.current = false;
    returnFocusRef.current = takeFocus && !idle ? (active as HTMLElement) : null;
    if (takeFocus) dialogRef.current?.focus();
  }, [visible]);

  // Der Banner steht fest über dem Seitenende. Solange er offen ist, reserviert
  // er sich am Dokumentende Platz in seiner Höhe; globals.css zieht denselben
  // Betrag vom Scrollbereich ab, damit ein fokussierter Knopf im Footer über dem
  // Banner bleibt statt vollständig darunter zu verschwinden (2.4.11).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!visible || !dialog) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => {
      root.style.setProperty("--consent-banner-space", `${dialog.offsetHeight}px`);
    });
    observer.observe(dialog);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--consent-banner-space");
    };
  }, [visible]);

  // Escape schließt den Banner, egal wo der Fokus gerade liegt; am Dialog
  // allein verfehlt es jeden, der zwischendurch woanders hintabbt.
  useEffect(() => {
    if (!visible || saving) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      close(t.dismissed);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [visible, saving, t.dismissed]);

  function close(message?: string) {
    // Nur wenn der Fokus im Banner lag, darf er danach woanders hinspringen;
    // wer währenddessen im Formular arbeitet, behält seinen Fokus.
    const active = document.activeElement;
    const focusInBanner =
      !active || active === document.body || (dialogRef.current?.contains(active) ?? false);
    setVisible(false);
    setError("");
    if (message) setAnnouncement(message);
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    if (target && document.contains(target)) {
      target.focus();
      return;
    }
    // Ohne Rückgabe-Ziel (Banner erschien von selbst) fiele der Fokus auf BODY.
    // Stattdessen zurück auf den Auslöser im Footer, ohne die Seite zu scrollen.
    if (focusInBanner) {
      document.querySelector<HTMLElement>("[data-consent-trigger]")?.focus({ preventScroll: true });
    }
  }

  async function choose(choice: "all" | "necessary") {
    // `aria-disabled` hält den Knopf im Tastaturfluss; den zweiten Klick fängt
    // der Laufzustand ab, nicht das Attribut.
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ choice }),
      }).catch(() => null);
      // Nur eine bestätigte Antwort hat den Cookie gesetzt: Eine 403-Antwort
      // oder ein Netzwerkfehler darf nicht als gespeichert gelten.
      if (!response?.ok) {
        setError(t.error);
        return;
      }
      close(t.saved);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Steht schon vor der Wahl im DOM, damit das Ergebnis angesagt wird. */}
      <LiveRegion message={announcement} />
      {visible ? (
        <div
          ref={dialogRef}
          tabIndex={-1}
          className="fixed inset-x-0 bottom-0 z-60 p-3 sm:p-5"
          role="dialog"
          aria-modal="false"
          aria-labelledby="consent-title"
          aria-describedby="consent-text"
        >
          <div className="glass-card mx-auto flex max-w-3xl flex-col gap-4 p-4 shadow-2xl sm:flex-row sm:items-start sm:p-5">
            <span className="hidden size-10 shrink-0 place-items-center rounded-full border border-cyan/30 bg-cyan/10 text-cyan sm:grid">
              <Icon name="shield" size={19} />
            </span>
            <div className="flex-1">
              <p id="consent-title" className="text-sm font-semibold text-fg">
                {t.title}
              </p>
              <p id="consent-text" className="mt-1 text-[0.82rem] leading-relaxed text-muted">
                {t.text}
              </p>
              <Link href="/privacy#cookies" className="link mt-2 inline-block text-xs">
                {t.details}
              </Link>
              {error ? (
                <p
                  role="alert"
                  className="mt-2 rounded-lg border border-rose-500/25 bg-rose-500/8 px-3 py-2 text-xs leading-relaxed text-rose-200"
                >
                  {error}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:w-44">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void choose("all")}
                aria-disabled={saving || undefined}
              >
                {t.accept}
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => void choose("necessary")}
                aria-disabled={saving || undefined}
              >
                {t.reject}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
