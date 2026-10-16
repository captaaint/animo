import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { pushSnapshot, subscribeTrayEvents } from "../helpers/tauriTray";

export type StopwatchOptions = {
  /// Short text included in tray snapshots so the OS menu reads e.g.
  /// "Running — Tray bridge" instead of just "Running". TimerBar passes
  /// the description input here; if empty the tray falls back to "Running"
  /// on its own (see `status_label` in tray.rs).
  label?: string;
  onStop?: (payload: { startTime: string; endTime: string; elapsedSec: number }) => void;
  onResume?: (payload: { description: string; projectId: string | null }) => void;
};

export type Stopwatch = {
  running: boolean;
  elapsedSec: number;
  /** `H:MM:SS` */
  display: string;
  start: () => void;
  stop: () => void;
  reset: () => void;
};

// Persist {running, startedAtMs} so the timer survives any TimerBar unmount
// (e.g. mobile navigating off Timesheet, or a page that doesn't render the
// TimerBar). On remount elapsedSec is recomputed from Date.now(), so the
// timer effectively "kept ticking" in the background. Cleared on stop/reset.
const STORAGE_KEY = "animo:stopwatch:v1";

type Persisted = {
  running: boolean;
  startedAtMs: number | null;
};

function readPersisted(): Persisted | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as Partial<Persisted> | null;
    if (!obj || typeof obj !== "object") return null;
    const running = Boolean(obj.running);
    const startedAtMs = typeof obj.startedAtMs === "number" ? obj.startedAtMs : null;
    if (!running || !startedAtMs) return null;
    return { running, startedAtMs };
  } catch {
    return null;
  }
}

function writePersisted(p: Persisted | null) {
  try {
    if (!p) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // best effort — private mode, quota, etc.
  }
}

/**
 * Second-resolution stopwatch backing the TimerBar. Persists its running
 * state, listens for `tt:resume` requests from entry rows, and — in the
 * Tauri desktop shell — mirrors its state to the tray menu and reacts to
 * tray / global-hotkey events.
 */
