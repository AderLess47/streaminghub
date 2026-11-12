"use client";

import { useActionState } from "react";
import type { MfaState } from "@/lib/actions/admin";
import { FormStatus } from "./form-status";
import { Icon } from "./icons";

export function MfaSetupForm({
  action,
  labels,
}: {
  action: (prevState: MfaState, formData: FormData) => Promise<MfaState>;
  labels: { code: string; cta: string; busy: string };
}) {
  const [state, formAction, pending] = useActionState<MfaState, FormData>(action, null);

  return (
    <div>
      <form action={formAction} className="grid gap-3">
        <div>
          <label htmlFor="mfa-setup-code" className="field-label">
            {labels.code}
          </label>
          <input
            id="mfa-setup-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            className="field text-center font-mono text-lg tracking-[0.3em]"
          />
        </div>
        {state?.message ? (
          <p className={`text-xs ${state.ok ? "text-emerald-300" : "text-rose-300"}`} role="status">
            {state.message}
          </p>
        ) : null}
        <FormStatus pending={pending} label={labels.busy} />
        <button type="submit" className="btn btn-primary btn-sm justify-self-start" disabled={pending}>
          {pending ? <Icon name="refresh" size={14} className="animate-spin" /> : <Icon name="shield" size={14} />}
          {labels.cta}
        </button>
      </form>

      {state?.recoveryCodes?.length ? (
        <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/8 p-4">
          <p className="text-xs font-semibold text-amber-100">
            Wiederherstellungscodes – jetzt sicher speichern:
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-[0.72rem] text-amber-100/90">
            {state.recoveryCodes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
          <p className="mt-2 text-[0.68rem] text-amber-200/80">
            Diese Codes werden nur einmal angezeigt. Jeder Code kann einmal verwendet werden.
          </p>
        </div>
      ) : null}
    </div>
  );
}
