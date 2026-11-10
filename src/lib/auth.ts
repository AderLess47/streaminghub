import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { addSeconds, get, nowIso, run } from "./db";

const SCRYPT_N = 16_384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEY_LEN = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password.normalize("NFKC"), salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_r,
    p: SCRYPT_p,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_r}$${SCRYPT_p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, n, r, p, saltB64, keyB64] = stored.split("$");
    if (scheme !== "scrypt") return false;
    const key = scryptSync(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), KEY_LEN, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    const expected = Buffer.from(keyB64, "base64");
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

/** Human-friendly coupling code: 8 chars, no ambiguous characters (0/O, 1/I/L). */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function generatePairingCode(groups = 2, groupSize = 4): string {
  const bytes = randomBytes(groups * groupSize);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if ((i + 1) % groupSize === 0 && i + 1 < bytes.length) out += "-";
  }
  return out;
}

export const normalizePairingCode = (input: string) =>
  input.toUpperCase().replace(/[^A-Z0-9]/g, "");

export type AuthTokenKind = "verify_email" | "reset_password";

export function issueAuthToken(userId: string, kind: AuthTokenKind, ttlSeconds: number) {
  const raw = randomToken();
  const id = randomToken(9);
  const createdAt = nowIso();
  run(
    `INSERT INTO auth_tokens (id, user_id, kind, token_hash, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    userId,
    kind,
    sha256(raw),
    createdAt,
    addSeconds(ttlSeconds),
  );
  return { raw, id, expiresAt: addSeconds(ttlSeconds) };
}

type AuthTokenRow = {
  id: string;
  user_id: string;
  kind: string;
  expires_at: string;
  used_at: string | null;
};

export function consumeAuthToken(raw: string, kind: AuthTokenKind): AuthTokenRow | null {
  const row = get<AuthTokenRow>(
    `SELECT id, user_id, kind, expires_at, used_at FROM auth_tokens
     WHERE token_hash = ? AND kind = ?`,
    sha256(raw),
    kind,
  );
  if (!row || row.used_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  run(`UPDATE auth_tokens SET used_at = ? WHERE id = ?`, nowIso(), row.id);
  return row;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
