// =====================================================================================================================
// AuthGate — XMLUI extension registration (headless)
// =====================================================================================================================
//
// AuthGate is a non-visual state component. Markup mounts a single instance
// (`<AuthGate id="auth" apiBase="..." />`) inside `<App>`, then gates UI with
// `auth.value.kind === 'authenticated'` etc. and calls `auth.signIn(...)`,
// `auth.signOut()`, etc. via the registered component API. See AUTH_GATE_PLAN.md (v2).

import { createComponentRenderer, createMetadata } from "xmlui";
import { AuthGate } from "./AuthGate";

const metadata = createMetadata({
  status: "experimental",
  description:
    "Headless authentication state machine. Bootstraps the session against " +
    "/auth/me on mount, exposes `{ kind, user, loading, error }` via `value`, " +
    "and registers `signIn`, `register`, `signOut`, `can`, `fetch` as APIs. " +
    "Holds NO session token in JavaScript — the cookie is HttpOnly and managed " +
    "by the backend.",
  props: {
    apiBase: {
      description:
        "Base URL of the backend auth API, e.g. \"http://localhost:8080/api\".",
      valueType: "string",
    },
    loginPath: {
      description: "POST endpoint for sign-in.",
      valueType: "string",
      defaultValue: "/auth/login",
    },
    registerPath: {
      description: "POST endpoint for new-account registration.",
      valueType: "string",
      defaultValue: "/auth/register",
    },
    logoutPath: {
      description: "POST endpoint for sign-out (server-side session revocation).",
      valueType: "string",
      defaultValue: "/auth/logout",
    },
    mePath: {
      description:
        "GET endpoint that returns the current user payload. Called once at " +
        "mount to bootstrap the session.",
      valueType: "string",
      defaultValue: "/auth/me",
    },
    xsrfCookieName: {
      description:
        "Name of the cookie carrying the CSRF token (the backend sets it; " +
        "JavaScript reads it). Default matches the XMLUI/Spring/Rails convention.",
      valueType: "string",
      defaultValue: "XSRF-TOKEN",
    },
    xsrfHeaderName: {
      description:
        "Name of the HTTP header that echoes the CSRF token on state-changing " +
        "requests. The backend's CSRF middleware must check this header.",
      valueType: "string",
      defaultValue: "X-XSRF-TOKEN",
    },
    idleTimeoutSeconds: {
      description:
        "Client-side idle window in seconds. Mirror the backend's idle timeout. " +
        "0 disables the local timer (server still enforces).",
      valueType: "number",
      defaultValue: 0,
    },
    idleWarningSeconds: {
      description:
        "If > 0 and idleTimeoutSeconds > 0, fire the `idleWarning` event this " +
        "many seconds before the local sign-out so the UI can show a warning.",
      valueType: "number",
      defaultValue: 0,
    },
  },
  events: {
    signIn: {
      description: "Fired after a successful sign-in or registration.",
    },
    signOut: {
      description:
        "Fired after sign-out. Payload `{ reason: 'user' | 'idle' | 'expired' | 'revoked' }`.",
    },
    authError: {
      description:
        "Fired on any auth failure. Payload `{ kind, message }` where kind is " +
        "a stable error code (INVALID_CREDENTIALS, ACCOUNT_LOCKED, ...).",
    },
    bootstrap: {
      description:
        "Fired once after the initial /auth/me check completes. Payload " +
        "`{ authenticated: boolean }`.",
    },
    idleWarning: {
      description:
        "Fired N seconds before a local idle sign-out (N = idleWarningSeconds).",
    },
  },
  apis: {
    signIn: {
      signature: "signIn(email: string, password: string): Promise<void>",
      description:
        "Sign in with email + password. Resolves on success; on failure, " +
        "updates `value.error` and fires the `authError` event.",
    },
    register: {
      signature:
        "register(email: string, password: string, name: string): Promise<void>",
      description: "Register a new account; auto-signs the user in on success.",
    },
    signOut: {
      signature: "signOut(): Promise<void>",
      description: "Sign out the current user. Best-effort — never throws.",
    },
    can: {
      signature: "can(permission: string): boolean",
      description:
        "Returns true if the current user's permission list contains `permission`. " +
        "UI-only — never use as an authorization check (the backend decides).",
    },
    fetch: {
      signature: "fetch(input: RequestInfo, init?: RequestInit): Promise<Response>",
      description:
        "Cookie-bearing fetch wrapper. Adds the XSRF header for state-changing " +
        "methods and forces credentials: 'include'.",
    },
  },
  nonVisual: true,
});

export const authGateRenderer = createComponentRenderer(
  "AuthGate",
  metadata,
  ({ node, extractValue, updateState, registerComponentApi, lookupEventHandler }) => {
    return (
      <AuthGate
        apiBase={extractValue.asString(node.props.apiBase)!}
        loginPath={extractValue.asOptionalString(node.props.loginPath)}
        registerPath={extractValue.asOptionalString(node.props.registerPath)}
        logoutPath={extractValue.asOptionalString(node.props.logoutPath)}
        mePath={extractValue.asOptionalString(node.props.mePath)}
        xsrfCookieName={extractValue.asOptionalString(node.props.xsrfCookieName)}
        xsrfHeaderName={extractValue.asOptionalString(node.props.xsrfHeaderName)}
        idleTimeoutSeconds={extractValue.asOptionalNumber(node.props.idleTimeoutSeconds)}
        idleWarningSeconds={extractValue.asOptionalNumber(node.props.idleWarningSeconds)}
        onSignIn={lookupEventHandler("signIn")}
        onSignOut={lookupEventHandler("signOut")}
        onAuthError={lookupEventHandler("authError")}
        onBootstrap={lookupEventHandler("bootstrap")}
        onIdleWarning={lookupEventHandler("idleWarning")}
        updateState={updateState}
        registerComponentApi={registerComponentApi}
      />
    );
  },
);

export default {
  namespace: "XMLUIExtensions",
  components: [authGateRenderer],
};
