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
  describedBy,
  unavailableMessage,
  networkMessage,
  consent,
  onConsentBlocked,
}: {
  label: string;
  disabledLabel: string;
  configured: boolean;
  signedIn: boolean;
  /** Abrechnung des Abschlusses; Standard ist monatlich. */
  interval?: "month" | "year";
  /** Ansage während der Anfrage; der Knopf behält den Fokus. */
  busyLabel: string;
  /** ID der direkt darüberstehenden Gesamtbetrag-/Verlängerungszeile. */
  describedBy?: string;
  unavailableMessage?: string;
  networkMessage?: string;
  /**
   * Zustand der beiden Pflicht-Checkboxen. Fehlt der Wert (nicht angemeldet),
   * übernimmt der Server die Prüfung nach der Anmeldung.
   */
  consent?: { terms: boolean; withdrawal: boolean };
  onConsentBlocked?: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function start() {
    if (pending) return;
    setMessage(null);
    // Erst die Zustimmung, dann die Anfrage: ohne beide Häkchen entsteht keine
    // Zahlungspflicht (§ 312j Abs. 3, § 356 Abs. 5 BGB).
    if (consent && (!consent.terms || !consent.withdrawal)) {
      onConsentBlocked?.();
      return;
    }
    if (!signedIn) {
      window.location.href = "/login?next=/dashboard/subscription";
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          interval,
          acceptTerms: consent?.terms === true,
          acceptWithdrawalLoss: consent?.withdrawal === true,
        }),
      });
      const data = (await response.json()) as { url?: string; error?: { message?: string } };
      if (response.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setMessage(
        data.error?.message ?? unavailableMessage ?? "Der Checkout ist derzeit nicht verfügbar.",
      );
    } catch {
      setMessage(networkMessage ?? "Der Checkout ist derzeit nicht erreichbar.");
    } finally {
      setPending(false);
    }
  }

  const descriptionIds = [configured ? null : UNAVAILABLE_HINT_ID, describedBy]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <button
        type="button"
        onClick={() => void start()}
        className="btn btn-primary btn-block whitespace-normal"
        aria-disabled={pending || undefined}
        aria-describedby={descriptionIds || undefined}
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
