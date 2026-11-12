import { NextResponse } from "next/server";
import { ZodError, type ZodTypeAny, type output } from "zod";

export type ApiErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "premium_required"
  | "not_found"
  | "rate_limited"
  | "conflict"
  | "not_configured"
  | "server_error";

const statusByCode: Record<ApiErrorCode, number> = {
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

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: { "cache-control": "no-store", ...(init?.headers ?? {}) },
  });
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  extra?: Record<string, unknown>,
) {
  return json({ error: { code, message, ...extra } }, { status: statusByCode[code] });
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Defends state-changing API calls against cross-site requests. Browsers send
 * Origin on POST; non-browser clients (the StreamingHub app) send no Origin and
 * are protected by bearer tokens instead of cookies.
 */
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

export async function parseBody<S extends ZodTypeAny>(request: Request, schema: S): Promise<
  { ok: true; data: output<S> } | { ok: false; response: NextResponse }
> {
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
      return {
        ok: false,
        response: apiError("invalid_request", "Bitte prüfe deine Eingaben.", { fields }),
      };
    }
    return { ok: false, response: apiError("invalid_request", "Ungültige Anfrage.") };
  }
}

export function tooManyRequests(retryAfterSeconds: number) {
  return json(
    {
      error: {
        code: "rate_limited",
        message: "Zu viele Anfragen. Bitte versuche es später erneut.",
      },
    },
    { status: 429, headers: { "retry-after": String(retryAfterSeconds) } },
  );
}
