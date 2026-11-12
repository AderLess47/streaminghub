"use client";

import { useActionState } from "react";
import { FormStatus } from "./form-status";
import { Icon } from "./icons";
import { useSubmitFocus } from "./use-submit-focus";

type ActionResult = { message: string; ok: boolean } | null;

export function CancelSubscriptionForm({
  action,
  label,
  busy,
}: {
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  label: string;
  busy: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, null);
  const submitRef = useSubmitFocus(pending);
  const message = state?.message;

  return (
    <form action={formAction} className="mt-4">
      <FormStatus pending={pending} label={busy} />
      <button type="submit" ref={submitRef} className="btn btn-danger btn-sm" disabled={pending}>
        {pending ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="close" size={14} />}
        {label}
      </button>
      {/* Dauerhafte Live-Regionen: eingefügter Text wird angesagt, ein erst
          mit Text erzeugtes role="status" oft nicht. */}
      <div aria-live="polite" aria-atomic="true">
        {message && state?.ok ? (
          <p className="mt-2 text-xs leading-relaxed text-emerald-300">{message}</p>
        ) : null}
      </div>
      <div aria-live="assertive" aria-atomic="true">
        {message && !state?.ok ? (
          <p className="mt-2 text-xs leading-relaxed text-rose-300">{message}</p>
        ) : null}
      </div>
    </form>
  );
}
