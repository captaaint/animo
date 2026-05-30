import { useEffect, useRef } from "react";

export type KeyListenerProps = {
  /** Comma-separated key names to listen for, e.g. "Enter,Escape". Default: "Enter". */
  keys?: string;
  /** When false the listener is detached (useful with `enabled="{modalOpen}"`). */
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
  /** Fired for any matching key. Payload: { key }. */
  onKey?: (payload: { key: string }) => void;
  /** Convenience event for Enter specifically. Payload: { key }. */
  onEnter?: (payload: { key: string }) => void;
  /** Convenience event for Escape specifically. Payload: { key }. */
  onEscape?: (payload: { key: string }) => void;
};

// True when the event originates from (or focus sits in) an editable element,
// so an app-wide single-key shortcut shouldn't swallow the keystroke.
function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.isContentEditable === true;
}

export function KeyListener(props: KeyListenerProps) {
  const {
    keys = "Enter",
    enabled = true,
    ignoreWithModifiers = true,
    ignoreInInputs = false,
    onKey,
    onEnter,
    onEscape,
  } = props;

  // Refs so the handler picks up the latest callbacks without re-binding.
  const onKeyRef = useRef<typeof onKey>(undefined);
  const onEnterRef = useRef<typeof onEnter>(undefined);
  const onEscapeRef = useRef<typeof onEscape>(undefined);
  onKeyRef.current = onKey;
  onEnterRef.current = onEnter;
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!enabled) return;
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
  }, [enabled, keys, ignoreWithModifiers, ignoreInInputs]);

  return null;
}

export default KeyListener;
