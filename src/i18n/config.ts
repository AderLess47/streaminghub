export const locales = ["de", "en", "tr", "ar", "fr", "es", "it", "el"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "de";

export const localeMeta: Record<
  Locale,
  { label: string; english: string; dir: "ltr" | "rtl"; complete: boolean }
> = {
  de: { label: "Deutsch", english: "German", dir: "ltr", complete: true },
  en: { label: "English", english: "English", dir: "ltr", complete: true },
  tr: { label: "Türkçe", english: "Turkish", dir: "ltr", complete: false },
  ar: { label: "العربية", english: "Arabic", dir: "rtl", complete: false },
  fr: { label: "Français", english: "French", dir: "ltr", complete: false },
  es: { label: "Español", english: "Spanish", dir: "ltr", complete: false },
  it: { label: "Italiano", english: "Italian", dir: "ltr", complete: false },
  el: { label: "Ελληνικά", english: "Greek", dir: "ltr", complete: false },
};

export const LOCALE_COOKIE = "sh_locale";

export const isLocale = (value: string | undefined | null): value is Locale =>
  Boolean(value) && (locales as readonly string[]).includes(value as string);
