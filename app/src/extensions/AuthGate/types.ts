// =====================================================================================================================
// AuthGate — shared types
// =====================================================================================================================
//
// See AUTH_GATE_PLAN.md (v2) for the design rationale. The component holds NO
// session token in JS state — the cookie is HttpOnly and managed by the
// backend. The frontend only ever knows about the user object.

/**
 * The authenticated user's identity + role/permission snapshot.
 *
 * The `permissions` list is for UI gating only (`$can('foo')` to hide buttons
 * the user can't use). The backend is the only authoritative authorizer.
 */
export type AuthUser = {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
};

/**
 * Discriminated union for the AuthGate's state machine.
 *
 *   bootstrapping  → mount-time silent /me check
 *   unauthenticated→ render the LoginForm slot
 *   authenticated  → render the App slot
 *
 * No `refreshing` state — the session cookie's lifetime is the backend's job.
 */
export type AuthState =
  | { kind: "bootstrapping" }
  | {
      kind: "unauthenticated";
      loading: boolean;
      error: string | null;
    }
  | {
      kind: "authenticated";
      user: AuthUser;
    };

/**
 * Why a session ended (informational; consumed by the `signOut` event).
 *
 * - `user`    — the user clicked Sign out.
 * - `idle`    — client-side idle timer fired (see `idleTimeoutSeconds`).
 * - `expired` — a backend response returned 401 on an authenticated request.
 * - `revoked` — explicit server-issued revocation (e.g. admin force-logout).
 */
export type SignOutReason = "user" | "idle" | "expired" | "revoked";

/**
 * Stable error codes the AuthGate emits via the `authError` event so callers
 * can show localized / per-error UX. Anything else collapses into UNKNOWN.
 */
export type AuthErrorCode =
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_LOCKED"
  | "ACCOUNT_SUSPENDED"
  | "WEAK_PASSWORD"
  | "EMAIL_EXISTS"
  | "EMAIL_INVALID"
  | "NAME_REQUIRED"
  | "NETWORK"
  | "RATE_LIMITED"
  | "CSRF"
  | "UNKNOWN";

/**
 * Thrown by AuthClient methods on any non-2xx response (or network failure).
 * Carries a stable `code` derived from either the HTTP status or the
 * backend's `error` body field.
 */
export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly status: number;

  constructor(code: AuthErrorCode, message: string, status = 0) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Body shape returned by /auth/login, /auth/register, /auth/me.
 * Mirrors §5.1 of the plan.
 */
export type AuthMeResponse = {
  user: AuthUser;
};

/**
 * Backend error body shape, e.g. `{ "error": "INVALID_CREDENTIALS", "message": "..." }`.
 * `error` may be missing on 5xx; we then fall back to status-derived codes.
 */
export type BackendErrorBody = {
  error?: string;
  message?: string;
};

/**
 * Configuration accepted by `AuthClient`. Mirrors the AuthGate component's
 * props — see §6.1 of the plan.
 */
export type AuthClientConfig = {
  apiBase: string;
  loginPath: string;
  registerPath: string;
  logoutPath: string;
  mePath: string;
  xsrfCookieName: string;
  xsrfHeaderName: string;
};
