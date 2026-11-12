import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth-forms";
import { LogoMark } from "@/components/logo";
import { getI18n } from "@/i18n";

export const metadata: Metadata = { title: "Passwort zurücksetzen" };

export default async function ForgotPasswordPage() {
  const { t } = await getI18n();
  return (
    <div className="shell flex min-h-[70vh] items-center justify-center py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark size={44} />
          <h1 className="mt-4 text-2xl font-semibold">{t.auth.resetTitle}</h1>
          <p className="mt-1.5 text-sm text-muted">{t.auth.resetSubtitle}</p>
        </div>
        <div className="card p-6">
          <ForgotPasswordForm t={t.auth} busy={t.ui.sending} />
        </div>
      </div>
    </div>
  );
}
