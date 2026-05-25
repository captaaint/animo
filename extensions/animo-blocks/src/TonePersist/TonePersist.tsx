import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useThemes } from "xmlui";

const STORAGE_KEY = "tt:theme-tone";
const PREF_STORAGE_KEY = "tt:theme-pref";

type RegisterApiCb = (
  apis: Record<string, (...args: unknown[]) => unknown>,
) => void;

type TonePersistProps = {
  registerComponentApi?: RegisterApiCb;
};

function resolveSystemTone(): "light" | "dark" {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

// Headless component that bridges localStorage <-> XMLUI's active theme tone
// and exposes a `setTone` API callable from markup (e.g. a Select in Settings).
//
// On mount: synchronously reads the saved preference / tone in useLayoutEffect
// — which runs after the initial commit but before the browser paints — so we
// apply the saved tone before the user ever sees the default. Without this
// (or with an async API roundtrip) the default tone would flash for one or
// more frames.
//
// Persisted keys:
//   tt:theme-tone — the resolved tone ("light" | "dark") that XMLUI runs with.
//   tt:theme-pref — the user-facing preference ("system" | "light" | "dark"),
//                   so a future load can re-resolve "system" against the
//                   current OS setting instead of being frozen to whatever
//                   was concrete at save time.
export function TonePersist(props: TonePersistProps) {
  const { registerComponentApi } = props;
  const { activeThemeTone, setActiveThemeTone } = useThemes();
  const restoredRef = useRef(false);

  useLayoutEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    let pref: string | null = null;
    let saved: string | null = null;
    try {
      pref = localStorage.getItem(PREF_STORAGE_KEY);
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      // localStorage may be unavailable (Safari private mode, sandboxed
      // iframes). Fall through and leave the default tone in place.
    }
    const target =
      pref === "system"
        ? resolveSystemTone()
        : pref === "light" || pref === "dark"
          ? pref
          : saved === "light" || saved === "dark"
            ? saved
            : null;
    if (target && target !== activeThemeTone) {
      setActiveThemeTone(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restoredRef.current) return;
    if (activeThemeTone !== "light" && activeThemeTone !== "dark") return;
    try {
      localStorage.setItem(STORAGE_KEY, activeThemeTone);
    } catch {
      // Ignore write failures — UX still works for the current session.
    }
  }, [activeThemeTone]);

  const setTone = useCallback(
    (raw: unknown) => {
      const value = typeof raw === "string" ? raw : "system";
      const pref =
        value === "light" || value === "dark" || value === "system"
          ? value
          : "system";
      try {
        localStorage.setItem(PREF_STORAGE_KEY, pref);
      } catch {
        // ignore
      }
      const target = pref === "system" ? resolveSystemTone() : pref;
      if (target !== activeThemeTone) {
        setActiveThemeTone(target);
      }
    },
    [activeThemeTone, setActiveThemeTone],
  );

  useEffect(() => {
    registerComponentApi?.({
      setTone: ((v: unknown) => {
        setTone(v);
      }) as unknown as (...args: unknown[]) => unknown,
    });
  }, [registerComponentApi, setTone]);

  return null;
}

export default TonePersist;
