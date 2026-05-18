import { useEffect, useLayoutEffect, useRef } from "react";
import { useThemes } from "xmlui";

const STORAGE_KEY = "tt:theme-tone";

// Headless component that bridges localStorage <-> XMLUI's active theme tone.
//
// On mount: synchronously reads the saved tone in useLayoutEffect — which runs
// after the initial commit but before the browser paints — so we apply the
// saved tone before the user ever sees the default. Without this (or with an
// async API roundtrip) the default tone would flash for one or more frames.
//
// On every tone change after mount: persists the new tone so a future load
// can restore it. Both ToneChangerButton clicks and any other code that calls
// setActiveThemeTone are captured.
export function TonePersist() {
  const { activeThemeTone, setActiveThemeTone } = useThemes();
  const restoredRef = useRef(false);

  useLayoutEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      // localStorage may be unavailable (Safari private mode, sandboxed
      // iframes). Fall through and leave the default tone in place.
    }
    if ((saved === "light" || saved === "dark") && saved !== activeThemeTone) {
      setActiveThemeTone(saved);
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

  return null;
}

export default TonePersist;
