"use client";

import { useRef, useState } from "react";
import type { Dictionary } from "@/i18n/de";
import { Icon } from "./icons";

export function ContactForm({ t, privacyLabel }: { t: Dictionary["contact"]; privacyLabel: string }) {
  const renderedAt = useRef(Date.now());
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setState("idle");
    setErrorMessage(null);
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);
    const payload = {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      subject: String(formData.get("subject") ?? ""),
      message: String(formData.get("message") ?? ""),
      privacyAccepted: formData.get("privacyAccepted") === "on",
      website: String(formData.get("website") ?? ""),
      renderedAt: renderedAt.current,
    };

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: { message?: string; fields?: { path: string; message: string }[] };
      };
      if (response.ok && data.ok) {
        setState("success");
        event.currentTarget.reset();
        return;
      }
      if (data.error?.fields?.length) {
        setFieldErrors(Object.fromEntries(data.error.fields.map((f) => [f.path, f.message])));
      }
      setErrorMessage(data.error?.message ?? t.error);
      setState("error");
    } catch {
      setErrorMessage(t.error);
      setState("error");
    } finally {
      setPending(false);
    }
  }

  if (state === "success") {
    return (
      <div className="card p-6 text-center" role="status">
        <span className="mx-auto grid size-12 place-items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
          <Icon name="check" size={22} />
        </span>
        <h2 className="mt-3 text-lg font-semibold">{t.formTitle}</h2>
        <p className="mt-1.5 text-sm text-muted">{t.success}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card grid gap-4 p-6" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-name" className="field-label">
            {t.nameLabel}
          </label>
          <input
            id="contact-name"
            name="name"
            required
            maxLength={80}
            autoComplete="name"
            className="field"
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? "contact-name-error" : undefined}
          />
          {fieldErrors.name ? (
            <p id="contact-name-error" className="mt-1 text-xs text-rose-300">
              {fieldErrors.name}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor="contact-email" className="field-label">
            {t.emailLabel}
          </label>
          <input
            id="contact-email"
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
        <label htmlFor="contact-subject" className="field-label">
          {t.subjectLabel}
        </label>
        <input
          id="contact-subject"
          name="subject"
          required
          maxLength={120}
          placeholder={t.subjectPlaceholder}
          className="field"
        />
        {fieldErrors.subject ? <p className="mt-1 text-xs text-rose-300">{fieldErrors.subject}</p> : null}
      </div>

      <div>
        <label htmlFor="contact-message" className="field-label">
          {t.messageLabel}
        </label>
        <textarea
          id="contact-message"
          name="message"
          required
          minLength={20}
          maxLength={4000}
          rows={6}
          placeholder={t.messagePlaceholder}
          className="field"
        />
        {fieldErrors.message ? <p className="mt-1 text-xs text-rose-300">{fieldErrors.message}</p> : null}
      </div>

      {/* Honeypot – hidden from users and assistive technology */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="contact-website">Website</label>
        <input id="contact-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <label className="flex items-start gap-2.5 text-xs leading-relaxed text-muted">
        <input
          type="checkbox"
          name="privacyAccepted"
          required
          className="mt-0.5 size-4 rounded border-line bg-ink accent-brand"
          aria-invalid={Boolean(fieldErrors.privacyAccepted)}
        />
        <span>
          {t.privacyLabel}{" "}
          <a href="/privacy" className="link">
            {privacyLabel}
          </a>
        </span>
      </label>

      {state === "error" ? (
        <p className="rounded-lg border border-rose-500/25 bg-rose-500/8 px-3 py-2 text-xs text-rose-200" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? <Icon name="refresh" size={16} className="animate-spin" /> : <Icon name="mail" size={16} />}
          {pending ? t.sending : t.submit}
        </button>
        <p className="max-w-sm text-[0.7rem] leading-relaxed text-muted/80">{t.spamNotice}</p>
      </div>
    </form>
  );
}