export function useStopwatch(options: StopwatchOptions = {}): Stopwatch {
  const { label, onStop, onResume } = options;

  const initial = useMemo(() => readPersisted(), []);

  const [running, setRunning] = useState<boolean>(initial?.running ?? false);
  // Keep the real Date instance so elapsed math stays correct, and so we can
  // re-format it on stop. The rest of the app stores ISO timestamps whose
  // HH:MM is meant to be read as wall-clock — see lib/format.ts `combineDateTime`
  // which formats local time as a fake-UTC ISO. The stopwatch follows the
  // same convention so the saved entry lands at the right slot on the grid.
  const [startedAt, setStartedAt] = useState<Date | null>(
    initial?.startedAtMs ? new Date(initial.startedAtMs) : null,
  );
  const [elapsedSec, setElapsedSec] = useState<number>(() =>
    initial?.startedAtMs
      ? Math.max(0, Math.floor((Date.now() - initial.startedAtMs) / 1000))
      : 0,
  );

  const startedAtRef = useRef<Date | null>(null);
  startedAtRef.current = startedAt;
  const onStopRef = useRef<typeof onStop>(undefined);
  onStopRef.current = onStop;
  const onResumeRef = useRef<typeof onResume>(undefined);
  onResumeRef.current = onResume;
  const runningRef = useRef(false);
  runningRef.current = running;

  // Tick once per second while running. Re-reading Date.now keeps the math
  // correct even if the tab was throttled between ticks.
  useEffect(() => {
    if (!running || !startedAt) return;
    const startMs = startedAt.getTime();
    const update = () =>
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [running, startedAt]);

  // Mirror running state to localStorage so a TimerBar unmount/remount cycle
  // (navigation between pages that don't include the bar) doesn't reset the
  // timer. stop()/reset() explicitly clear the entry below.
  useEffect(() => {
    if (running && startedAt) {
      writePersisted({ running: true, startedAtMs: startedAt.getTime() });
    } else {
      writePersisted(null);
    }
  }, [running, startedAt]);

  const start = useCallback(() => {
    setStartedAt((prev) => prev ?? new Date());
    setElapsedSec(0);
    setRunning(true);
  }, []);

  // Cross-tree resume: list/reports rows dispatch `tt:resume` to ask the
  // header TimerBar to start running with a given description/projectId.
  // The stopwatch owns the subscription and re-emits the payload to the
  // TimerBar via onResume.
  useEffect(() => {
    const handler = (e: Event) => {
      if (runningRef.current) return;
      const detail = (e as CustomEvent).detail || {};
      onResumeRef.current?.({
        description: detail.description || "",
        projectId: detail.projectId ?? null,
      });
      setStartedAt(new Date());
      setElapsedSec(0);
      setRunning(true);
    };
    window.addEventListener("tt:resume", handler as EventListener);
    return () => window.removeEventListener("tt:resume", handler as EventListener);
  }, []);

  const stop = useCallback(() => {
    const startDate = startedAtRef.current;
    if (!startDate) return;
    const endDate = new Date();
    const seconds = Math.max(
      0,
      Math.floor((endDate.getTime() - startDate.getTime()) / 1000),
    );
    setRunning(false);
    onStopRef.current?.({
      startTime: localAsFakeUtcIso(startDate),
      endTime: localAsFakeUtcIso(endDate),
      elapsedSec: seconds,
    });
    setStartedAt(null);
    setElapsedSec(0);
  }, []);

  const reset = useCallback(() => {
    setRunning(false);
    setStartedAt(null);
    setElapsedSec(0);
  }, []);

  // Tauri tray + global hotkey bridge. Subscribed once on mount; the
  // helpers no-op in non-Tauri contexts so we can keep this effect
  // unconditional. Action refs are read at call time so the latest
  // start/stop closures always win, no re-subscribe on every render.
  const startRef = useRef(start);
  startRef.current = start;
  const stopRef = useRef(stop);
  stopRef.current = stop;

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    void subscribeTrayEvents({
      onStart: () => {
        if (!runningRef.current) startRef.current();
      },
      onStop: () => {
        if (runningRef.current) stopRef.current();
      },
      // Resume is currently aliased to start — the tray has no notion
      // of "what to resume" without project/description context, and
      // the frontend snapshot sets `canResume: false` for now so this
      // branch is effectively unreachable from the tray menu.
      onResume: () => {
        if (!runningRef.current) startRef.current();
      },
      onToggle: () => {
        if (runningRef.current) stopRef.current();
        else startRef.current();
      },
    }).then((u) => {
      if (cancelled) {
        u();
      } else {
        unsubscribe = u;
      }
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // Push snapshots whenever the visible state changes. The tick effect
  // updates `elapsedSec` once per second while running, so this fires at
  // most once a second — well within Tauri IPC budget. `onboardingComplete`
  // is hardcoded true because the Stopwatch only mounts after
  // the onboarding gate lets the user through.
  useEffect(() => {
    void pushSnapshot({
      isRunning: running,
      canResume: false,
      elapsedSeconds: elapsedSec,
      label: label && label.trim().length > 0 ? label.trim() : null,
      onboardingComplete: true,
    });
  }, [running, elapsedSec, label]);

  return { running, elapsedSec, display: formatHms(elapsedSec), start, stop, reset };
}

function pad2(n: number) {
  return n < 10 ? "0" + n : "" + n;
}

function formatHms(totalSec: number): string {
  const total = Math.max(0, Math.floor(totalSec || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${pad2(m)}:${pad2(s)}`;
}

// Format a Date's *local* wall-clock components as a fake-UTC ISO string —
// matches the convention used by `combineDateTime` in lib/format.ts so saved
// entries land at the right slot on the calendar grid (which renders the
// stored ISO's HH:MM as-is from the UTC slice).
function localAsFakeUtcIso(d: Date): string {
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.000Z`
  );
}

