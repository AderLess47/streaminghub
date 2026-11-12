import type { Metadata } from "next";
import { LegalView } from "@/components/legal-view";
import { accessibilityDoc } from "@/content/accessibility";
import { getI18n } from "@/i18n";

export const metadata: Metadata = { title: "Barrierefreiheit" };

export default async function AccessibilityPage() {
  const { locale } = await getI18n();
  return <LegalView doc={accessibilityDoc} locale={locale} />;
}
