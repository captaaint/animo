import { useEffect, useLayoutEffect, useRef } from "react";
import { useThemes } from "xmlui";

const STORAGE_KEY = "tt:theme-tone";

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
      // localStorage may be unavailable (Safari private mode, sandboxed iframes).
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
      // Ignore write failures.
    }
  }, [activeThemeTone]);

  return null;
}

export default TonePersist;
