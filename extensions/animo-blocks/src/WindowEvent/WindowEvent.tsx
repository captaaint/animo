import { useEffect, useRef } from "react";

export type WindowEventProps = {
  eventName?: string;
  enabled?: boolean;
  onMessage?: (payload: unknown) => void;
};

export function WindowEvent(props: WindowEventProps) {
  const { eventName = "tt:message", enabled = true, onMessage } = props;

  const onMessageRef = useRef<typeof onMessage>(undefined);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!enabled || !eventName) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      onMessageRef.current?.(detail);
    };
    window.addEventListener(eventName, handler as EventListener);
    return () => window.removeEventListener(eventName, handler as EventListener);
  }, [eventName, enabled]);

  return null;
}

export default WindowEvent;
