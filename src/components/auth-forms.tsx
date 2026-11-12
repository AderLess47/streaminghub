"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Dictionary } from "@/i18n/de";
import type { Locale } from "@/i18n/config";
import { localeMeta, locales } from "@/i18n/config";
import { Icon } from "./icons";

type ApiResponse = {
  ok?: boolean;
  error?: { code?: string; message?: string; fields?: { path: string; message: string }[] };
  devLink?: string;
  mfaRequired?: boolean;
  redirectTo?: string;
};

function useAuthSubmit(onSuccess: (data: ApiResponse) => void) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(url: string, payload: unknown) {
    setPending(true);
    setError(null);
    setFields({});
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as ApiResponse;
      if (response.ok && data.ok !== false) {
        onSuccess(data);
        return data;
      }
      if (data.error?.fields?.length) {
        setFields(Object.fromEntries(data.error.fields.map((f) => [f.path, f.message])));
      }
      setError(data.error?.message ?? null);
      return data;
    } catch {
      setError("Netzwerkfehler. Bitte versuche es erneut.");
      return null;
    } finally {
      setPending(false);
    }
  }

  return { pending, error, fields, submit, setError };
}

function FieldError({ message, id }: { message?: string; id: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-xs text-rose-300">
      {message}
    </p>
  );
}

function DevLink({ url, hint }: { url?: string; hint: string }) {
  if (!url) return null;
  return (
    <div className="mt-3 rounded-lg border border-cyan/25 bg-cyan/6 px-3 py-2 text-[0.7rem] leading-relaxed text-cyan-100/90">
      {hint}{" "}
      <a href={url} className="break-all underline">
        {url}
      </a>
    </div>
  );
}

