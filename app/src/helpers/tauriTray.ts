// =====================================================================================================================
// tauriTray — bridge between the Tauri tray/hotkey signals and the Stopwatch.
// =====================================================================================================================
//
// The desktop shell (see [desktop/src/tray.rs](../../../desktop/src/tray.rs) and
// [desktop/src/hotkey.rs](../../../desktop/src/hotkey.rs)) emits Tauri events
// when the user interacts with the tray menu or presses the global hotkey,
// and exposes an `update_tray_state` command for the webview to push back
// the current stopwatch state. This module owns the JS half:
//
//   - subscribeTrayEvents(handlers)   → wires the four event listeners and
//                                       returns an unsubscribe function.
//   - pushSnapshot(snapshot)          → forwards the latest snapshot to Rust
//                                       so the menu/tooltip reflect reality.
//
// Both are safe to call in non-Tauri contexts (browser dev, demo build).
// `isTauri()` gates the actual API calls; outside Tauri the helpers no-op
// silently rather than throwing, so callers don't have to branch.

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

/// Shape pushed into Rust via `update_tray_state`. Field names mirror the
/// `StopwatchSnapshot` struct in [desktop/src/tray.rs](../../../desktop/src/tray.rs).
/// We use snake_case in `serialize()` below because serde on the Rust side
/// is configured with its default naming.
export type StopwatchSnapshot = {
  isRunning: boolean;
  canResume: boolean;
  elapsedSeconds: number;
  label: string | null;
  onboardingComplete: boolean;
};

export type TrayEventHandlers = {
  onStart: () => void;
  onStop: () => void;
  onResume: () => void;
  onToggle: () => void;
};

/// Subscribes to the four tray/hotkey events. Returns an unsubscribe
/// function — call it on teardown to avoid duplicate handlers across
/// HMR reloads. In non-Tauri contexts the returned unsubscribe is a
/// no-op, so callers can use the same shape unconditionally.
export async function subscribeTrayEvents(
  handlers: TrayEventHandlers,
): Promise<() => void> {
  if (!isTauri()) return () => {};
  try {
    const { listen } = await import("@tauri-apps/api/event");
    const u1 = await listen("tray://stopwatch/start", () => handlers.onStart());
    const u2 = await listen("tray://stopwatch/stop", () => handlers.onStop());
    const u3 = await listen("tray://stopwatch/resume", () => handlers.onResume());
    const u4 = await listen("hotkey://stopwatch/toggle", () => handlers.onToggle());
    return () => {
      u1();
      u2();
      u3();
      u4();
    };
  } catch {
    // If the Tauri API module can't be loaded for any reason (unlikely
    // inside a real Tauri webview, but possible in test harnesses), we
    // fall through to a no-op. The tray-less UI keeps working.
    return () => {};
  }
}

/// Pushes the latest stopwatch state to Rust. Fire-and-forget: tray
/// updates are best-effort and must never throw into the React tree.
export async function pushSnapshot(snapshot: StopwatchSnapshot): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("update_tray_state", { snapshot: serialize(snapshot) });
  } catch {
    // Tray push failures are silently dropped. The in-window UI is the
    // primary surface; a stale tray menu is recoverable on the next tick.
  }
}

function serialize(s: StopwatchSnapshot): Record<string, unknown> {
  return {
    is_running: s.isRunning,
    can_resume: s.canResume,
    elapsed_seconds: s.elapsedSeconds,
    label: s.label,
    onboarding_complete: s.onboardingComplete,
  };
}
