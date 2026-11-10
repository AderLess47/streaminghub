import { cookies } from "next/headers";
import { defaultLocale, isLocale, LOCALE_COOKIE, localeMeta, type Locale } from "./config";
import { de, type Dictionary } from "./de";
import { en } from "./en";
import { extraLocales } from "./extra";

export { locales, localeMeta, defaultLocale, LOCALE_COOKIE } from "./config";
export type { Locale } from "./config";
export type { Dictionary } from "./de";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Deep-merge a partial locale over the English fallback. */
function merge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override === undefined ? base : (override as T)) ?? base;
  }
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const baseValue = result[key];
    result[key] = isPlainObject(baseValue) && isPlainObject(value)
      ? merge(baseValue, value)
      : value;
  }
  return result as T;
}

export const dictionaries: Record<Locale, Dictionary> = {
  de,
  en,
  tr: merge(en, extraLocales.tr) as Dictionary,
  ar: merge(en, extraLocales.ar) as Dictionary,
  fr: merge(en, extraLocales.fr) as Dictionary,
  es: merge(en, extraLocales.es) as Dictionary,
  it: merge(en, extraLocales.it) as Dictionary,
  el: merge(en, extraLocales.el) as Dictionary,
};

export function getDictionaryFor(locale: Locale): Dictionary {
  return dictionaries[locale] ?? de;
}

/** Resolves the active locale: cookie → Accept-Language → German. */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const cookieLocale = store.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookieLocale)) return cookieLocale;

  const acceptLanguage = store.get("accept-language")?.value;
  if (acceptLanguage) {
    const preferred = acceptLanguage
      .split(",")
      .map((part) => part.split(";")[0].trim().slice(0, 2).toLowerCase())
      .find((code) => isLocale(code));
    if (preferred) return preferred as Locale;
  }
  return defaultLocale;
}

export async function getI18n() {
  const locale = await getLocale();
  return {
    locale,
    dir: localeMeta[locale].dir,
    t: getDictionaryFor(locale),
  };
}

export type I18n = Awaited<ReturnType<typeof getI18n>>;
