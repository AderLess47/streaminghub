import type { Metadata } from "next";
import { LegalView } from "@/components/legal-view";
import { legalDocs } from "@/content/legal";
import { getI18n } from "@/i18n";

export const metadata: Metadata = { title: "Widerrufsinformationen" };

export default async function WithdrawalPage() {
  const { locale, t } = await getI18n();
  return <LegalView doc={legalDocs.withdrawal} locale={locale} notice={t.legal.placeholderNotice} />;
}
