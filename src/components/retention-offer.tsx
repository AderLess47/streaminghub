"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormStatus } from "./form-status";
import { Icon } from "./icons";
import { LiveMessage } from "./live-message";

export function RetentionOffer({
  label,
  acceptedMessage,
  failedMessage,
  busyLabel,
}: {
  label: string;
  acceptedMessage: string;
  failedMessage: string;
  /** Ansage während der Anfrage; der Knopf behält den Fokus. */
  busyLabel: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function accept() {
    // `aria-disabled` hält den Knopf bedienbar; den Doppelklick fängt der
    // Zustand ab, nicht das Attribut.
    if (pending) return;
    setMessage(null);
    setPending(true);
    try {
      const response = await fetch("/api/subscription/retention", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "accept" }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (response.ok) {
        setMessage({ ok: true, text: acceptedMessage });
        // Preis und Status stehen serverseitig gerendert auf der Seite.
        router.refresh();
        return;
      }
      setMessage({ ok: false, text: data?.error?.message ?? failedMessage });
    } catch {
      setMessage({ ok: false, text: failedMessage });
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void accept()}
        className="btn btn-primary btn-sm"
        aria-disabled={pending || undefined}
      >
        {pending ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="check" size={14} />}
        {label}
      </button>
      <FormStatus pending={pending} label={busyLabel} />
      <LiveMessage
        ok={message?.ok ?? false}
        message={message?.text ?? null}
        className={`mt-2 text-xs leading-relaxed ${message?.ok ? "text-emerald-300" : "text-rose-300"}`}
      />
    </div>
  );
}
