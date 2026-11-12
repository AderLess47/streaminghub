import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth-forms";
import { AdminMfaForm } from "@/components/admin-mfa-form";
import { LogoMark } from "@/components/logo";
import { Alert } from "@/components/ui";
import { getI18n } from "@/i18n";
import { getSessionUser, isStaff } from "@/lib/session";

export const metadata: Metadata = { title: "Administration – Anmeldung", robots: { index: false } };

export default async function AdminLoginPage() {
  const { t } = await getI18n();
  const user = await getSessionUser();

  if (user && isStaff(user.role)) {
    if (!user.mfaEnrolled) redirect("/admin/mfa");
    if (user.mfaOk) redirect("/admin");
  }

  return (
    <div className="shell flex min-h-[75vh] items-center justify-center py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark size={44} />
          <p className="eyebrow mt-4">{t.admin.title}</p>
          <h1 className="mt-2 text-2xl font-semibold">{t.admin.login.title}</h1>
          <p className="mt-1.5 text-sm text-muted">{t.admin.login.subtitle}</p>
        </div>

        <div className="card p-6">
          {user && isStaff(user.role) && !user.mfaOk ? (
            <AdminMfaForm
              labels={{
                title: t.admin.login.mfaStep,
                hint: t.admin.login.mfaStepHint,
                cta: t.admin.login.continue,
                error: t.auth.mfaInvalid,
                busy: t.ui.sending,
              }}
            />
          ) : (
            <>
              <Alert tone="info">
                {t.admin.subtitle}
              </Alert>
              <div className="mt-4">
                <LoginForm t={t.auth} next="/admin" busy={t.ui.sending} />
              </div>
            </>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-muted">
          <Link href="/login" className="link">
            {t.nav.login}
          </Link>
        </p>
      </div>
    </div>
  );
}
