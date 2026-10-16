import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { apiFetch } from "./api";
import type { LocalUser } from "./types";

// Local-first bootstrap: there is no login. The app checks whether the
// single local user exists and either shows the onboarding form
// (`needs-setup`) or the workspace (`ready`).
export type LocalUserState =
  | { kind: "bootstrapping"; user: null; loading: true; error: null }
  | { kind: "needs-setup"; user: null; loading: boolean; error: string | null }
  | { kind: "ready"; user: LocalUser; loading: false; error: null };

type BootstrapResponse = {
  setupComplete?: boolean;
  setup_complete?: boolean;
  user?: LocalUser | null;
};

type LocalUserContextValue = {
  state: LocalUserState;
  refresh: () => Promise<void>;
  createUser: (name: string, username: string) => Promise<LocalUser>;
  updateUser: (updates: Record<string, unknown>) => Promise<LocalUser>;
};

const LocalUserContext = createContext<LocalUserContextValue | null>(null);

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Request failed";
}

export function LocalUserProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LocalUserState>({
    kind: "bootstrapping",
    user: null,
    loading: true,
    error: null,
  });

  const refresh = useCallback(async () => {
    setState({ kind: "bootstrapping", user: null, loading: true, error: null });
    try {
      const body = await apiFetch<BootstrapResponse>("/user/bootstrap");
      const complete = Boolean(body.setupComplete ?? body.setup_complete);
      if (complete && body.user) {
        setState({ kind: "ready", user: body.user, loading: false, error: null });
      } else {
        setState({ kind: "needs-setup", user: null, loading: false, error: null });
      }
    } catch {
      setState({ kind: "needs-setup", user: null, loading: false, error: null });
    }
  }, []);

  const createUser = useCallback(async (name: string, username: string) => {
    setState({ kind: "needs-setup", user: null, loading: true, error: null });
    try {
      const user = await apiFetch<LocalUser>("/user/bootstrap", {
        method: "POST",
        body: { name, username },
      });
      setState({ kind: "ready", user, loading: false, error: null });
      return user;
    } catch (err) {
      setState({ kind: "needs-setup", user: null, loading: false, error: errorText(err) });
      throw err;
    }
  }, []);

  const updateUser = useCallback(async (updates: Record<string, unknown>) => {
    const user = await apiFetch<LocalUser>("/user/me", { method: "PATCH", body: updates });
    setState({ kind: "ready", user, loading: false, error: null });
    return user;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ state, refresh, createUser, updateUser }),
    [state, refresh, createUser, updateUser],
  );
  return <LocalUserContext.Provider value={value}>{children}</LocalUserContext.Provider>;
}

export function useLocalUser(): LocalUserContextValue {
  const ctx = useContext(LocalUserContext);
  if (!ctx) throw new Error("useLocalUser must be used inside <LocalUserProvider>");
  return ctx;
}

/** The ready user. Only call below the onboarding gate (see App.tsx). */
export function useCurrentUser(): LocalUser {
  const { state } = useLocalUser();
  if (state.kind !== "ready") throw new Error("useCurrentUser called before setup finished");
  return state.user;
}
