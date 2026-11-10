import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth-forms";
import { LogoMark } from "@/components/logo";
import { getI18n } from "@/i18n";

export const metadata: Metadata = { title: "Neues Passwort" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { t } = await getI18n();
  const params = await searchParams;
  const token = params.token ?? "";

  return (
    <div className="shell flex min-h-[70vh] items-center justify-center py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark size={44} />
          <h1 className="mt-4 text-2xl font-semibold">{t.auth.newPasswordTitle}</h1>
          <p className="mt-1.5 text-sm text-muted">{t.auth.passwordHint}</p>
        </div>
        <div className="card p-6">
          {token.length >= 10 ? (
            <ResetPasswordForm t={t.auth} token={token} />
          ) : (
            <div className="grid gap-4 text-center">
              <p className="text-sm text-rose-300">{t.auth.resetInvalid}</p>
              <Link href="/forgot-password" className="btn btn-primary btn-block">
                {t.auth.resetCta}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
