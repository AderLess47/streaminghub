import { cookies } from "next/headers";
import { z } from "zod";
import { isSameOrigin, json, parseBody } from "@/lib/api";
import { nowIso, run } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { LOCALE_COOKIE, locales } from "@/i18n/config";

const schema = z.object({ locale: z.enum(locales) });

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return json({ error: { code: "forbidden", message: "Ungültige Herkunft." } }, { status: 403 });
  }
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;

  // Die Wahl gilt nicht nur für dieses Gerät: Mails und andere Sitzungen
  // lesen die Sprache aus dem Konto. Ohne diesen Schritt wäre die Auswahl
  // beim nächsten Gerät und in jeder Mail wieder die alte.
  const user = await getSessionUser();
  if (user) {
    run(
      `UPDATE users SET locale = ?, updated_at = ? WHERE id = ?`,
      parsed.data.locale,
      nowIso(),
      user.id,
    );
  }

  const store = await cookies();
  store.set(LOCALE_COOKIE, parsed.data.locale, {
    path: "/",
    sameSite: "lax",
    maxAge: 365 * 86_400,
    secure: process.env.NODE_ENV === "production",
  });

  return json({ ok: true, locale: parsed.data.locale });
}
