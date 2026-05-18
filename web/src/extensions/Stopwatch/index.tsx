import { createComponentRenderer, createMetadata } from "xmlui";
import { Stopwatch } from "./Stopwatch";

const metadata = createMetadata({
  status: "experimental",
  description:
    "Headless second-resolution stopwatch. Exposes `value.{running, startedAt, " +
    "elapsedSec, display}` for binding, and `start()`, `stop()`, `reset()` " +
    "APIs. Fires `stop` with `{ startTime, endTime, elapsedSec }` whenever " +
    "the user calls `stop()`.",
  props: {},
  events: {
    stop: {
      description:
        "Fired when `stop()` is called. Payload: { startTime, endTime, elapsedSec }.",
    },
    resume: {
      description:
        "Fired when a `tt:resume` window CustomEvent arrives and the timer was " +
        "idle. Payload: { description, projectId }. The stopwatch auto-starts " +
        "running before this event fires.",
    },
  },
  apis: {
    start: {
      signature: "start(): void",
      description: "Starts the stopwatch. No-op if already running.",
    },
    stop: {
      signature: "stop(): void",
      description: "Stops the stopwatch and fires the `stop` event.",
    },
    reset: {
      signature: "reset(): void",
      description: "Resets to zero without firing `stop`.",
    },
  },
  nonVisual: true,
});

export const stopwatchRenderer = createComponentRenderer(
  "Stopwatch",
  metadata,
  ({ updateState, registerComponentApi, lookupEventHandler }) => {
    return (
      <Stopwatch
        onStop={lookupEventHandler("stop")}
        onResume={lookupEventHandler("resume")}
        updateState={updateState}
        registerComponentApi={registerComponentApi}
      />
    );
  },
);

export default {
  namespace: "XMLUIExtensions",
  components: [stopwatchRenderer],
};
