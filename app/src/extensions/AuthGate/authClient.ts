// =====================================================================================================================
// AuthGate — backend HTTP client
// =====================================================================================================================
//
// A pure transport layer with NO React deps and NO state. Each method is
// idempotent w.r.t. its inputs — the AuthGate component owns all session-state
// mutations. See AUTH_GATE_PLAN.md §10.2 for the API surface.
//
// Security invariants enforced here:
//   1. Every request uses `credentials: "include"` so the HttpOnly session
//      cookie travels with cross-origin calls.
//   2. State-changing requests (POST/PATCH/PUT/DELETE) read the XSRF-TOKEN
//      cookie and echo it as the X-XSRF-TOKEN header. The cookie itself is
//      Lax-scoped, so an attacker on another origin can neither read it
//      nor cause it to be sent — but the double-submit defense closes the
//      one remaining gap (browsers that mis-handle SameSite, etc).
//   3. Errors NEVER leak credentials or cookie values into thrown messages.

import {
  AuthClientConfig,
  AuthError,
  AuthErrorCode,
  AuthMeResponse,
  AuthUser,
  BackendErrorBody,
} from "./types";

const STATE_CHANGING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

const STATUS_TO_CODE: Record<number, AuthErrorCode> = {
  401: "INVALID_CREDENTIALS",
  403: "ACCOUNT_SUSPENDED",
  423: "ACCOUNT_LOCKED",
  429: "RATE_LIMITED",
};

export class AuthClient {
  constructor(private readonly cfg: AuthClientConfig) {}

  // -------------------------------------------------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------------------------------------------------

  /** GET /auth/me. Used for bootstrap. Throws AuthError on 401. */
  async me(): Promise<AuthUser> {
    const res = await this.rawFetch(this.cfg.mePath, { method: "GET" });
    return this.unwrapAuthResponse(res);
  }

  /** POST /auth/login. Returns the AuthUser on success; throws AuthError on failure. */
  async login(email: string, password: string): Promise<AuthUser> {
    const res = await this.rawFetch(this.cfg.loginPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return this.unwrapAuthResponse(res);
  }

  /** POST /auth/register. Returns the AuthUser on success; throws AuthError on failure. */
  async register(
    email: string,
    password: string,
    name: string,
  ): Promise<AuthUser> {
    const res = await this.rawFetch(this.cfg.registerPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    return this.unwrapAuthResponse(res);
  }

  /** POST /auth/logout. Best-effort — never throws (the user is "out" either way). */
  async logout(): Promise<void> {
    try {
      await this.rawFetch(this.cfg.logoutPath, { method: "POST" });
    } catch {
      // Swallow: signOut UX must not depend on the backend ack.
    }
  }

  /**
   * Authenticated `fetch` wrapper for downstream API calls. Adds CSRF header
   * for state-changing methods and forces credentials to be sent.
   *
   * Caller is responsible for inspecting the response (e.g. handling 401 by
   * dropping back to the unauthenticated screen). The AuthGate component
   * does this on top of the same wrapper.
   */
  fetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    return this.rawFetch(input, init, /* prependApiBase */ false);
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------------------------------------------------

  private async rawFetch(
    input: RequestInfo | URL,
    init: RequestInit,
    prependApiBase = true,
  ): Promise<Response> {
    const url =
      prependApiBase && typeof input === "string"
        ? this.joinUrl(input)
        : input;
    const method = (init.method || "GET").toUpperCase();
    const headers = new Headers(init.headers || {});

    if (STATE_CHANGING_METHODS.has(method)) {
      const xsrf = readCookie(this.cfg.xsrfCookieName);
      if (xsrf) headers.set(this.cfg.xsrfHeaderName, xsrf);
    }

    try {
      return await fetch(url, {
        ...init,
        method,
        headers,
        credentials: "include",
      });
    } catch (e) {
      // Network / DNS / CORS preflight failure.
      throw new AuthError("NETWORK", networkErrorMessage(e), 0);
    }
  }

  private joinUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    const base = this.cfg.apiBase.replace(/\/+$/, "");
    const p = path.startsWith("/") ? path : "/" + path;
    return base + p;
  }

  /**
   * Parses a /auth/me-shaped response and converts non-2xx into AuthError
   * with a stable `code`. Never includes credentials in error messages.
   */
  private async unwrapAuthResponse(res: Response): Promise<AuthUser> {
    if (res.ok) {
      const body = (await safeJson<AuthMeResponse>(res)) || ({} as AuthMeResponse);
      if (!body.user || typeof body.user.id !== "string") {
        throw new AuthError(
          "UNKNOWN",
          "Malformed /auth response — missing user object",
          res.status,
        );
      }
      return body.user;
    }

    const body = (await safeJson<BackendErrorBody>(res)) || {};
    const code = mapErrorCode(res.status, body.error);
    const message = body.message || defaultMessageFor(code);
    throw new AuthError(code, message, res.status);
  }
}

// =====================================================================================================================
// Helpers
// =====================================================================================================================

/**
 * Read a cookie by name from `document.cookie` without a regex allocation per
 * call. Returns null if the cookie is absent. Handles values containing `=`
 * (the value is everything after the first `=` up to the next `;`).
 */
export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const cookies = document.cookie ? document.cookie.split("; ") : [];
  for (const c of cookies) {
    const eq = c.indexOf("=");
    if (eq < 0) continue;
    if (c.slice(0, eq) === name) {
      try {
        return decodeURIComponent(c.slice(eq + 1));
      } catch {
        return c.slice(eq + 1);
      }
    }
  }
  return null;
}

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function mapErrorCode(
  status: number,
  backendError?: string,
): AuthErrorCode {
  if (backendError && KNOWN_BACKEND_ERROR_CODES.has(backendError as AuthErrorCode)) {
    return backendError as AuthErrorCode;
  }
  return STATUS_TO_CODE[status] || "UNKNOWN";
}

const KNOWN_BACKEND_ERROR_CODES: Set<AuthErrorCode> = new Set([
  "INVALID_CREDENTIALS",
  "ACCOUNT_LOCKED",
  "ACCOUNT_SUSPENDED",
  "WEAK_PASSWORD",
  "EMAIL_EXISTS",
  "EMAIL_INVALID",
  "NAME_REQUIRED",
  "NETWORK",
  "RATE_LIMITED",
  "CSRF",
  "UNKNOWN",
]);

function defaultMessageFor(code: AuthErrorCode): string {
  switch (code) {
    case "INVALID_CREDENTIALS":
      return "Invalid email or password";
    case "ACCOUNT_LOCKED":
      return "Too many failed attempts — try again later";
    case "ACCOUNT_SUSPENDED":
      return "This account has been suspended";
    case "WEAK_PASSWORD":
      return "Password does not meet the security requirements";
    case "EMAIL_EXISTS":
      return "An account with this email already exists";
    case "EMAIL_INVALID":
      return "Please enter a valid email address";
    case "NAME_REQUIRED":
      return "Name is required";
    case "NETWORK":
      return "Network error — please check your connection";
    case "RATE_LIMITED":
      return "Too many requests — please slow down";
    case "CSRF":
      return "Session security check failed — please reload the page";
    case "UNKNOWN":
    default:
      return "Something went wrong — please try again";
  }
}

function networkErrorMessage(e: unknown): string {
  if (e instanceof Error && e.message) {
    // Strip any URL or header-looking content out of the message just in case.
    return e.message.replace(/https?:\/\/\S+/gi, "[url]");
  }
  return "Network error";
}
