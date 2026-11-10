import { generatePairingCode, normalizePairingCode, randomToken, sha256 } from "@/lib/auth";
import { apiError, clientIp, json, parseBody, tooManyRequests } from "@/lib/api";
import { addSeconds, nowIso, run } from "@/lib/db";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { pairingRequestSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Called by the StreamingHub app (Fire TV / Android) to obtain a short-lived
 * pairing code. The response contains the plaintext code exactly once and a
 * polling token used to retrieve the activation result.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const limit = rateLimit(rateLimitKey("pairing:ip", ip), 15, 3600);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const parsed = await parseBody(request, pairingRequestSchema);
  if (!parsed.ok) return parsed.response;

  const code = generatePairingCode();
  const normalized = normalizePairingCode(code);
  const pollToken = randomToken(24);
  const requestId = randomToken(12);
  const expiresAt = addSeconds(600);

  run(
    `INSERT INTO pairing_requests
       (id, code_hash, code_prefix, device_name, platform, app_version, poll_token_hash, attempts, created_at, expires_at, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    requestId,
    sha256(normalized),
    normalized.slice(0, 4),
    parsed.data.deviceName,
    parsed.data.platform,
    parsed.data.appVersion ?? null,
    sha256(pollToken),
    nowIso(),
    expiresAt,
    ip,
  );

  return json(
    {
      requestId,
      code,
      pollToken,
      expiresAt,
      expiresInSeconds: 600,
      verificationUrl: "/activate",
      pollIntervalSeconds: 3,
    },
    { status: 201 },
  );
}
