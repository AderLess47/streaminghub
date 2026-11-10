"use client";

import { useState } from "react";
import { Icon } from "./icons";

export function ResendVerification({
  label,
  hint,
}: {
  label: string;
  hint: string;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | undefined>();

  async function resend() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/resend-verification", { method: "POST" });
      const data = (await response.json()) as { ok?: boolean; devLink?: string; error?: { message?: string } };
      if (response.ok) {
        setMessage("Bestätigungs-E-Mail wurde erneut erzeugt.");
        setDevLink(data.devLink);
      } else {
        setMessage(data.error?.message ?? "Bitte versuche es später erneut.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={() => void resend()} className="btn btn-outline btn-sm" disabled={pending}>
        {pending ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="mail" size={14} />}
        {label}
      </button>
      {message ? <p className="mt-1.5 text-[0.7rem] text-emerald-300">{message}</p> : null}
      {devLink ? (
        <p className="mt-1 break-all text-[0.65rem] text-cyan-200/80">
          {hint} <a className="underline" href={devLink}>{devLink}</a>
        </p>
      ) : null}
    </div>
  );
}
