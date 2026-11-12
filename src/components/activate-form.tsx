"use client";

import Link from "next/link";
import { useState } from "react";
import { FormStatus } from "./form-status";
import { Icon } from "./icons";
import { LiveMessage } from "./live-message";

type Result = { ok: boolean; message: string; deviceName?: string } | null;

export function ActivateForm({
  signedIn,
  labels,
}: {
  signedIn: boolean;
  labels: {
    code: string;
    codePlaceholder: string;
    device: string;
    devicePlaceholder: string;
    submit: string;
    invalid: string;
    tooMany: string;
    successTitle: string;
    successBody: string;
    loginRequired: string;
    toLogin: string;
    toDashboard: string;
    securityNote: string;
    busy: string;
  };
}) {
  const [code, setCode] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setPending(true);
    try {
      const response = await fetch("/api/devices/activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, deviceName: deviceName || undefined }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        device?: { name: string };
        error?: { code?: string; message?: string };
      };
      if (response.ok && data.ok) {
        setResult({
          ok: true,
          message: labels.successBody,
          deviceName: data.device?.name,
        });
        setCode("");
      } else {
        setError(
          data.error?.code === "rate_limited"
            ? labels.tooMany
            : (data.error?.message ?? labels.invalid),
        );
      }
    } catch {
      setError(labels.invalid);
    } finally {
      setPending(false);
    }
  }

  if (!signedIn) {
    return (
      <div className="card p-6">
        <Icon name="lock" size={22} className="text-cyan" />
        <p className="mt-3 text-sm text-muted">{labels.loginRequired}</p>
        <Link href="/login?next=/activate" className="btn btn-primary mt-4">
          {labels.toLogin}
          <Icon name="arrow-right" size={15} />
        </Link>
      </div>
    );
  }

  return (
    <div className="card p-6">
      {result?.ok ? (
        <div className="text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
            <Icon name="check" size={22} />
          </span>
          <h2 className="mt-3 text-lg font-semibold">{labels.successTitle}</h2>
          <p className="mt-1 text-sm text-muted">{labels.successBody}</p>
          {result.deviceName ? (
            <p className="mt-2 text-xs text-muted/80">{result.deviceName}</p>
          ) : null}
          <Link href="/dashboard" className="btn btn-primary mt-5">
            {labels.toDashboard}
            <Icon name="arrow-right" size={15} />
          </Link>
        </div>
      ) : (
        <form aria-busy={pending} onSubmit={submit} className="grid gap-4">
          <div>
            <label htmlFor="pairing-code" className="field-label">
              {labels.code}
            </label>
            <input
              id="pairing-code"
              name="code"
              value={code}
              onChange={(event) => {
                const raw = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
                setCode(raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw);
              }}
              placeholder={labels.codePlaceholder}
              autoComplete="one-time-code"
              inputMode="text"
              spellCheck={false}
              required
              minLength={8}
              maxLength={9}
              className="field text-center font-mono text-lg tracking-[0.3em]"
              aria-describedby="pairing-hint"
            />
            <p id="pairing-hint" className="mt-2 text-[0.7rem] text-muted">
              {labels.securityNote}
            </p>
          </div>

          <div>
            <label htmlFor="device-name" className="field-label">
              {labels.device}
            </label>
            <input
              id="device-name"
              name="deviceName"
              value={deviceName}
              onChange={(event) => setDeviceName(event.target.value)}
              placeholder={labels.devicePlaceholder}
              maxLength={60}
              className="field"
            />
          </div>

          <LiveMessage
            ok={false}
            message={error}
            className="rounded-lg border border-rose-500/25 bg-rose-500/8 px-3 py-2 text-xs text-rose-200"
          />

          <FormStatus pending={pending} label={labels.busy} />
          <button type="submit" className="btn btn-primary" disabled={pending || code.length < 8}>
            {pending ? <Icon name="refresh" size={16} className="animate-spin" /> : <Icon name="key" size={16} />}
            {labels.submit}
          </button>
        </form>
      )}
    </div>
  );
}
