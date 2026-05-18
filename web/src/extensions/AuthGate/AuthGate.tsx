// =====================================================================================================================
// AuthGate — headless auth state machine for an XMLUI app
// =====================================================================================================================
//
// Renders nothing visible. Drives a state machine that bootstraps the session
// against `/auth/me`, exposes the current `{ kind, user, loading, error }`
// snapshot via XMLUI's `value` mechanism, and registers `signIn` / `register`
// / `signOut` / `can` / `fetch` as callable APIs.
//
// The XMLUI markup uses `auth.value.kind` etc. to gate UI, and calls
// `auth.signIn(email, password)` / `auth.signOut()` from event handlers.
// HttpOnly cookie + credentials: 'include' handle the actual session — no
// token ever lives in JS state. See AUTH_GATE_PLAN.md (v2).

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import { AuthClient } from "./authClient";
import {
  AuthClientConfig,
  AuthError,
  AuthErrorCode,
  AuthState,
  AuthUser,
  SignOutReason,
} from "./types";

type UpdateStateFn = (
  newState: Record<string, unknown>,
  options?: { initial?: boolean },
) => void;

type RegisterApiCb = (
  apis: Record<string, (...args: unknown[]) => unknown>,
) => void;

export type AuthGateProps = Partial<AuthClientConfig> & {
  apiBase: string;
  idleTimeoutSeconds?: number;
  idleWarningSeconds?: number;

  onSignIn?: (payload: { user: AuthUser }) => void;
  onSignOut?: (payload: { reason: SignOutReason }) => void;
  onAuthError?: (payload: { kind: AuthErrorCode; message: string }) => void;
  onBootstrap?: (payload: { authenticated: boolean }) => void;
  onIdleWarning?: (payload: { secondsUntilTimeout: number }) => void;

  updateState?: UpdateStateFn;
  registerComponentApi?: RegisterApiCb;
};

type Action =
  | { kind: "BOOTSTRAP_OK"; user: AuthUser }
  | { kind: "BOOTSTRAP_FAIL" }
  | { kind: "AUTH_REQUEST" }
  | { kind: "AUTH_OK"; user: AuthUser }
  | { kind: "AUTH_FAIL"; message: string }
  | { kind: "SIGNED_OUT" };

function reducer(state: AuthState, action: Action): AuthState {
  switch (action.kind) {
    case "BOOTSTRAP_OK":
      return { kind: "authenticated", user: action.user };
    case "BOOTSTRAP_FAIL":
      return { kind: "unauthenticated", loading: false, error: null };
    case "AUTH_REQUEST":
      return state.kind === "unauthenticated"
        ? { ...state, loading: true, error: null }
        : { kind: "unauthenticated", loading: true, error: null };
    case "AUTH_OK":
      return { kind: "authenticated", user: action.user };
    case "AUTH_FAIL":
      return { kind: "unauthenticated", loading: false, error: action.message };
    case "SIGNED_OUT":
      return { kind: "unauthenticated", loading: false, error: null };
    default:
      return state;
  }
}

const DEFAULT_PATHS: Pick<
  AuthClientConfig,
  "loginPath" | "registerPath" | "logoutPath" | "mePath" | "xsrfCookieName" | "xsrfHeaderName"
> = {
  loginPath: "/auth/login",
  registerPath: "/auth/register",
  logoutPath: "/auth/logout",
  mePath: "/auth/me",
  xsrfCookieName: "XSRF-TOKEN",
  xsrfHeaderName: "X-XSRF-TOKEN",
};

