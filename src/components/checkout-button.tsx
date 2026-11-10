"use client";

import { useState } from "react";
import { Icon } from "./icons";

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
        type="button"
        onClick={() => void start()}
        className="btn btn-primary btn-block"
        disabled={pending}
        aria-disabled={!configured}
        title={configured ? undefined : disabledLabel}
      >
        {pending ? <Icon name="refresh" size={16} className="animate-spin" /> : <Icon name="card" size={16} />}
        {pending ? "…" : label}
      </button>
      {!configured ? (
        <p className="mt-2 text-center text-[0.7rem] leading-relaxed text-amber-300/80">{disabledLabel}</p>
      ) : null}
      {message ? (
        <p className="mt-2 text-center text-[0.72rem] leading-relaxed text-rose-300" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
