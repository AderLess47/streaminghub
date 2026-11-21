"use client";

import { useState } from "react";
import { FormStatus } from "./form-status";
import { Icon } from "./icons";
import { LiveMessage } from "./live-message";

const UNAVAILABLE_HINT_ID = "checkout-unavailable-hint";

export function CheckoutButton({
  label,
  disabledLabel,
  configured,
  signedIn,
  interval = "month",
  busyLabel,
}: {
  label: string;
  disabledLabel: string;
  configured: boolean;
  signedIn: boolean;
  /** Abrechnung des Abschlusses; Standard ist monatlich. */
  interval?: "month" | "year";
  /** Ansage während der Anfrage; der Knopf behält den Fokus. */
  busyLabel: string;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function start() {
    if (pending) return;
    setMessage(null);
    if (!signedIn) {
      window.location.href = "/login?next=/dashboard/subscription";
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ interval }),
      });
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
        type="button"
        onClick={() => void start()}
        className="btn btn-primary btn-block"
        aria-disabled={pending || undefined}
        aria-describedby={configured ? undefined : UNAVAILABLE_HINT_ID}
      >
        {pending ? <Icon name="refresh" size={16} className="animate-spin" /> : <Icon name="card" size={16} />}
        {label}
      </button>
      <FormStatus pending={pending} label={busyLabel} />
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