export function AuthGate(props: AuthGateProps) {
  const {
    apiBase,
    idleTimeoutSeconds = 0,
    idleWarningSeconds = 0,
    onSignIn,
    onSignOut,
    onAuthError,
    onBootstrap,
    onIdleWarning,
    updateState,
    registerComponentApi,
  } = props;

  const cfg: AuthClientConfig = useMemo(
    () => ({
      apiBase,
      loginPath: props.loginPath ?? DEFAULT_PATHS.loginPath,
      registerPath: props.registerPath ?? DEFAULT_PATHS.registerPath,
      logoutPath: props.logoutPath ?? DEFAULT_PATHS.logoutPath,
      mePath: props.mePath ?? DEFAULT_PATHS.mePath,
      xsrfCookieName: props.xsrfCookieName ?? DEFAULT_PATHS.xsrfCookieName,
      xsrfHeaderName: props.xsrfHeaderName ?? DEFAULT_PATHS.xsrfHeaderName,
    }),
    [
      apiBase,
      props.loginPath,
      props.registerPath,
      props.logoutPath,
      props.mePath,
      props.xsrfCookieName,
      props.xsrfHeaderName,
    ],
  );

  const clientRef = useRef<AuthClient | null>(null);
  if (clientRef.current === null) clientRef.current = new AuthClient(cfg);
  useEffect(() => {
    clientRef.current = new AuthClient(cfg);
  }, [cfg]);

  const [state, dispatch] = useReducer(reducer, { kind: "bootstrapping" });

  const stateRef = useRef<AuthState>(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Mirror reducer state into XMLUI's `value` mechanism so markup can bind to
  // `auth.value.kind`, `auth.value.user`, `auth.value.loading`, `auth.value.error`.
  useEffect(() => {
    if (!updateState) return;
    let value: {
      kind: AuthState["kind"];
      user: AuthUser | null;
      loading: boolean;
      error: string | null;
    };
    if (state.kind === "bootstrapping") {
      value = { kind: state.kind, user: null, loading: false, error: null };
    } else if (state.kind === "unauthenticated") {
      value = {
        kind: state.kind,
        user: null,
        loading: state.loading,
        error: state.error,
      };
    } else {
      value = { kind: state.kind, user: state.user, loading: false, error: null };
    }
    updateState({ value });
  }, [state, updateState]);

  const emitAuthError = useCallback(
    (e: unknown) => {
      const code: AuthErrorCode = e instanceof AuthError ? e.code : "UNKNOWN";
      const message = e instanceof Error ? e.message : "Something went wrong";
      onAuthError?.({ kind: code, message });
    },
    [onAuthError],
  );

  // Bootstrap on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await clientRef.current!.me();
        if (cancelled) return;
        dispatch({ kind: "BOOTSTRAP_OK", user });
        onBootstrap?.({ authenticated: true });
        // NB: do not fire onSignIn from the bootstrap path — that turns a
        // page reload into a fresh sign-in and Main.xmlui's
        // `onSignIn="Actions.navigate('/')"` would clobber the deep-linked
        // route on every refresh. onSignIn is reserved for the interactive
        // `signIn()` / `register()` flows below.
      } catch {
        if (cancelled) return;
        dispatch({ kind: "BOOTSTRAP_FAIL" });
        onBootstrap?.({ authenticated: false });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<void> => {
      dispatch({ kind: "AUTH_REQUEST" });
      try {
        const user = await clientRef.current!.login(email, password);
        dispatch({ kind: "AUTH_OK", user });
        onSignIn?.({ user });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Sign-in failed";
        dispatch({ kind: "AUTH_FAIL", message });
        emitAuthError(e);
      }
    },
    [emitAuthError, onSignIn],
  );

  const register = useCallback(
    async (email: string, password: string, name: string): Promise<void> => {
      dispatch({ kind: "AUTH_REQUEST" });
      try {
        const user = await clientRef.current!.register(email, password, name);
        dispatch({ kind: "AUTH_OK", user });
        onSignIn?.({ user });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Registration failed";
        dispatch({ kind: "AUTH_FAIL", message });
        emitAuthError(e);
      }
    },
    [emitAuthError, onSignIn],
  );

  const signOutWithReason = useCallback(
    async (reason: SignOutReason): Promise<void> => {
      try {
        await clientRef.current!.logout();
      } catch {
        // best-effort
      }
      if (stateRef.current.kind !== "unauthenticated") {
        dispatch({ kind: "SIGNED_OUT" });
        onSignOut?.({ reason });
      }
    },
    [onSignOut],
  );

  const signOut = useCallback(() => signOutWithReason("user"), [signOutWithReason]);

  const authFetch = useCallback(
    async (
      input: RequestInfo | URL,
      init: RequestInit = {},
    ): Promise<Response> => {
      const res = await clientRef.current!.fetch(input, init);
      if (res.status === 401 && stateRef.current.kind === "authenticated") {
        dispatch({ kind: "SIGNED_OUT" });
        onSignOut?.({ reason: "expired" });
      }
      return res;
    },
    [onSignOut],
  );

  const can = useCallback((perm: string): boolean => {
    const s = stateRef.current;
    return s.kind === "authenticated" && s.user.permissions.includes(perm);
  }, []);

  // Idle timer (UX layer; the backend remains the source of truth).
  useEffect(() => {
    if (state.kind !== "authenticated") return;
    if (idleTimeoutSeconds <= 0) return;

    const idleMs = idleTimeoutSeconds * 1000;
    const warnMs = Math.max(0, idleMs - idleWarningSeconds * 1000);

    let signOutTimer: number | null = null;
    let warnTimer: number | null = null;
    let warned = false;

    const reset = () => {
      if (signOutTimer != null) window.clearTimeout(signOutTimer);
      if (warnTimer != null) window.clearTimeout(warnTimer);
      warned = false;

      if (idleWarningSeconds > 0 && warnMs < idleMs) {
        warnTimer = window.setTimeout(() => {
          if (warned) return;
          warned = true;
          onIdleWarning?.({ secondsUntilTimeout: idleWarningSeconds });
        }, warnMs);
      }
      signOutTimer = window.setTimeout(() => {
        signOutWithReason("idle");
      }, idleMs);
    };

    const events: (keyof DocumentEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "wheel",
      "touchstart",
    ];
    for (const ev of events) document.addEventListener(ev, reset, { passive: true });
    reset();

    return () => {
      for (const ev of events) document.removeEventListener(ev, reset);
      if (signOutTimer != null) window.clearTimeout(signOutTimer);
      if (warnTimer != null) window.clearTimeout(warnTimer);
    };
  }, [state.kind, idleTimeoutSeconds, idleWarningSeconds, onIdleWarning, signOutWithReason]);

  // Imperative API for the markup (auth.signIn(...), auth.signOut(), etc.).
  useEffect(() => {
    if (!registerComponentApi) return;
    registerComponentApi({
      signIn: ((email: string, password: string) =>
        signIn(email, password)) as unknown as (...args: unknown[]) => unknown,
      register: ((email: string, password: string, name: string) =>
        register(email, password, name)) as unknown as (...args: unknown[]) => unknown,
      signOut: (() => signOut()) as unknown as (...args: unknown[]) => unknown,
      can: ((perm: string) => can(perm)) as unknown as (...args: unknown[]) => unknown,
      fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
        authFetch(input, init)) as unknown as (...args: unknown[]) => unknown,
    });
  }, [registerComponentApi, signIn, register, signOut, can, authFetch]);

  return null;
}

export default AuthGate;
