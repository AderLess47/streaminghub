import { apiError, isSameOrigin, json } from "@/lib/api";
import { destroySession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("forbidden", "Ungültige Herkunft der Anfrage.");
  await destroySession();
  return json({ ok: true });
}
