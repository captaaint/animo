import cx from "classnames";
import { useSyncExternalStore } from "react";

import { Icon } from "./Icon";

// Minimal global toast store: `toast.success("Entry saved")` from anywhere,
// rendered by the single <Toaster /> mounted in App.

type ToastKind = "success" | "error";
type ToastItem = { id: number; kind: ToastKind; message: string };

const DURATION_MS = 4000;
let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function push(kind: ToastKind, message: string) {
  const id = nextId++;
  items = [...items, { id, kind, message }];
  emit();
  window.setTimeout(() => dismiss(id), DURATION_MS);
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (message: string) => push("success", message),
  error: (message: string) => push("error", message),
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function Toaster() {
  const current = useSyncExternalStore(subscribe, () => items);
  return (
    <div className="toaster" aria-live="polite">
      {current.map((t) => (
        <div key={t.id} role="status" className={cx("toast", `toast--${t.kind}`)}>
          <Icon name={t.kind === "success" ? "check" : "warning"} size={16} />
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
