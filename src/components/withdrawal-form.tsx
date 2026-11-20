"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { focusSoon } from "./focus-soon";
import { Icon } from "./icons";

const FIELD_IDS: Record<string, string> = {
  name: "withdrawal-name",
  email: "withdrawal-email",
  contract: "withdrawal-contract",
  privacyAccepted: "withdrawal-privacy",
};

export function WithdrawalForm({
  locale,
  privacyLabel,
}: {
  locale: string;
  privacyLabel: string;
}) {
  const de = locale !== "en";
  const router = useRouter();
  const renderedAt = useRef(Date.now());
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrorMessage(null);
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);
    const payload = {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      contract: String(formData.get("contract") ?? "web"),
      note: String(formData.get("note") ?? ""),
      privacyAccepted: formData.get("privacyAccepted") === "on",
      website: String(formData.get("website") ?? ""),
      renderedAt: renderedAt.current,
    };

    try {
      const response = await fetch("/api/withdrawal", {
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
        router.push(`/widerruf/bestaetigung?ref=${encodeURIComponent(data.reference)}`);
        return;
      }
      if (data.error?.fields?.length) {
        setFieldErrors(Object.fromEntries(data.error.fields.map((f) => [f.path, f.message])));
        focusSoon(FIELD_IDS[data.error.fields[0]?.path ?? ""] ?? "withdrawal-error");
      }
      setErrorMessage(
        data.error?.message ??
          (de ? "Der Widerruf konnte nicht übermittelt werden." : "The withdrawal could not be submitted."),
      );
    } catch {
      setErrorMessage(
        de
          ? "Der Widerruf konnte nicht übermittelt werden. Bitte versuche es erneut oder schreibe eine E-Mail."
          : "The withdrawal could not be submitted. Please try again or send an email.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="card grid gap-4 p-6" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="withdrawal-name" className="field-label">
            {de ? "Name" : "Name"}
          </label>
          <input
            id="withdrawal-name"
            name="name"
            required
            maxLength={80}
            autoComplete="name"
            className="field"
            aria-invalid={Boolean(fieldErrors.name)}
          />
          {fieldErrors.name ? <p className="mt-1 text-xs text-rose-300">{fieldErrors.name}</p> : null}
        </div>
        <div>
          <label htmlFor="withdrawal-email" className="field-label">
            {de ? "E-Mail-Adresse des Vertrags" : "Email address of the contract"}
          </label>
          <input
            id="withdrawal-email"
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            className="field"
            aria-invalid={Boolean(fieldErrors.email)}
          />
          {fieldErrors.email ? <p className="mt-1 text-xs text-rose-300">{fieldErrors.email}</p> : null}
        </div>
      </div>

      <div>
        <label htmlFor="withdrawal-contract" className="field-label">
          {de ? "Welcher Vertrag?" : "Which contract?"}
        </label>
        <select id="withdrawal-contract" name="contract" className="field" defaultValue="web">
          <option value="web">{de ? "Premium-Abo über die Website" : "Premium subscription via the website"}</option>
          <option value="apple">{de ? "Abo über den App Store" : "Subscription via the App Store"}</option>
          <option value="amazon">{de ? "Abo über den Amazon Appstore" : "Subscription via the Amazon Appstore"}</option>
          <option value="other">{de ? "Sonstiger Vertrag" : "Other contract"}</option>
        </select>
        {fieldErrors.contract ? <p className="mt-1 text-xs text-rose-300">{fieldErrors.contract}</p> : null}
      </div>

      <div>
        <label htmlFor="withdrawal-note" className="field-label">
          {de ? "Anmerkung (optional)" : "Note (optional)"}
        </label>
        <textarea
          id="withdrawal-note"
          name="note"
          rows={3}
          maxLength={1000}
          className="field"
          placeholder={de ? "z. B. Bestellnummer oder Gerät" : "e.g. order reference or device"}
        />
      </div>

      <div className="hidden" aria-hidden="true">
        <label htmlFor="withdrawal-website">Website</label>
        <input id="withdrawal-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <label className="flex items-start gap-2.5 text-xs leading-relaxed text-muted">
        <input
          id="withdrawal-privacy"
          type="checkbox"
          name="privacyAccepted"
          required
          className="mt-0.5 size-4 rounded border-line bg-ink accent-brand"
          aria-invalid={Boolean(fieldErrors.privacyAccepted)}
        />
        <span>
          {de ? "Ich habe die" : "I have read the"}{" "}
          <a href="/privacy" className="link">
            {privacyLabel}
          </a>{" "}
          {de ? "gelesen." : "."}
        </span>
      </label>
      {fieldErrors.privacyAccepted ? (
        <p className="mt-1 text-xs text-rose-300">{fieldErrors.privacyAccepted}</p>
      ) : null}

      {errorMessage ? (
        <p
          id="withdrawal-error"
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
            <Icon name="mail" size={16} />
          )}
          {pending
            ? de
              ? "Wird übermittelt…"
              : "Submitting…"
            : de
              ? "Verträge hier widerrufen"
              : "Withdraw contracts here"}
        </button>
        <p className="max-w-sm text-[0.7rem] leading-relaxed text-muted/80">
          {de
            ? "Mit dem Absenden widerrufst du den gewählten Vertrag. Du erhältst sofort eine Bestätigung."
            : "Submitting withdraws the selected contract. You will receive a confirmation immediately."}
        </p>
      </div>
    </form>
  );
}
