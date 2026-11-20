import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/auth-forms";
import { LogoMark } from "@/components/logo";
import { getI18n } from "@/i18n";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Konto erstellen" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { t, locale } = await getI18n();
  const user = await getSessionUser();
  const params = await searchParams;
  const next = params.next && params.next.startsWith("/") ? params.next : undefined;

  if (user) redirect(next ?? "/dashboard");

  return (
    <div className="shell flex min-h-[70vh] items-center justify-center py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark size={44} />
          <h1 className="mt-4 text-2xl font-semibold">{t.auth.registerTitle}</h1>
          <p className="mt-1.5 text-sm text-muted">{t.auth.registerSubtitle}</p>
        </div>
        <div className="card p-6">
          <RegisterForm t={t.auth} locale={locale} next={next} busy={t.ui.sending} />
        </div>
        <div className="mt-4 rounded-xl border border-line/60 bg-white/2 px-4 py-3 text-[0.7rem] leading-relaxed text-muted">
          {t.auth.registerSubtitle}
        </div>
      </div>
    </div>
  );
}
