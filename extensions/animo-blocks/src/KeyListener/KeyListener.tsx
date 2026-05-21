import { useEffect, useRef } from "react";

export type KeyListenerProps = {
  /** Comma-separated key names to listen for, e.g. "Enter,Escape". Default: "Enter". */
  keys?: string;
  /** When false the listener is detached (useful with `enabled="{modalOpen}"`). */
  enabled?: boolean;
  /** Skip the listener when modifier keys (Shift/Ctrl/Meta/Alt) are held. */
  ignoreWithModifiers?: boolean;
  /** Fired for any matching key. Payload: { key }. */
  onKey?: (payload: { key: string }) => void;
  /** Convenience event for Enter specifically. Payload: { key }. */
  onEnter?: (payload: { key: string }) => void;
  /** Convenience event for Escape specifically. Payload: { key }. */
  onEscape?: (payload: { key: string }) => void;
};

export function KeyListener(props: KeyListenerProps) {
  const {
    keys = "Enter",
    enabled = true,
    ignoreWithModifiers = true,
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
      const payload = { key: e.key };
      onKeyRef.current?.(payload);
      if (e.key === "Enter") onEnterRef.current?.(payload);
      else if (e.key === "Escape") onEscapeRef.current?.(payload);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, keys, ignoreWithModifiers]);

  return null;
}

export default KeyListener;
