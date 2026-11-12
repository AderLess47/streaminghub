import { timingSafeEqual } from "node:crypto";
import { apiError, json } from "@/lib/api";
import { runAmazonSync } from "@/lib/amazon-sync";
import { env, isAmazonIapConfigured } from "@/lib/env";

export const runtime = "nodejs";

/**
 * Pull sync for Amazon subscriptions, called by `scripts/amazon-sync.mjs` from a
 * scheduler. Protected by a shared token – it never runs from the browser.
 */
export async function POST(request: Request) {
  if (!isAmazonIapConfigured() || !env.billing.amazonSyncToken) {
    return apiError("not_configured", "Amazon-Sync ist nicht konfiguriert.");
  }
  if (!isAuthorized(request)) return apiError("forbidden", "Ungültiges Sync-Token.");

  const result = await runAmazonSync({
    baseUrl: env.billing.amazonRvsBase,
    sandbox: env.billing.amazonRvsSandbox,
    sharedSecret: env.billing.amazonRvsSharedSecret,
  });

  return json({ ok: true, ...result });
}

function isAuthorized(request: Request) {
  const provided = request.headers.get("x-amazon-sync-token") ?? "";
  const expected = env.billing.amazonSyncToken;
  if (!expected || provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}
