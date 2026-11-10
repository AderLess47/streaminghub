import { cookies } from "next/headers";
import { z } from "zod";
import { isSameOrigin, json, parseBody } from "@/lib/api";
import { LOCALE_COOKIE, locales } from "@/i18n/config";

const schema = z.object({ locale: z.enum(locales) });

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return json({ error: { code: "forbidden", message: "Ungültige Herkunft." } }, { status: 403 });
  }
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;

  const store = await cookies();
  store.set(LOCALE_COOKIE, parsed.data.locale, {
    path: "/",
    sameSite: "lax",
    maxAge: 365 * 86_400,
    secure: process.env.NODE_ENV === "production",
  });

  return json({ ok: true, locale: parsed.data.locale });
}
