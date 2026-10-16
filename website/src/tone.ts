import { useEffect, useState } from "react";

// Light/dark tone. Mirrors the app: a saved preference in localStorage
// (`tt:theme-pref` = system|light|dark, or the resolved `tt:theme-tone`)
// wins; without one the site renders light. index.html applies the tone to
// <html data-tone> before first paint; this hook reads it back.

export type Tone = "light" | "dark";

export function resolveTone(): Tone {
  try {
    const pref = localStorage.getItem("tt:theme-pref");
    if (pref === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    if (pref === "light" || pref === "dark") return pref;
    const saved = localStorage.getItem("tt:theme-tone");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Storage unavailable — fall through to the default.
  }
  return "light";
}

/** The active tone. Always "light" during prerendering. */
export function useTone(): Tone {
  const [tone, setTone] = useState<Tone>("light");
  useEffect(() => {
    const t = resolveTone();
    document.documentElement.dataset.tone = t;
    setTone(t);
  }, []);
  return tone;
}
