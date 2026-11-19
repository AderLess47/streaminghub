"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "./icons";
import { LiveMessage } from "./live-message";
import { useSubmitFocus } from "./use-submit-focus";

/**
 * Startet den Testzeitraum über die vorhandene API. Die Entscheidung fällt
 * serverseitig (Missbrauchsschutz, Flag); die Oberfläche zeigt nur das
 * Ergebnis. Nach Erfolg wird die Seite neu geladen, damit Status und
 * Gerätelimit aus der Datenbank stammen.
 */
export function StartTrialButton({
  label,
  startedLabel,
  failedLabel,
}: {
  label: string;
  startedLabel: string;
  failedLabel: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const buttonRef = useSubmitFocus(pending);

  async function start() {
    setMessage(null);
    setPending(true);
    try {
      const response = await fetch("/api/subscription/trial", { method: "POST" });
      const data = (await response.json().catch(() => null)) as {
        trialEndsAt?: string;
        error?: { message?: string };
      } | null;
      if (response.ok) {
        const end = data?.trialEndsAt ? new Date(data.trialEndsAt) : null;
        const date =
          end && Number.isFinite(end.getTime())
            ? new Intl.DateTimeFormat("de-DE", { dateStyle: "long" }).format(end)
            : null;
        setMessage({ ok: true, text: date ? `${startedLabel} ${date}` : startedLabel });
        router.refresh();
        return;
      }
      setMessage({ ok: false, text: data?.error?.message ?? failedLabel });
    } catch {
      setMessage({ ok: false, text: failedLabel });
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
        className="btn btn-outline btn-sm btn-block"
        disabled={pending}
      >
        {pending ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="sparkles" size={14} />}
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
