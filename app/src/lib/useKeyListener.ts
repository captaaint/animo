import { useEffect, useRef } from "react";

export type KeyListenerOptions = {
  /** Comma-separated key names to listen for, e.g. "Enter,Escape". Default: "Enter". */
  keys?: string;
  /** When false the listener is detached (e.g. while a dialog is closed). */
  enabled?: boolean;
  /** Skip the listener when modifier keys (Shift/Ctrl/Meta/Alt) are held. */
  ignoreWithModifiers?: boolean;
  /**
   * Skip the listener when focus is in an editable element (input, textarea,
   * select, or contenteditable). Off by default so editor shortcuts like
   * Enter-to-save keep firing from inside a field; turn on for app-wide
   * single-key shortcuts that must not hijack normal typing.
   */
  ignoreInInputs?: boolean;
  /**
   * A single modifier chord such as "Alt+T" or "Ctrl+Shift+K". When set it
   * replaces `keys` / `ignoreWithModifiers`: the listener fires only when
   * exactly these modifiers are held together with the key, and the browser
   * default is suppressed (so e.g. macOS Option+T doesn't type "†").
   * Letters and digits match by physical key (`KeyboardEvent.code`), so the
   * chord works regardless of keyboard layout or what the modifier produces.
   */
  chord?: string;
  /** Fired for any matching key. Payload: { key }. */
  onKey?: (payload: { key: string }) => void;
  /** Convenience event for Enter specifically. Payload: { key }. */
  onEnter?: (payload: { key: string }) => void;
  /** Convenience event for Escape specifically. Payload: { key }. */
  onEscape?: (payload: { key: string }) => void;
};

type ParsedChord = {
  alt: boolean;
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
  key: string;
};

function parseChord(chord: string): ParsedChord | null {
  const parts = chord
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  const key = parts.pop();
  if (!key) return null;
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  return {
    alt: mods.has("alt") || mods.has("option"),
    ctrl: mods.has("ctrl") || mods.has("control"),
    shift: mods.has("shift"),
    meta: mods.has("meta") || mods.has("cmd") || mods.has("command"),
    key,
  };
}

function matchesChord(e: KeyboardEvent, c: ParsedChord): boolean {
  if (e.altKey !== c.alt || e.ctrlKey !== c.ctrl) return false;
  if (e.shiftKey !== c.shift || e.metaKey !== c.meta) return false;
  if (/^[a-z]$/i.test(c.key)) return e.code === `Key${c.key.toUpperCase()}`;
  if (/^[0-9]$/.test(c.key)) return e.code === `Digit${c.key}`;
  return e.key.toLowerCase() === c.key.toLowerCase();
}

// True when the event originates from (or focus sits in) an editable element,
// so an app-wide single-key shortcut shouldn't swallow the keystroke.
function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.isContentEditable === true;
}

/** Window-level keyboard shortcut listener. */
export function useKeyListener(options: KeyListenerOptions) {
  const {
    keys = "Enter",
    enabled = true,
    ignoreWithModifiers = true,
    ignoreInInputs = false,
    chord,
    onKey,
    onEnter,
    onEscape,
  } = options;

  // Refs so the handler picks up the latest callbacks without re-binding.
  const onKeyRef = useRef<typeof onKey>(undefined);
  const onEnterRef = useRef<typeof onEnter>(undefined);
  const onEscapeRef = useRef<typeof onEscape>(undefined);
  onKeyRef.current = onKey;
  onEnterRef.current = onEnter;
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!enabled) return;
    const parsedChord = chord ? parseChord(chord) : null;
    if (parsedChord) {
      const chordHandler = (e: KeyboardEvent) => {
        if (e.repeat || !matchesChord(e, parsedChord)) return;
        if (ignoreInInputs && isEditableTarget(e.target)) return;
        e.preventDefault();
        onKeyRef.current?.({ key: chord! });
      };
      window.addEventListener("keydown", chordHandler);
      return () => window.removeEventListener("keydown", chordHandler);
    }
    const watched = new Set(
      keys
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
    );
    const handler = (e: KeyboardEvent) => {
      if (!watched.has(e.key)) return;
      if (ignoreWithModifiers && (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey)) return;
      if (ignoreInInputs && isEditableTarget(e.target)) return;
      const payload = { key: e.key };
      onKeyRef.current?.(payload);
      if (e.key === "Enter") onEnterRef.current?.(payload);
      else if (e.key === "Escape") onEscapeRef.current?.(payload);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, keys, ignoreWithModifiers, ignoreInInputs, chord]);
}
