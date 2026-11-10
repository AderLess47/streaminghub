"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/actions/dashboard";
import type { Dictionary } from "@/i18n/de";
import { localeMeta, locales, type Locale } from "@/i18n/config";
import { Icon } from "./icons";

type Action = (prevState: ActionState, formData: FormData) => Promise<ActionState>;

function Feedback({ state }: { state: ActionState }) {
  if (!state?.message) return null;
  return (
    <p
      className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${
        state.ok
          ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-200"
          : "border-rose-500/25 bg-rose-500/8 text-rose-200"
      }`}
      role="status"
    >
      {state.message}
    </p>
  );
}

export function NewTicketForm({ action, t }: { action: Action; t: Dictionary["dashboard"]["support"] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);
  const categories = Object.entries(t.categories) as [string, string][];

  return (
    <form action={formAction} className="grid gap-3">
      <div>
        <label htmlFor="ticket-subject" className="field-label">
          {t.subject}
        </label>
        <input id="ticket-subject" name="subject" required minLength={3} maxLength={120} className="field" />
      </div>
      <div>
        <label htmlFor="ticket-category" className="field-label">
          {t.category}
        </label>
        <select id="ticket-category" name="category" className="field" defaultValue="other">
          {categories.map(([value, label]) => (
            <option key={value} value={value} className="bg-ink">
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="ticket-message" className="field-label">
          {t.message}
        </label>
        <textarea id="ticket-message" name="message" required minLength={20} maxLength={5000} rows={5} className="field" />
      </div>
      <Feedback state={state} />
      <button type="submit" className="btn btn-primary btn-sm justify-self-start" disabled={pending}>
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
  labels: { title: string; cta: string; placeholder: string };
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);

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
      />
      <Feedback state={state} />
      <button type="submit" className="btn btn-outline btn-sm justify-self-start" disabled={pending}>
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
        />
      </div>
      <div>
        <label htmlFor="profile-email" className="field-label">
          {t.emailLabel}
        </label>
        <input id="profile-email" value={user.email} readOnly disabled className="field" />
        <p className="mt-1 text-[0.68rem] text-muted">{t.emailNote}</p>
      </div>
      <div>
        <label htmlFor="profile-locale" className="field-label">
          {t.languageLabel}
        </label>
        <select id="profile-locale" name="locale" defaultValue={user.locale} className="field">
          {locales.map((code) => (
            <option key={code} value={code} className="bg-ink">
              {localeMeta[code].label}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-start gap-2 text-xs text-muted">
        <input
          type="checkbox"
          name="marketingOptIn"
          defaultChecked={user.marketingOptIn}
          className="mt-0.5 size-4 accent-brand"
        />
        {t.marketingLabel}
      </label>
      <Feedback state={state} />
      <button type="submit" className="btn btn-primary btn-sm justify-self-start" disabled={pending}>
        {pending ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="check" size={14} />}
        {t.save}
      </button>
    </form>
  );
}

export function PasswordForm({ action, t }: { action: Action; t: Dictionary["dashboard"]["settings"] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);

  return (
    <form action={formAction} className="grid gap-3">
      <div>
        <label htmlFor="current-password" className="field-label">
          {t.currentPassword}
        </label>
        <input id="current-password" name="currentPassword" type="password" required autoComplete="current-password" className="field" />
      </div>
      <div>
        <label htmlFor="new-password" className="field-label">
          {t.newPassword}
        </label>
        <input id="new-password" name="newPassword" type="password" required minLength={10} autoComplete="new-password" className="field" />
      </div>
      <Feedback state={state} />
      <button type="submit" className="btn btn-outline btn-sm justify-self-start" disabled={pending}>
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
        />
      </div>
      <label className="flex items-start gap-2 text-xs text-muted">
        <input type="checkbox" name="confirm" required className="mt-0.5 size-4 accent-brand" />
        {confirmText}
      </label>
      <Feedback state={state} />
      <button
        type="submit"
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
  return (
    <form action={formAction} className="grid gap-3">
      <Feedback state={state} />
      <button type="submit" className="btn btn-outline btn-sm justify-self-start" disabled={pending}>
        <Icon name={pending ? "refresh" : "logout"} size={14} className={pending ? "animate-spin" : ""} />
        {t.logoutOthers}
      </button>
    </form>
  );
}
