"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "./icons";

export function AdminMfaForm({
  labels,
}: {
  labels: { title: string; hint: string; cta: string; error: string };
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await response.json()) as { ok?: boolean; redirectTo?: string; error?: { message?: string } };
      if (response.ok) {
        router.push(data.redirectTo ?? "/admin");
        router.refresh();
        return;
      }
      setError(data.error?.message ?? labels.error);
    } catch {
      setError(labels.error);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="flex items-start gap-2 rounded-xl border border-line/60 bg-white/3 px-3 py-2.5">
        <Icon name="shield" size={16} className="mt-0.5 text-cyan" />
        <div>
          <p className="text-sm font-medium">{labels.title}</p>
          <p className="text-xs text-muted">{labels.hint}</p>
        </div>
      </div>
      <input
        value={code}
        onChange={(event) => setCode(event.target.value)}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={20}
        required
        aria-label={labels.title}
        className="field text-center font-mono text-lg tracking-[0.3em]"
      />
      {error ? (
        <p className="rounded-lg border border-rose-500/25 bg-rose-500/8 px-3 py-2 text-xs text-rose-200" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? <Icon name="refresh" size={15} className="animate-spin" /> : <Icon name="check" size={15} />}
        {labels.cta}
      </button>
    </form>
  );
}
