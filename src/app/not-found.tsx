import Link from "next/link";
import { Icon } from "@/components/icons";
import { getI18n } from "@/i18n";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <div className="shell flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
            <p aria-hidden="true" className="text-6xl font-semibold text-brand-light/70">
        404
      </p>
      <h1 className="mt-3 text-2xl font-semibold">{t.errors.notFoundTitle}</h1>
      <p className="mt-2 max-w-md text-sm text-muted">{t.errors.notFoundBody}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/" className="btn btn-primary">
          {t.errors.toHome}
        </Link>
        <Link href="/help" className="btn btn-outline">
          <Icon name="search" size={15} />
          {t.help.title}
        </Link>
      </div>
    </div>
  );
}
