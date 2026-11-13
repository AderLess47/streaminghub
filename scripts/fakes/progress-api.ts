/**
 * Test-Doubles für `src/app/api/v1/progress/route.ts`.
 *
 * Die Route wird headless gebündelt; ersetzt werden nur die drei Teile, die
 * ohne laufenden Next-Server bzw. ohne echte Geräte-Tokens nicht verfügbar
 * sind: Geräte-Auth, Premium-Status und die NextResponse-Helfer. Datenbank,
 * Schema, Rate-Limit und die Fortschrittsregeln laufen im Original.
 */

/* ------------------------------ Geräte-Auth ------------------------------ */

const registeredTokens = new Map<string, { userId: string; deviceId: string }>();

export function __registerDeviceToken(token: string, userId: string, deviceId: string): void {
  registeredTokens.set(token, { userId, deviceId });
}

export function verifyDeviceToken(token: string): { userId: string; deviceId: string } | null {
  return registeredTokens.get(token) ?? null;
}

/* -------------------------------- Premium -------------------------------- */

const premiumUsers = new Set<string>();

export function __setPremium(userId: string, active: boolean): void {
  if (active) premiumUsers.add(userId);
  else premiumUsers.delete(userId);
}

export function getSubscription(userId: string): { userId: string; status: string } {
  return { userId, status: premiumUsers.has(userId) ? "active" : "inactive" };
}

export function effectiveStatus(subscription: { status: string }): string {
  return subscription.status;
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

export function clientIp(): string {
  return "127.0.0.1";
}