export function LoginForm({
  t,
  next,
  mfaEnrolled,
}: {
  t: Dictionary["auth"];
  next?: string;
  mfaEnrolled?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"credentials" | "mfa">("credentials");
  const [credentials, setCredentials] = useState({ email: "", password: "" });
  const [mfaCode, setMfaCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const { pending, error, fields, submit, setError } = useAuthSubmit((data) => {
    if (data.mfaRequired) {
      setStep("mfa");
      return;
    }
    startTransition(() => {
      router.push(data.redirectTo ?? next ?? "/dashboard");
      router.refresh();
    });
  });

  if (step === "mfa") {
    return (
      <form
        className="grid gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          await submit("/api/auth/mfa", { code: mfaCode });
        }}
      >
        <div className="flex items-center gap-2 rounded-xl border border-line/60 bg-white/3 px-3 py-2.5">
          <Icon name="shield" size={16} className="text-cyan" />
          <div>
            <p className="text-sm font-medium">{t.mfaTitle}</p>
            <p className="text-xs text-muted">{t.mfaSubtitle}</p>
          </div>
        </div>
        <div>
          <label htmlFor="mfa-code" className="field-label">
            {t.mfaTitle}
          </label>
          <input
            id="mfa-code"
            value={mfaCode}
            onChange={(event) => setMfaCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={20}
            required
            className="field text-center font-mono text-lg tracking-[0.3em]"
          />
        </div>
        {error ? (
          <p className="rounded-lg border border-rose-500/25 bg-rose-500/8 px-3 py-2 text-xs text-rose-200" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
          {pending ? <Icon name="refresh" size={15} className="animate-spin" /> : <Icon name="check" size={15} />}
          {t.mfaCta}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setStep("credentials");
            setError(null);
          }}
        >
          {t.loginCta}
        </button>
      </form>
    );
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const payload = {
          email: credentials.email,
          password: credentials.password,
          ...(mfaEnrolled && mfaCode ? { mfaCode } : {}),
        };
        await submit("/api/auth/login", payload);
      }}
    >
      <div>
        <label htmlFor="login-email" className="field-label">
          {t.emailLabel}
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          required
          value={credentials.email}
          onChange={(event) => setCredentials((prev) => ({ ...prev, email: event.target.value }))}
          className="field"
          aria-invalid={Boolean(fields.email)}
          aria-describedby={fields.email ? "login-email-error" : undefined}
        />
        <FieldError id="login-email-error" message={fields.email} />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="login-password" className="field-label">
            {t.passwordLabel}
          </label>
          <Link href="/forgot-password" className="link mb-1 text-xs">
            {t.forgotCta}
          </Link>
        </div>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          required
          value={credentials.password}
          onChange={(event) => setCredentials((prev) => ({ ...prev, password: event.target.value }))}
          className="field"
          aria-invalid={Boolean(fields.password)}
          aria-describedby={fields.password ? "login-password-error" : undefined}
        />
        <FieldError id="login-password-error" message={fields.password} />
      </div>

      {notice ? <p className="text-xs text-emerald-300">{notice}</p> : null}
      {error ? (
        <p className="rounded-lg border border-rose-500/25 bg-rose-500/8 px-3 py-2 text-xs text-rose-200" role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? <Icon name="refresh" size={15} className="animate-spin" /> : <Icon name="lock" size={15} />}
        {t.loginCta}
      </button>

      <p className="text-center text-xs text-muted">
        {t.noAccount}{" "}
        <Link href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="link">
          {t.toRegister}
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm({
  t,
  next,
  locale,
}: {
  t: Dictionary["auth"];
  next?: string;
  locale: Locale;
}) {
  const router = useRouter();
  const [pendingSuccess, setPendingSuccess] = useState(false);
  const [devLink, setDevLink] = useState<string | undefined>();

  const { pending, error, fields, submit } = useAuthSubmit((data) => {
    setPendingSuccess(true);
    setDevLink(data.devLink);
    setTimeout(() => {
      router.push(next ?? "/dashboard");
      router.refresh();
    }, 1200);
  });

  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        await submit("/api/auth/register", {
          displayName: String(formData.get("displayName") ?? ""),
          email: String(formData.get("email") ?? ""),
          password: String(formData.get("password") ?? ""),
          locale,
          acceptTerms: formData.get("acceptTerms") === "on",
          marketingOptIn: formData.get("marketingOptIn") === "on",
        });
      }}
    >
      <div>
        <label htmlFor="register-name" className="field-label">
          {t.nameLabel}
        </label>
        <input
          id="register-name"
          name="displayName"
          autoComplete="name"
          required
          minLength={2}
          maxLength={80}
          className="field"
          aria-invalid={Boolean(fields.displayName)}
          aria-describedby={fields.displayName ? "register-name-error" : undefined}
        />
        <FieldError id="register-name-error" message={fields.displayName} />
      </div>
      <div>
        <label htmlFor="register-email" className="field-label">
          {t.emailLabel}
        </label>
        <input
          id="register-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="field"
          aria-invalid={Boolean(fields.email)}
          aria-describedby={fields.email ? "register-email-error" : undefined}
        />
        <FieldError id="register-email-error" message={fields.email} />
      </div>
      <div>
        <label htmlFor="register-password" className="field-label">
          {t.passwordLabel}
        </label>
        <input
          id="register-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          className="field"
          aria-invalid={Boolean(fields.password)}
          aria-describedby={["register-password-hint", fields.password ? "register-password-error" : null]
            .filter(Boolean)
            .join(" ")}
        />
        <p id="register-password-hint" className="mt-1 text-[0.7rem] text-muted">
          {t.passwordHint}
        </p>
        <FieldError id="register-password-error" message={fields.password} />
      </div>

      <label className="flex items-start gap-2.5 text-xs leading-relaxed text-muted">
        <input
          type="checkbox"
          name="acceptTerms"
          required
          className="mt-0.5 size-4 accent-brand"
          aria-invalid={Boolean(fields.acceptTerms)}
          aria-describedby={fields.acceptTerms ? "register-terms-error" : undefined}
        />
        <span>
          {t.acceptTerms}{" "}
          <Link href="/terms" className="link">
            {locale === "de" ? "Nutzungsbedingungen" : "terms"}
          </Link>
          {", "}
          <Link href="/privacy" className="link">
            {locale === "de" ? "Datenschutz" : "privacy"}
          </Link>
        </span>
      </label>
      <FieldError id="register-terms-error" message={fields.acceptTerms} />

      <label className="flex items-start gap-2.5 text-xs leading-relaxed text-muted">
        <input type="checkbox" name="marketingOptIn" className="mt-0.5 size-4 accent-brand" />
        <span>{t.marketingOptIn}</span>
      </label>

      {error ? (
        <p className="rounded-lg border border-rose-500/25 bg-rose-500/8 px-3 py-2 text-xs text-rose-200" role="alert">
          {error}
        </p>
      ) : null}

      {pendingSuccess ? (
        <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/8 px-3 py-2 text-xs text-emerald-200" role="status">
          {locale === "de" ? "Konto erstellt. Du wirst weitergeleitet …" : "Account created. Redirecting …"}
        </p>
      ) : null}
      <DevLink url={devLink} hint={t.devLinkHint} />

      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? <Icon name="refresh" size={15} className="animate-spin" /> : <Icon name="user" size={15} />}
        {t.registerCta}
      </button>

      <p className="text-center text-xs text-muted">
        {t.hasAccount}{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="link">
          {t.toLogin}
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm({ t }: { t: Dictionary["auth"] }) {
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | undefined>();
  const [email, setEmail] = useState("");

  const { pending, error, submit } = useAuthSubmit((data) => {
    setSent(true);
    setDevLink(data.devLink);
  });

  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await submit("/api/auth/forgot-password", { email });
      }}
    >
      <div>
        <label htmlFor="forgot-email" className="field-label">
          {t.emailLabel}
        </label>
        <input
          id="forgot-email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="field"
          autoComplete="email"
        />
      </div>
      {sent ? (
        <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/8 px-3 py-2 text-xs leading-relaxed text-emerald-200" role="status">
          {t.resetSent}
        </p>
      ) : null}
      <DevLink url={devLink} hint={t.devLinkHint} />
      {error ? (
        <p className="rounded-lg border border-rose-500/25 bg-rose-500/8 px-3 py-2 text-xs text-rose-200" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? <Icon name="refresh" size={15} className="animate-spin" /> : <Icon name="mail" size={15} />}
        {t.resetCta}
      </button>
      <p className="text-center text-xs text-muted">
        <Link href="/login" className="link">
          {t.toLogin}
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ t, token }: { t: Dictionary["auth"]; token: string }) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const { pending, error, fields, submit } = useAuthSubmit(() => {
    setDone(true);
    setTimeout(() => router.push("/login?reset=1"), 1400);
  });

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-200" role="status">
        {t.resetSuccess}
      </div>
    );
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        await submit("/api/auth/reset-password", {
          token,
          password: String(formData.get("password") ?? ""),
        });
      }}
    >
      <div>
        <label htmlFor="reset-password" className="field-label">
          {t.passwordLabel}
        </label>
        <input
          id="reset-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          className="field"
          aria-invalid={Boolean(fields.password)}
          aria-describedby={["reset-password-hint", fields.password ? "reset-password-error" : null]
            .filter(Boolean)
            .join(" ")}
        />
        <p id="reset-password-hint" className="mt-1 text-[0.7rem] text-muted">
          {t.passwordHint}
        </p>
        <FieldError id="reset-password-error" message={fields.password} />
      </div>
      {error ? (
        <p className="rounded-lg border border-rose-500/25 bg-rose-500/8 px-3 py-2 text-xs text-rose-200" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? <Icon name="refresh" size={15} className="animate-spin" /> : <Icon name="check" size={15} />}
        {t.newPasswordCta}
      </button>
      <p className="text-center text-xs text-muted">
        <Link href="/forgot-password" className="link">
          {t.resetCta}
        </Link>
      </p>
    </form>
  );
}
