import { cookies } from "next/headers";
import { z } from "zod";
import { isSameOrigin, json, parseBody } from "@/lib/api";

const schema = z.object({ choice: z.enum(["all", "necessary"]) });

const CONSENT_COOKIE = "sh_consent";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return json({ error: { code: "forbidden", message: "Ungültige Herkunft." } }, { status: 403 });
  }
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;

  const store = await cookies();
  store.set(CONSENT_COOKIE, parsed.data.choice, {
    path: "/",
    sameSite: "lax",
    maxAge: 180 * 86_400,
    secure: process.env.NODE_ENV === "production",
  });

  // No optional third-party scripts are shipped. If analytics or marketing
  // tags are added later they must be loaded only when this cookie equals "all".
  return json({ ok: true, choice: parsed.data.choice });
}
