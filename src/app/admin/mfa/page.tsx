import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MfaSetupForm } from "@/components/mfa-setup-form";
import { LogoMark } from "@/components/logo";
import { Alert } from "@/components/ui";
import { getI18n } from "@/i18n";
import { confirmMfaSetupAction, startMfaSetupAction } from "@/lib/actions/admin";
import { get } from "@/lib/db";
import { getSessionUser, isStaff } from "@/lib/session";
import { otpauthUri } from "@/lib/totp";

export const metadata: Metadata = { title: "MFA einrichten", robots: { index: false } };

export default async function AdminMfaPage() {
  const { t } = await getI18n();
  const user = await getSessionUser();

  if (!user) redirect("/login?next=/admin");
  if (!isStaff(user.role)) redirect("/dashboard?error=forbidden");

  const row = get<{ secret: string; confirmed_at: string | null }>(
    `SELECT secret, confirmed_at FROM mfa_secrets WHERE user_id = ?`,
    user.id,
  );

  if (row?.confirmed_at) {
    return (
      <div className="shell flex min-h-[70vh] items-center justify-center py-12">
        <div className="w-full max-w-lg">
          <div className="card p-6 text-center">
            <LogoMark size={40} />
            <h1 className="mt-3 text-xl font-semibold">{t.admin.mfa.enabled}</h1>
            <p className="mt-2 text-sm text-muted">{t.admin.mfa.alreadyEnabled}</p>
            <Link href="/admin" className="btn btn-primary mt-4">
              {t.admin.title}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="shell flex min-h-[70vh] items-center justify-center py-12">
        <div className="card w-full max-w-lg p-6 text-center">
          <LogoMark size={40} />
          <h1 className="mt-3 text-xl font-semibold">{t.admin.mfa.title}</h1>
          <p className="mt-2 text-sm text-muted">{t.admin.mfa.subtitle}</p>
          <form action={startMfaSetupAction} className="mt-4">
            <button type="submit" className="btn btn-primary">
              {t.admin.overview.setupMfa}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const uri = otpauthUri(user.email, row.secret);

  return (
    <div className="shell flex min-h-[70vh] items-center justify-center py-12">
      <div className="w-full max-w-xl">
        <div className="card p-6">
          <div className="flex items-center gap-3">
            <LogoMark size={36} />
            <div>
              <p className="eyebrow">{t.admin.title}</p>
              <h1 className="text-lg font-semibold">{t.admin.mfa.title}</h1>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted">{t.admin.mfa.subtitle}</p>

          <div className="mt-4 rounded-xl border border-line/60 bg-white/3 p-4">
            <p className="text-[0.7rem] uppercase tracking-[0.1em] text-muted">{t.admin.mfa.secretLabel}</p>
            <p className="mt-1 break-all font-mono text-sm text-cyan-200">{row.secret}</p>
            <p className="mt-3 text-[0.7rem] uppercase tracking-[0.1em] text-muted">{t.admin.mfa.uriLabel}</p>
            <p className="mt-1 break-all font-mono text-[0.65rem] leading-relaxed text-slate-400">{uri}</p>
            <p className="mt-2 text-[0.68rem] leading-relaxed text-muted">{t.admin.mfa.scanHint}</p>
          </div>

          <div className="mt-4">
            <MfaSetupForm
              action={confirmMfaSetupAction}
              labels={{ code: t.admin.mfa.codeLabel, cta: t.admin.mfa.enableCta }}
            />
          </div>

          <div className="mt-4">
            <Alert tone="info">{t.admin.mfa.notAuthorized}</Alert>
          </div>
        </div>
      </div>
    </div>
  );
}
