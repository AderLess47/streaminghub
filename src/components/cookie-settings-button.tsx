"use client";

export function CookieSettingsButton({ label }: { label: string }) {
  // `data-consent-trigger` ist das Fokusziel, wenn der Banner ohne Auslöser erschien.
  return (
    <button
      type="button"
      data-consent-trigger=""
      onClick={() => window.dispatchEvent(new CustomEvent("sh:open-consent"))}
      className="inline-flex min-h-11 items-center text-start transition hover:text-fg"
    >
      {label}
    </button>
  );
}
