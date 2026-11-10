import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { addDays, get, nowIso, run } from "./db";
import { env } from "./env";
import { randomToken, sha256 } from "./auth";

export const SESSION_COOKIE = "sh_session";

export type Role = "customer" | "support" | "admin";

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  emailVerified: boolean;
  locale: string;
  mfaOk: boolean;
  createdAt: string;
  mfaEnrolled: boolean;
};

type SessionRow = {
  token_hash: string;
  expires_at: string;
  mfa_ok: number;
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  email_verified: number;
  locale: string;
  created_at: string;
  disabled_at: string | null;
  mfa_secret: string | null;
  mfa_confirmed: string | null;
};

export async function createSession(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null; mfaOk?: boolean } = {},
) {
  const token = randomToken(32);
  const issued = Date.now();
  run(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at, mfa_ok, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    sha256(token),
    userId,
    new Date(issued).toISOString(),
    addDays(env.sessionDays, issued),
    new Date(issued).toISOString(),
    meta.mfaOk === false ? 0 : 1,
    meta.ip ?? null,
    (meta.userAgent ?? "").slice(0, 300),
  );
  return token;
}

export async function applySessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    path: "/",
    maxAge: env.sessionDays * 86_400,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = get<SessionRow>(
    `SELECT s.token_hash, s.expires_at, s.mfa_ok, u.id AS user_id, u.email, u.display_name,
            u.role, u.email_verified, u.locale, u.created_at, u.disabled_at,
            m.secret AS mfa_secret, m.confirmed_at AS mfa_confirmed
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN mfa_secrets m ON m.user_id = u.id
     WHERE s.token_hash = ?`,
    sha256(token),
  );
  if (!row) return null;
  if (row.disabled_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    run(`DELETE FROM sessions WHERE token_hash = ?`, row.token_hash);
    return null;
  }

  return {
    id: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: (row.role as Role) ?? "customer",
    emailVerified: Boolean(row.email_verified),
    locale: row.locale || "de",
    mfaOk: Boolean(row.mfa_ok),
    createdAt: row.created_at,
    mfaEnrolled: Boolean(row.mfa_confirmed),
  };
}

export async function touchSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return;
  run(`UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?`, nowIso(), sha256(token));
}

export async function currentSessionTokenHash(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return token ? sha256(token) : null;
}

export async function markSessionMfaVerified() {
  const hash = await currentSessionTokenHash();
  if (hash) run(`UPDATE sessions SET mfa_ok = 1 WHERE token_hash = ?`, hash);
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) run(`DELETE FROM sessions WHERE token_hash = ?`, sha256(token));
  await clearSessionCookie();
}

export function invalidateUserSessions(userId: string, exceptTokenHash?: string) {
  if (exceptTokenHash) {
    run(`DELETE FROM sessions WHERE user_id = ? AND token_hash != ?`, userId, exceptTokenHash);
  } else {
    run(`DELETE FROM sessions WHERE user_id = ?`, userId);
  }
}

export async function requireUser(nextPath = "/dashboard"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}

const STAFF_ROLES: Role[] = ["support", "admin"];

export function isStaff(role: Role) {
  return STAFF_ROLES.includes(role);
}

export async function requireStaff(nextPath = "/admin"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  if (!isStaff(user.role)) redirect("/dashboard?error=forbidden");
  if (!user.mfaOk) redirect("/admin/login?step=mfa");
  if (!user.mfaEnrolled) redirect("/admin/mfa");
  return user;
}

export async function requireAdmin(nextPath = "/admin"): Promise<SessionUser> {
  const user = await requireStaff(nextPath);
  if (user.role !== "admin") redirect("/admin?error=forbidden");
  return user;
}
