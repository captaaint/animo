import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type UpdateStateFn = (
  newState: Record<string, unknown>,
  options?: { initial?: boolean },
) => void;

type RegisterApiCb = (
  apis: Record<string, (...args: unknown[]) => unknown>,
) => void;

type UserPreferences = {
  id: number;
  userId: string;
  theme: string;
  uiDensity: string;
  dateFormat: string;
  timeFormat: string;
  preferencesJson: string;
  createdAt: string;
  updatedAt: string;
};

type LocalUser = {
  id: string;
  name: string;
  username: string;
  createdAt: string;
  updatedAt: string;
  preferences: UserPreferences;
};

type LocalUserState =
  | { kind: "bootstrapping"; user: null; loading: true; error: null }
  | { kind: "needs-setup"; user: null; loading: boolean; error: string | null }
  | { kind: "ready"; user: LocalUser; loading: false; error: null };

export type LocalUserGateProps = {
  apiBase?: string;
  updateState?: UpdateStateFn;
  registerComponentApi?: RegisterApiCb;
  onReady?: (payload: { user: LocalUser }) => void;
  onNeedsSetup?: () => void;
};

type BootstrapResponse = {
  setupComplete?: boolean;
  setup_complete?: boolean;
  user?: LocalUser | null;
};

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    return body.error || body.message || res.statusText || "Request failed";
  } catch {
    return res.statusText || "Request failed";
  }
}

export function LocalUserGate(props: LocalUserGateProps) {
  const { apiBase = "/api", updateState, registerComponentApi, onReady, onNeedsSetup } = props;
  const [state, setState] = useState<LocalUserState>({
    kind: "bootstrapping",
    user: null,
    loading: true,
    error: null,
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  const endpoints = useMemo(
    () => ({
      bootstrap: joinUrl(apiBase, "/user/bootstrap"),
      me: joinUrl(apiBase, "/user/me"),
    }),
    [apiBase],
  );

  useEffect(() => {
    updateState?.({ value: state });
  }, [state, updateState]);

  useEffect(() => {
    if (state.kind === "ready") onReady?.({ user: state.user });
    if (state.kind === "needs-setup") onNeedsSetup?.();
  }, [state, onReady, onNeedsSetup]);

  const refresh = useCallback(async () => {
    setState({ kind: "bootstrapping", user: null, loading: true, error: null });
    try {
      const res = await fetch(endpoints.bootstrap, { credentials: "include" });
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as BootstrapResponse;
      const complete = Boolean(body.setupComplete ?? body.setup_complete);
      if (complete && body.user) {
        setState({ kind: "ready", user: body.user, loading: false, error: null });
      } else {
        setState({ kind: "needs-setup", user: null, loading: false, error: null });
      }
    } catch {
      setState({ kind: "needs-setup", user: null, loading: false, error: null });
    }
  }, [endpoints.bootstrap]);

  const createUser = useCallback(
    async (name: string, username: string) => {
      setState({ kind: "needs-setup", user: null, loading: true, error: null });
      const res = await fetch(endpoints.bootstrap, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username }),
      });
      if (!res.ok) {
        const message = await readError(res);
        setState({ kind: "needs-setup", user: null, loading: false, error: message });
        throw new Error(message);
      }
      const user = (await res.json()) as LocalUser;
      setState({ kind: "ready", user, loading: false, error: null });
      return user;
    },
    [endpoints.bootstrap],
  );

  const updateUser = useCallback(
    async (updates: Record<string, unknown>) => {
      const res = await fetch(endpoints.me, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(await readError(res));
      const user = (await res.json()) as LocalUser;
      setState({ kind: "ready", user, loading: false, error: null });
      return user;
    },
    [endpoints.me],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    registerComponentApi?.({
      refresh: (() => refresh()) as unknown as (...args: unknown[]) => unknown,
      createUser: ((name: string, username: string) =>
        createUser(name, username)) as unknown as (...args: unknown[]) => unknown,
      updateUser: ((updates: Record<string, unknown>) =>
        updateUser(updates)) as unknown as (...args: unknown[]) => unknown,
      getValue: (() => stateRef.current) as unknown as (...args: unknown[]) => unknown,
    });
  }, [registerComponentApi, refresh, createUser, updateUser]);

  return null;
}

export default LocalUserGate;
