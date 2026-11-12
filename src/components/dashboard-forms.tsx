"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/actions/dashboard";
import type { Dictionary } from "@/i18n/de";
import { localeMeta, locales, type Locale } from "@/i18n/config";
import { FormStatus } from "./form-status";
import { Icon } from "./icons";
import { LiveMessage } from "./live-message";
import { useSubmitFocus } from "./use-submit-focus";

type Action = (prevState: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Erfolg und Fehler landen in dauerhaft vorhandenen Live-Regionen (siehe
 * LiveMessage) – ein erst mit seinem Text eingefügtes role="status" wird von
 * Screenreadern oft nicht angesagt.
 */
function Feedback({ state }: { state: ActionState }) {
  const ok = Boolean(state?.ok);
  return (
    <LiveMessage
      ok={ok}
      message={state?.message}
      className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${
        ok ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-200" : "border-rose-500/25 bg-rose-500/8 text-rose-200"
      }`}
    />
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-xs text-rose-300">
      {message}
    </p>
  );
}

export function NewTicketForm({ action, t }: { action: Action; t: Dictionary["dashboard"]["support"] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);
  const submitRef = useSubmitFocus(pending);
  const fieldErrors = state?.fieldErrors ?? {};
  const categories = Object.entries(t.categories) as [string, string][];

  return (
    <form action={formAction} className="grid gap-3">
      <div>
        <label htmlFor="ticket-subject" className="field-label">
          {t.subject}
        </label>
        <input
          id="ticket-subject"
          name="subject"
          required
          minLength={3}
          maxLength={120}
          className="field"
          aria-invalid={Boolean(fieldErrors.subject)}
          aria-describedby={fieldErrors.subject ? "ticket-subject-error" : undefined}
        />
        <FieldError id="ticket-subject-error" message={fieldErrors.subject} />
      </div>
      <div>
        <label htmlFor="ticket-category" className="field-label">
          {t.category}
        </label>
        <select
          id="ticket-category"
          name="category"
          className="field"
          defaultValue="other"
          aria-invalid={Boolean(fieldErrors.category)}
          aria-describedby={fieldErrors.category ? "ticket-category-error" : undefined}
        >
          {categories.map(([value, label]) => (
            <option key={value} value={value} className="bg-ink">
              {label}
            </option>
          ))}
        </select>
        <FieldError id="ticket-category-error" message={fieldErrors.category} />
      </div>
      <div>
        <label htmlFor="ticket-message" className="field-label">
          {t.message}
        </label>
        <textarea
          id="ticket-message"
          name="message"
          required
          minLength={20}
          maxLength={5000}
          rows={5}
          className="field"
          aria-invalid={Boolean(fieldErrors.message)}
          aria-describedby={fieldErrors.message ? "ticket-message-error" : undefined}
        />
        <FieldError id="ticket-message-error" message={fieldErrors.message} />
      </div>
      <Feedback state={state} />
      <FormStatus pending={pending} label={t.sending} />
      <button type="submit" ref={submitRef} className="btn btn-primary btn-sm justify-self-start" disabled={pending}>
        {pending ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="mail" size={14} />}
        {t.submit}
      </button>
    </form>
  );
}

export function ReplyForm({
  action,
  ticketId,
  labels,
}: {
  action: Action;
  ticketId: string;
  labels: { title: string; cta: string; placeholder: string; busy: string };
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);
  const submitRef = useSubmitFocus(pending);

  return (
    <form action={formAction} className="mt-4 grid gap-3">
      <input type="hidden" name="ticketId" value={ticketId} />
      <label htmlFor={`reply-${ticketId}`} className="field-label">
        {labels.title}
      </label>
      <textarea
        id={`reply-${ticketId}`}
        name="body"
        rows={3}
        required
        maxLength={4000}
        placeholder={labels.placeholder}
        className="field"
        aria-invalid={Boolean(state?.fieldErrors?.body)}
        aria-describedby={state?.fieldErrors?.body ? `reply-${ticketId}-error` : undefined}
      />
      <FieldError id={`reply-${ticketId}-error`} message={state?.fieldErrors?.body} />
      <Feedback state={state} />
      <FormStatus pending={pending} label={labels.busy} />
      <button type="submit" ref={submitRef} className="btn btn-outline btn-sm justify-self-start" disabled={pending}>
        {pending ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="arrow-right" size={14} />}
        {labels.cta}
      </button>
    </form>
  );
}

export function ProfileForm({
  action,
  user,
  t,
}: {
  action: Action;
  user: { displayName: string; locale: Locale; marketingOptIn: boolean; email: string };
  t: Dictionary["dashboard"]["settings"];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);
  const submitRef = useSubmitFocus(pending);
  const fieldErrors = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="grid gap-3">
      <div>
        <label htmlFor="profile-name" className="field-label">
          {t.displayName}
        </label>
        <input
          id="profile-name"
          name="displayName"
          defaultValue={user.displayName}
          required
          minLength={2}
          maxLength={80}
          className="field"
          aria-invalid={Boolean(fieldErrors.displayName)}
          aria-describedby={fieldErrors.displayName ? "profile-name-error" : undefined}
        />
        <FieldError id="profile-name-error" message={fieldErrors.displayName} />
      </div>
      <div>
        <label htmlFor="profile-email" className="field-label">
          {t.emailLabel}
        </label>
        <input
          id="profile-email"
          value={user.email}
          readOnly
          className="field"
          aria-describedby="profile-email-note"
        />
        <p id="profile-email-note" className="mt-1 text-[0.68rem] text-muted">
          {t.emailNote}
        </p>
      </div>
      <div>
        <label htmlFor="profile-locale" className="field-label">
          {t.languageLabel}
        </label>
        <select
          id="profile-locale"
          name="locale"
          defaultValue={user.locale}
          className="field"
          aria-invalid={Boolean(fieldErrors.locale)}
          aria-describedby={fieldErrors.locale ? "profile-locale-error" : undefined}
        >
          {locales.map((code) => (
            <option key={code} value={code} className="bg-ink">
              {localeMeta[code].label}
            </option>
          ))}
        </select>
        <FieldError id="profile-locale-error" message={fieldErrors.locale} />
      </div>
      <label className="flex min-h-11 items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          name="marketingOptIn"
          defaultChecked={user.marketingOptIn}
          className="mt-0.5 size-4 accent-brand"
        />
        {t.marketingLabel}
      </label>
      <Feedback state={state} />
      <FormStatus pending={pending} label={t.saving} />
      <button type="submit" ref={submitRef} className="btn btn-primary btn-sm justify-self-start" disabled={pending}>
        {pending ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="check" size={14} />}
        {t.save}
      </button>
    </form>
  );
}

export function PasswordForm({ action, t }: { action: Action; t: Dictionary["dashboard"]["settings"] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);
  const submitRef = useSubmitFocus(pending);
  const fieldErrors = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="grid gap-3">
      <div>
        <label htmlFor="current-password" className="field-label">
          {t.currentPassword}
        </label>
        <input
          id="current-password"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className="field"
          aria-invalid={Boolean(fieldErrors.currentPassword)}
          aria-describedby={fieldErrors.currentPassword ? "current-password-error" : undefined}
        />
        <FieldError id="current-password-error" message={fieldErrors.currentPassword} />
      </div>
      <div>
        <label htmlFor="new-password" className="field-label">
          {t.newPassword}
        </label>
        <input
          id="new-password"
          name="newPassword"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          className="field"
          aria-invalid={Boolean(fieldErrors.newPassword)}
          aria-describedby={`new-password-hint${fieldErrors.newPassword ? " new-password-error" : ""}`}
        />
        <p id="new-password-hint" className="mt-1 text-[0.7rem] text-muted">
          {t.passwordHint}
        </p>
        <FieldError id="new-password-error" message={fieldErrors.newPassword} />
      </div>
      <Feedback state={state} />
      <FormStatus pending={pending} label={t.saving} />
      <button type="submit" ref={submitRef} className="btn btn-outline btn-sm justify-self-start" disabled={pending}>
        {pending ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="lock" size={14} />}
        {t.passwordTitle}
      </button>
    </form>
  );
}

export function DataRequestForm({
  action,
  t,
  kind,
  label,
  description,
  confirmText,
  danger = false,
}: {
  action: Action;
  t: Dictionary["dashboard"]["settings"];
  kind: "export" | "deletion";
  label: string;
  description: string;
  confirmText: string;
  danger?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);
  const submitRef = useSubmitFocus(pending);
  const fieldErrors = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="grid gap-3 rounded-xl border border-line/60 bg-white/2 p-4">
      <input type="hidden" name="kind" value={kind} />
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
      </div>
      <div>
        <label htmlFor={`confirm-${kind}`} className="field-label">
          {t.confirmPassword}
        </label>
        <input
          id={`confirm-${kind}`}
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="field"
          aria-invalid={Boolean(fieldErrors.password)}
          aria-describedby={fieldErrors.password ? `confirm-${kind}-error` : undefined}
        />
        <FieldError id={`confirm-${kind}-error`} message={fieldErrors.password} />
      </div>
      <label className="flex min-h-11 items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          name="confirm"
          required
          className="size-4 accent-brand"
          aria-invalid={Boolean(fieldErrors.confirm)}
          aria-describedby={fieldErrors.confirm ? `confirm-${kind}-check-error` : undefined}
        />
        {confirmText}
      </label>
      <FieldError id={`confirm-${kind}-check-error`} message={fieldErrors.confirm} />
      <Feedback state={state} />
      <FormStatus pending={pending} label={t.saving} />
      <button
        type="submit"
        ref={submitRef}
        className={`btn btn-sm justify-self-start ${danger ? "btn-danger" : "btn-outline"}`}
        disabled={pending}
      >
        {pending ? <Icon name="refresh" size={14} className="animate-spin" /> : danger ? <Icon name="trash" size={14} /> : <Icon name="download" size={14} />}
        {label}
      </button>
    </form>
  );
}

export function SessionsForm({
  action,
  t,
}: {
  action: Action;
  t: Dictionary["dashboard"]["settings"];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);
  const submitRef = useSubmitFocus(pending);
  return (
    <form action={formAction} className="grid gap-3">
      <Feedback state={state} />
      <FormStatus pending={pending} label={t.saving} />
      <button type="submit" ref={submitRef} className="btn btn-outline btn-sm justify-self-start" disabled={pending}>
        <Icon name={pending ? "refresh" : "logout"} size={14} className={pending ? "animate-spin" : ""} />
        {t.logoutOthers}
      </button>
    </form>
  );
}
