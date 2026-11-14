import { Alert, Badge, PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import { releaseEmailSuppressionAction, retryEmailAction } from "@/lib/actions/admin";
import { all } from "@/lib/db";
import { isEmailConfigured } from "@/lib/env";
import { requireStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminEmailsPage() {
  await requireStaff();
  const { t, locale } = await getI18n();

  const mails = all<{
    id: string;
    to_email: string;
    subject: string;
    body_text: string;
    kind: string;
    status: string;
    provider_status: string | null;
    attempts: number;
    created_at: string;
    error: string | null;
  }>(
    `SELECT id, to_email, subject, body_text, kind, status, provider_status, attempts, created_at, error
     FROM outbox_emails ORDER BY created_at DESC LIMIT 50`,
  );

  const suppressions = all<{ email: string; reason: string; created_at: string }>(
    `SELECT email, reason, created_at FROM email_suppressions ORDER BY created_at DESC LIMIT 25`,
  );

  const dateFormat = new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <div className="grid grid-cols-1 gap-5">
      <PageHeader eyebrow={t.admin.nav.emails} title={t.admin.emails.title} description={t.admin.emails.subtitle} />

      {!isEmailConfigured() ? <Alert tone="warning">{t.admin.emails.providerMissing}</Alert> : null}

      <div className="grid grid-cols-1 gap-2">
        {mails.map((mail) => (
          <details key={mail.id} className="card px-4 py-3">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 text-xs marker:hidden [&::-webkit-details-marker]:hidden">
              <div className="min-w-0">
                <p className="truncate text-[0.82rem] text-slate-200" title={mail.subject}>
                  {mail.subject}
                </p>
                <p className="break-words text-[0.68rem] text-muted">
                  {mail.to_email} · {dateFormat.format(new Date(mail.created_at))} · {mail.kind}
                  {mail.provider_status ? ` · ${mail.provider_status}` : ""} · {mail.attempts}
                </p>
              </div>
              <Badge tone={mail.status === "sent" ? "ok" : mail.status === "failed" ? "danger" : "warn"}>
                {mail.status === "sent"
                  ? t.admin.emails.sent
                  : mail.status === "failed"
                    ? t.admin.emails.failed
                    : mail.status === "suppressed"
                      ? t.admin.emails.suppressed
                      : t.admin.emails.queued}
              </Badge>
            </summary>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-line/50 bg-ink/60 p-3 text-[0.7rem] leading-relaxed text-slate-300">
              {mail.body_text}
            </pre>
            {mail.error ? <p className="mt-2 text-[0.68rem] text-rose-300">{mail.error}</p> : null}
            {mail.status !== "sent" && mail.status !== "suppressed" && isEmailConfigured() ? (
              <form action={retryEmailAction} className="mt-3">
                <input type="hidden" name="emailId" value={mail.id} />
                <button type="submit" className="btn btn-outline btn-sm">
                  {t.admin.emails.retry}
                </button>
              </form>
            ) : null}
          </details>
        ))}
        {mails.length === 0 ? <p className="text-xs text-muted">{t.admin.emails.empty}</p> : null}
      </div>

      <section className="card p-4">
        <h2 className="text-base font-semibold">{t.admin.emails.suppressionsTitle}</h2>
        <p className="mt-1 text-xs text-muted">{t.admin.emails.suppressionsHint}</p>
        {suppressions.length === 0 ? (
          <p className="mt-3 text-xs text-muted">{t.admin.emails.suppressionsEmpty}</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {suppressions.map((entry) => (
              <li
                key={entry.email}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line/60 bg-white/2 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs text-slate-200">{entry.email}</p>
                  <p className="text-[0.68rem] text-muted">
                    {entry.reason === "bounce"
                      ? t.admin.emails.reasonBounce
                      : entry.reason === "complaint"
                        ? t.admin.emails.reasonComplaint
                        : t.admin.emails.reasonManual}{" "}
                    · {dateFormat.format(new Date(entry.created_at))}
                  </p>
                </div>
                <form action={releaseEmailSuppressionAction}>
                  <input type="hidden" name="email" value={entry.email} />
                  <button type="submit" className="btn btn-ghost btn-sm">
                    {t.admin.emails.release}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
