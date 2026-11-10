"use client";

import { useActionState } from "react";
import { Icon } from "./icons";

type ActionResult = { message: string; ok: boolean } | null;

export function CancelSubscriptionForm({
  action,
  label,
}: {
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  label: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, null);

  return (
    <form action={formAction} className="mt-4">
      <button type="submit" className="btn btn-danger btn-sm" disabled={pending}>
        {pending ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="close" size={14} />}
        {label}
      </button>
      {state?.message ? (
        <p
          className={`mt-2 text-xs leading-relaxed ${state.ok ? "text-emerald-300" : "text-rose-300"}`}
          role="status"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
