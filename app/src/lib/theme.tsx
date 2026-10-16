import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "tt:theme-tone";
const PREF_STORAGE_KEY = "tt:theme-pref";

export type Tone = "light" | "dark";
export type ThemePref = "system" | Tone;

function resolveSystemTone(): Tone {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // localStorage may be unavailable (Safari private mode, sandboxed
    // iframes). Fall through and leave the default tone in place.
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore write failures — UX still works for the current session.
  }
}

function normalizePref(raw: unknown): ThemePref {
  return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
}

/**
 * The tone to start with, resolved synchronously from localStorage so the
 * first paint already uses the saved tone (no flash of the default).
 *
 * Persisted keys:
 *   tt:theme-tone — the resolved tone ("light" | "dark") the app runs with.
 *   tt:theme-pref — the user-facing preference ("system" | "light" | "dark"),
 *                   so a future load can re-resolve "system" against the
 *                   current OS setting instead of being frozen to whatever
 *                   was concrete at save time.
 */
export function initialTone(): Tone {
  const pref = readStorage(PREF_STORAGE_KEY);
  if (pref === "system") return resolveSystemTone();
  if (pref === "light" || pref === "dark") return pref;
  const saved = readStorage(STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return "light";
}

export function applyTone(tone: Tone) {
  document.documentElement.dataset.tone = tone;
}

type ThemeContextValue = {
  tone: Tone;
  /** Apply a preference immediately and persist it. */
  setPreference: (pref: ThemePref) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [tone, setTone] = useState<Tone>(initialTone);

  useEffect(() => {
    applyTone(tone);
    writeStorage(STORAGE_KEY, tone);
  }, [tone]);

  const setPreference = useCallback((raw: ThemePref) => {
    const pref = normalizePref(raw);
    writeStorage(PREF_STORAGE_KEY, pref);
    setTone(pref === "system" ? resolveSystemTone() : pref);
  }, []);

  const value = useMemo(() => ({ tone, setPreference }), [tone, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
