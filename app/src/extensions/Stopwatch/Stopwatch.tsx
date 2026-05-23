import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type UpdateStateFn = (
  newState: Record<string, unknown>,
  options?: { initial?: boolean },
) => void;

type RegisterApiCb = (
  apis: Record<string, (...args: unknown[]) => unknown>,
) => void;

export type StopwatchProps = {
  onStop?: (payload: { startTime: string; endTime: string; elapsedSec: number }) => void;
  onResume?: (payload: { description: string; projectId: string | null }) => void;
  updateState?: UpdateStateFn;
  registerComponentApi?: RegisterApiCb;
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

export function Stopwatch(props: StopwatchProps) {
  const { onStop, onResume, updateState, registerComponentApi } = props;

  const initial = useMemo(() => readPersisted(), []);

  const [running, setRunning] = useState<boolean>(initial?.running ?? false);
  // Keep the real Date instance so elapsed math stays correct, and so we can
  // re-format it on stop. The rest of the app stores ISO timestamps whose
  // HH:MM is meant to be read as wall-clock — see Globals.xs `combineDateTime`
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

  // Mirror to XMLUI bindings.
  useEffect(() => {
    if (!updateState) return;
    updateState({
      value: {
        running,
        startedAt: startedAt ? localAsFakeUtcIso(startedAt) : null,
        elapsedSec,
        display: formatHms(elapsedSec),
      },
    });
  }, [running, startedAt, elapsedSec, updateState]);

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
  // The Stopwatch is the only React layer in TimerBar, so it owns the
  // subscription and re-emits the payload to its parent via onResume.
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

  useEffect(() => {
    if (!registerComponentApi) return;
    registerComponentApi({
      start: (() => start()) as unknown as (...args: unknown[]) => unknown,
      stop: (() => stop()) as unknown as (...args: unknown[]) => unknown,
      reset: (() => reset()) as unknown as (...args: unknown[]) => unknown,
    });
  }, [registerComponentApi, start, stop, reset]);

  return null;
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
// matches the convention used by `combineDateTime` in Globals.xs so saved
// entries land at the right slot on the calendar grid (which renders the
// stored ISO's HH:MM as-is from the UTC slice).
function localAsFakeUtcIso(d: Date): string {
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.000Z`
  );
}

export default Stopwatch;
