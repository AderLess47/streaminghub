"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { focusSoon } from "./focus-soon";
import { Icon } from "./icons";

export function CancellationForm({ locale }: { locale: string }) {
  const de = locale !== "en";
  const router = useRouter();
  const renderedAt = useRef(Date.now());
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrorMessage(null);
    setFieldError(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      email: String(formData.get("email") ?? ""),
      website: String(formData.get("website") ?? ""),
      renderedAt: renderedAt.current,
    };

    try {
      const response = await fetch("/api/cancellation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        reference?: string;
        error?: { message?: string; fields?: { path: string; message: string }[] };
      };
      if (response.ok && data.ok && data.reference) {
        router.push(`/kuendigung/bestaetigung?ref=${encodeURIComponent(data.reference)}`);
        return;
      }
      const message = data.error?.message;
      if (data.error?.fields?.length) {
        setFieldError(data.error.fields[0].message);
        focusSoon("cancellation-email");
      }
      setErrorMessage(
        message ??
          (de ? "Die Kündigung konnte nicht übermittelt werden." : "The cancellation could not be submitted."),
      );
    } catch {
      setErrorMessage(
        de
          ? "Die Kündigung konnte nicht übermittelt werden. Bitte versuche es erneut."
          : "The cancellation could not be submitted. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="card grid gap-4 p-6" noValidate>
      <div>
        <label htmlFor="cancellation-email" className="field-label">
          {de ? "E-Mail-Adresse deines Kontos" : "Email address of your account"}
        </label>
        <input
          id="cancellation-email"
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          className="field"
          aria-invalid={Boolean(fieldError)}
          aria-describedby={fieldError ? "cancellation-email-error" : undefined}
        />
        {fieldError ? (
          <p id="cancellation-email-error" className="mt-1 text-xs text-rose-300">
            {fieldError}
          </p>
        ) : null}
      </div>

      <div className="hidden" aria-hidden="true">
        <label htmlFor="cancellation-website">Website</label>
        <input id="cancellation-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {errorMessage ? (
        <p
          id="cancellation-error"
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-rose-500/25 bg-rose-500/8 px-3 py-2 text-xs text-rose-200"
        >
          {errorMessage}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? (
            <Icon name="refresh" size={16} className="animate-spin" />
          ) : (
            <Icon name="close" size={16} />
          )}
          {pending ? (de ? "Wird gekündigt…" : "Cancelling…") : de ? "Jetzt kündigen" : "Cancel now"}
        </button>
        <p className="max-w-sm text-[0.7rem] leading-relaxed text-muted/80">
          {de
            ? "Der Klick ist die Kündigung. Du erhältst sofort eine Bestätigung mit Datum und Wirkung."
            : "The click is the cancellation. You receive a confirmation with date and effect immediately."}
        </p>
      </div>
    </form>
  );
}
