"use client";

import { useState } from "react";
import { Icon } from "./icons";
import { LiveMessage } from "./live-message";
import { useSubmitFocus } from "./use-submit-focus";

const UNAVAILABLE_HINT_ID = "checkout-unavailable-hint";

export function CheckoutButton({
  label,
  disabledLabel,
  configured,
  signedIn,
}: {
  label: string;
  disabledLabel: string;
  configured: boolean;
  signedIn: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Während der Anfrage ist der Knopf deaktiviert und verliert den Fokus; der
  // Hook holt ihn nach der Antwort zurück (WCAG 2.4.3).
  const buttonRef = useSubmitFocus(pending);

  async function start() {
    setMessage(null);
    if (!signedIn) {
      window.location.href = "/login?next=/dashboard/subscription";
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/subscription/checkout", { method: "POST" });
      const data = (await response.json()) as { url?: string; error?: { message?: string } };
      if (response.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setMessage(data.error?.message ?? "Der Checkout ist derzeit nicht verfügbar.");
    } catch {
      setMessage("Der Checkout ist derzeit nicht erreichbar.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => void start()}
        className="btn btn-primary btn-block"
        disabled={pending}
        aria-describedby={configured ? undefined : UNAVAILABLE_HINT_ID}
      >
        {pending ? <Icon name="refresh" size={16} className="animate-spin" /> : <Icon name="card" size={16} />}
        {pending ? "…" : label}
      </button>
      {!configured ? (
        <p
          id={UNAVAILABLE_HINT_ID}
          className="mt-2 text-center text-[0.7rem] leading-relaxed text-amber-300/80"
        >
          {disabledLabel}
        </p>
      ) : null}
      <LiveMessage
        ok={false}
        message={message}
        className="mt-2 text-center text-[0.72rem] leading-relaxed text-rose-300"
      />
    </div>
  );
}
