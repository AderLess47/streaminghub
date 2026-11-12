import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth-forms";
import { LogoMark } from "@/components/logo";
import { Alert } from "@/components/ui";
import { getI18n } from "@/i18n";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Anmelden" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; loggedOut?: string; verified?: string; reset?: string }>;
}) {
  const { t } = await getI18n();
  const user = await getSessionUser();
  const params = await searchParams;
  const next = params.next && params.next.startsWith("/") ? params.next : undefined;

  if (user) redirect(next ?? "/dashboard");

  return (
    <div className="shell flex min-h-[70vh] items-center justify-center py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark size={44} />
          <h1 className="mt-4 text-2xl font-semibold">{t.auth.loginTitle}</h1>
          <p className="mt-1.5 text-sm text-muted">{t.auth.loginSubtitle}</p>
        </div>

        <div className="card p-6">
          {params.loggedOut ? (
            <div className="mb-4">
              <Alert tone="info">{t.auth.loggedOut}</Alert>
            </div>
          ) : null}
          {params.verified ? (
            <div className="mb-4">
              <Alert tone="success">{t.auth.verifySuccess}</Alert>
            </div>
          ) : null}
          {params.reset ? (
            <div className="mb-4">
              <Alert tone="success">{t.auth.resetSuccess}</Alert>
            </div>
          ) : null}
          <LoginForm t={t.auth} next={next} busy={t.ui.sending} />
        </div>

        <p className="mt-5 text-center text-xs leading-relaxed text-muted">
          {t.nav.activate}:{" "}
          <Link href="/activate" className="link">
            /activate
          </Link>
        </p>
      </div>
    </div>
  );
}
