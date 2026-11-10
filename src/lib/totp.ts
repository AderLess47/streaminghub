import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(bytes = 20): string {
  const buffer = randomBytes(bytes);
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let secret = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    secret += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  return secret;
}

export function base32Decode(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = "";
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totpCode(secret: string, timeStep = Math.floor(Date.now() / 30_000)): string {
  const key = base32Decode(secret);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(timeStep));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(binary % 1_000_000).padStart(6, "0");
}

/** Verifies a 6-digit TOTP within +/- 1 time step (30 s) to tolerate clock drift. */
export function verifyTotp(secret: string, token: string, window = 1): boolean {
  const normalized = token.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const step = Math.floor(Date.now() / 30_000);
  for (let offset = -window; offset <= window; offset++) {
    const expected = totpCode(secret, step + offset);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(normalized))) return true;
  }
  return false;
}

export function otpauthUri(accountEmail: string, secret: string) {
  const label = encodeURIComponent(`StreamingHub:${accountEmail}`);
  const params = new URLSearchParams({
    secret,
    issuer: "StreamingHub",
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export function generateRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () =>
    randomBytes(5).toString("hex").toUpperCase().match(/.{1,5}/g)!.join("-"),
  );
}
