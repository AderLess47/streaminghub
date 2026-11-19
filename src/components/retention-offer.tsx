"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "./icons";
import { LiveMessage } from "./live-message";
import { useSubmitFocus } from "./use-submit-focus";

export function RetentionOffer({
  label,
  acceptedMessage,
  failedMessage,
}: {
  label: string;
  acceptedMessage: string;
  failedMessage: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const buttonRef = useSubmitFocus(pending);

  async function accept() {
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
        ref={buttonRef}
        type="button"
        onClick={() => void accept()}
        className="btn btn-primary btn-sm"
        disabled={pending}
      >
        {pending ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="check" size={14} />}
        {pending ? "…" : label}
      </button>
      <LiveMessage
        ok={message?.ok ?? false}
        message={message?.text ?? null}
        className={`mt-2 text-xs leading-relaxed ${message?.ok ? "text-emerald-300" : "text-rose-300"}`}
      />
    </div>
  );
}
