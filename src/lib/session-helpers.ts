/**
 * Re-exports for API route handlers. Keeping cookie writes in one place makes
 * it obvious which helpers may only be used from Route Handlers / Server Actions.
 */
export {
  applySessionCookie,
  clearSessionCookie,
  createSession,
  currentSessionTokenHash,
  discardCurrentSession,
  getFullyAuthenticatedUser,
  invalidateUserSessions,
  isMfaPending,
  markSessionMfaVerified,
  pruneUserSessions,
  SESSION_COOKIE,
} from "./session";
export { get } from "./db";
