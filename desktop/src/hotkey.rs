// =====================================================================================================================
// Global hotkey — registers Cmd/Ctrl+Shift+T to toggle the stopwatch.
// =====================================================================================================================
//
// Same divide as the tray (see [`crate::tray`]): the hotkey is just an
// input signal. When fired, we emit `hotkey://stopwatch/toggle` and let
// the frontend decide whether that means "start a new entry" or "stop
// the running one" — that branch needs project/description context that
// only the XMLUI side has, and duplicating the decision tree in Rust
// would guarantee divergence with the in-window button.
//
// "CommandOrControl" is Tauri's portable modifier alias: it resolves to
// ⌘ on macOS and Ctrl on Windows/Linux. Using it lets us register one
// string instead of `cfg!`-gating two.
//
// Failure mode: if registration fails (another app already owns the
// combo, or the OS refuses), we log a warning and continue. The user
// still has the tray menu and the in-window button — the global hotkey
// is a convenience, not a critical path, and refusing to boot over it
// would be hostile.

use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_global_shortcut::ShortcutState;

/// Portable shortcut string consumed by `tauri-plugin-global-shortcut`'s
/// parser. `CommandOrControl` → ⌘ on macOS, Ctrl elsewhere. Chosen to be
/// memorable ("T for Timer") and rare enough that conflicts are unlikely.
pub const STOPWATCH_TOGGLE_SHORTCUT: &str = "CommandOrControl+Shift+T";

/// Event emitted to the webview when the global hotkey fires. The
/// frontend listener (added in task 20) toggles the stopwatch.
pub const STOPWATCH_TOGGLE_EVENT: &str = "hotkey://stopwatch/toggle";

/// Build the global-shortcut plugin with the stopwatch hotkey already
/// registered. Returns a fully-built plugin ready to hand to
/// `app.handle().plugin(...)`.
///
/// We register at build time (rather than via the runtime `register`
/// API) because the shortcut is static and known at boot — no reason to
/// pay for the runtime indirection or to expose the plugin's commands
/// to the webview via capabilities.
pub fn build_plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    let builder = tauri_plugin_global_shortcut::Builder::new().with_handler(
        |app: &AppHandle<R>, _shortcut, event| {
            // Fire on `Pressed` only. Without this guard the toggle fires
            // twice per keystroke (down + up), which makes every press a
            // no-op and looks like the hotkey is broken.
            if event.state == ShortcutState::Pressed {
                if let Err(err) = app.emit(STOPWATCH_TOGGLE_EVENT, ()) {
                    tracing::warn!("failed to emit {STOPWATCH_TOGGLE_EVENT}: {err}");
                }
            }
        },
    );

    match builder.with_shortcut(STOPWATCH_TOGGLE_SHORTCUT) {
        Ok(b) => b.build(),
        Err(err) => {
            // `with_shortcut` only fails when the string itself doesn't
            // parse — should be impossible for a hard-coded constant,
            // but we still don't want to panic. Fall back to a plugin
            // with no shortcuts so the rest of the app keeps booting.
            tracing::error!(
                "failed to parse hotkey '{STOPWATCH_TOGGLE_SHORTCUT}': {err} — \
                 global hotkey disabled"
            );
            tauri_plugin_global_shortcut::Builder::new().build()
        }
    }
}
