"use client";

export function CookieSettingsButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("sh:open-consent"))}
      className="text-start transition hover:text-fg"
    >
      {label}
    </button>
  );
}
