/**
 * Test-Doubles für die API-Routen unter `src/app/api`.
 *
 * Ersetzt wird nur, was ohne laufenden Next-Server nicht verfügbar ist:
 * Session-Cookies, Premium-Status und die NextResponse-Helfer. Datenbank,
 * Schema, Geräte-Tokens (`src/lib/device-auth.ts`), Validierung und
 * Rate-Limit laufen im Original.
 *
 * `getEntitlements`/`hasPremiumAccess` spiegeln den echten Vertrag aus
 * `src/lib/entitlements.ts` für die gestubbte Premium-Freigabe. Die Routen
 * lesen Rechte inzwischen dort statt direkt am Abo-Status.
 */

import { ZodError, type ZodTypeAny } from "zod";

/* --------------------------------- Session -------------------------------- */

type SessionUser = { id: string; email: string; display_name?: string };

let sessionUser: SessionUser | null = null;

export function __setSessionUser(user: SessionUser | null): void {
  sessionUser = user;
}

/** Wie im Original: ohne Anmeldung wird geworfen, die Route antwortet mit 401. */
export async function requireUser(): Promise<SessionUser> {
  if (!sessionUser) throw new Error("Nicht angemeldet");
  return sessionUser;
}

/** Wie im Original `null` statt eines Fehlers – für Routen ohne Anmeldepflicht. */
export async function getSessionUser(): Promise<SessionUser | null> {
  return sessionUser;
}

/* -------------------------------- Premium -------------------------------- */

const premiumUsers = new Set<string>();
/** Konto -> Trial-Ende; entspricht `subscriptions.trial_ends_at`. */
const trialUsers = new Map<string, string>();

export function __setPremium(userId: string, active: boolean): void {
  if (active) premiumUsers.add(userId);
  else premiumUsers.delete(userId);
}

export function __setTrial(userId: string, endsAt: string | null): void {
  if (endsAt) trialUsers.set(userId, endsAt);
  else trialUsers.delete(userId);
}

export function getSubscription(userId: string): { userId: string; status: string; channel: string } {
  const status = premiumUsers.has(userId)
    ? "active"
    : trialUsers.has(userId)
      ? "none"
      : "inactive";
  return { userId, status, channel: "web" };
}

export function effectiveStatus(subscription: { status: string }): string {
  return subscription.status;
}

/* ------------------------------- Ansprüche ------------------------------- */

/** Gleiche Form wie `Entitlements`; ein laufender Trial zählt als Premium. */
export function getEntitlements(userId: string) {
  const paid = premiumUsers.has(userId);
  const trialEndsAt = paid ? null : (trialUsers.get(userId) ?? null);
  const trialActive = trialEndsAt !== null;
  const premium = paid || trialActive;
  return {
    plan: premium ? "standard" : "free",
    source: paid ? "stripe" : trialActive ? "trial" : "none",
    premium,
    trialActive,
    trialEndsAt,
    billingInterval: paid ? "month" : null,
    // Entspricht den Defaults aus seed.ts (free 2 / premium 5).
    deviceLimit: premium ? 5 : 2,
    cloudBackup: premium,
    progressSync: premium,
  };
}

export function hasPremiumAccess(userId: string): boolean {
  return premiumUsers.has(userId) || trialUsers.has(userId);
}

/* -------------------------------- Checkout ------------------------------- */

let checkoutCalls = 0;

export function __resetCheckout(): void {
  checkoutCalls = 0;
}

export function __checkoutCalls(): number {
  return checkoutCalls;
}

/** Ersetzt den Stripe-Aufruf; die Route prüft die Zustimmung davor selbst. */
export async function createWebCheckout(_params: unknown): Promise<{
  ok: true;
  url: string;
  sessionId: string;
}> {
  checkoutCalls += 1;
  return {
    ok: true,
    url: "https://checkout.example.test/cs_test_consent",
    sessionId: "cs_test_consent",
  };
}

/* ------------------------------ API-Antworten ---------------------------- */

const statusByCode: Record<string, number> = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  premium_required: 402,
  not_found: 404,
  rate_limited: 429,
  conflict: 409,
  not_configured: 503,
  consent_required: 400,
  server_error: 500,
};

export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...(init?.headers ?? {}) },
  });
}

export function apiError(code: string, message: string, extra?: Record<string, unknown>): Response {
  return json({ error: { code, message, ...extra } }, { status: statusByCode[code] ?? 500 });
}

export function tooManyRequests(retryAfterSeconds: number): Response {
  return json(
    { error: { code: "rate_limited", message: "Zu viele Anfragen.", retryAfterSeconds } },
    { status: 429, headers: { "retry-after": String(retryAfterSeconds) } },
  );
}

/** Echte Ermittlung, damit die Tests auch gefälschte Header abdecken. */
export { clientIp } from "@/lib/client-ip";

/** Gleiche Regeln wie `isSameOrigin` in `src/lib/api.ts`. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin) return true;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function parseBody<S extends ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<{ ok: true; data: unknown } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: apiError("invalid_request", "Ungültiger JSON-Body.") };
  }
  try {
    return { ok: true, data: schema.parse(raw) };
  } catch (error) {
    if (error instanceof ZodError) {
      const fields = error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      return { ok: false, response: apiError("invalid_request", "Ungültige Eingabe.", { fields }) };
    }
    throw error;
  }
}
