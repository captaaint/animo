// =====================================================================================================================
// System tray — menu bar integration for the stopwatch (Tauri 2).
// =====================================================================================================================
//
// The tray is owned by the desktop shell, but the *truth* of the stopwatch
// lives in the XMLUI frontend (it's the same React-ish state machine that
// also drives the in-window timer card). To keep both surfaces in sync
// without splitting state across two stores, the contract is:
//
//   - Frontend pushes snapshots into Rust via `update_tray_state` whenever
//     the running entry, elapsed time, or onboarding flag changes.
//   - Rust rebuilds the tray menu and tooltip from the snapshot.
//   - When the user clicks a tray menu item (Start / Stop / Resume), Rust
//     emits a `tray://stopwatch/<action>` event. The frontend listens and
//     performs the actual mutation (POST /api/entries, etc).
//
// This split lives in [`lib.rs`] task 20 — task 18 stops at "tray plumbing
// is in place"; the frontend listener arrives with that next task.
//
// Notes:
//   - We hold the [`TrayIcon`] in app-managed state so commands can call
//     `set_menu` / `set_tooltip` after creation. Without this handle the
//     tray is a write-once API.
//   - Menu rebuilds (rather than in-place item edits) are deliberate: the
//     menu shape itself changes between idle/running/paused, so allocating
//     a fresh menu each tick is simpler than juggling `MenuItem` handles.
//     The rate-limiter on the frontend (1 Hz tick) keeps churn bounded.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime,
};

/// Snapshot of the stopwatch as the frontend sees it. Pushed into Rust via
/// `update_tray_state`; consumed when rebuilding the tray menu.
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct StopwatchSnapshot {
    /// True while a time entry is actively accumulating seconds.
    pub is_running: bool,
    /// True when a previous entry was paused and can be resumed (the
    /// frontend decides what "resume" means — usually re-starting with the
    /// same project + description).
    pub can_resume: bool,
    /// Seconds elapsed for the currently running (or last paused) entry.
    pub elapsed_seconds: u64,
    /// Short label for the status line, e.g. "Animo — refactor". When
    /// `None`, falls back to "Idle" / "Running".
    pub label: Option<String>,
    /// False until the user finishes the onboarding wizard. When false, all
    /// stopwatch actions are disabled and clicking Start opens the main
    /// window so the user can finish setup instead of silently failing.
    pub onboarding_complete: bool,
}

/// App-managed wrapper around the latest snapshot. Held in a `Mutex` so the
/// command thread and any background updaters can mutate it safely; reads
/// are cheap (the struct is small + `Clone`).
pub struct StopwatchStateMutex(pub Mutex<StopwatchSnapshot>);

/// App-managed handle to the live tray icon. Stored as `Option` because the
/// tray is created inside `setup()` *after* the state is registered, so the
/// slot is briefly empty during boot.
pub struct TrayHandle<R: Runtime>(pub Mutex<Option<TrayIcon<R>>>);

const TRAY_ID: &str = "animo-main-tray";

/// Event names emitted to the webview when a tray menu item is clicked.
/// Kept as constants so the frontend can import the same strings via a
/// generated `.d.ts` (or just match the literals).
pub mod events {
    pub const START: &str = "tray://stopwatch/start";
    pub const STOP: &str = "tray://stopwatch/stop";
    pub const RESUME: &str = "tray://stopwatch/resume";
}

/// Format a duration as `HH:MM:SS`. Hours are clamped to two digits because
/// the tray status line has limited horizontal space — a 100h running timer
/// is almost certainly a bug worth surfacing rather than a real workday.
fn format_duration(total_seconds: u64) -> String {
    let hours = total_seconds / 3600;
    let minutes = (total_seconds % 3600) / 60;
    let seconds = total_seconds % 60;
    format!("{hours:02}:{minutes:02}:{seconds:02}")
}

/// Compose the status-line label shown as a disabled menu item. Pure
/// function so it's unit-testable without spinning up Tauri.
fn status_label(snapshot: &StopwatchSnapshot) -> String {
    if !snapshot.onboarding_complete {
        return "Setup required".to_string();
    }
    if snapshot.is_running {
        let prefix = snapshot.label.as_deref().unwrap_or("Running");
        format!("{prefix} — {}", format_duration(snapshot.elapsed_seconds))
    } else if snapshot.can_resume {
        let prefix = snapshot.label.as_deref().unwrap_or("Paused");
        format!("{prefix} — {}", format_duration(snapshot.elapsed_seconds))
    } else {
        "Idle".to_string()
    }
}

/// Compose the tooltip shown when hovering the tray icon. Mirrors the
/// status line so users can read state without opening the menu.
fn tray_tooltip(snapshot: &StopwatchSnapshot) -> String {
    format!("Animo — {}", status_label(snapshot))
}

/// Build a fresh menu reflecting the current snapshot. The menu shape
/// depends on state:
///   - onboarding incomplete → Setup Required + Show Window + Quit
///   - running               → Status + Stop + Show + Quit
///   - paused (can_resume)   → Status + Start + Resume + Show + Quit
///   - idle                  → Status + Start + Show + Quit
fn build_menu<R: Runtime>(
    app: &AppHandle<R>,
    snapshot: &StopwatchSnapshot,
) -> tauri::Result<Menu<R>> {
    let status = MenuItem::with_id(app, "status", status_label(snapshot), false, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let show = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit = PredefinedMenuItem::quit(app, Some("Quit Animo"))?;

    if !snapshot.onboarding_complete {
        return Menu::with_items(app, &[&status, &sep1, &show, &sep2, &quit]);
    }

    if snapshot.is_running {
        let stop = MenuItem::with_id(app, "stop", "Stop Timer", true, None::<&str>)?;
        return Menu::with_items(app, &[&status, &sep1, &stop, &sep2, &show, &quit]);
    }

    let start = MenuItem::with_id(app, "start", "Start Timer", true, None::<&str>)?;
    if snapshot.can_resume {
        let resume = MenuItem::with_id(app, "resume", "Resume Timer", true, None::<&str>)?;
        return Menu::with_items(app, &[&status, &sep1, &start, &resume, &sep2, &show, &quit]);
    }
    Menu::with_items(app, &[&status, &sep1, &start, &sep2, &show, &quit])
}

/// Bring the main window to the foreground (creating focus + un-minimising).
/// Used both by the "Show Window" menu item and by left-click on the tray
/// icon itself.
fn focus_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Handle a menu click. For stopwatch actions we emit an event; the actual
/// API call happens on the JS side so the same code path runs whether the
/// user clicks the in-window button or the tray menu.
fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    match id {
        "show" => focus_main_window(app),
        "start" => {
            focus_main_window_if_setup_pending(app);
            let _ = app.emit(events::START, ());
        }
        "stop" => {
            let _ = app.emit(events::STOP, ());
        }
        "resume" => {
            let _ = app.emit(events::RESUME, ());
        }
        // "quit" is handled by `PredefinedMenuItem::quit` directly — no
        // need to route it through here.
        _ => {}
    }
}

/// When the user clicks Start but onboarding hasn't been completed, pop the
/// main window so they can finish setup. The tray menu *should* already
/// show "Setup required" instead of Start in that state, but we double-
/// check defensively (the snapshot may be stale by a tick).
fn focus_main_window_if_setup_pending<R: Runtime>(app: &AppHandle<R>) {
    let Some(state) = app.try_state::<StopwatchStateMutex>() else {
        return;
    };
    let Ok(snap) = state.0.lock() else {
        return;
    };
    if !snap.onboarding_complete {
        focus_main_window(app);
    }
}

/// Construct the tray icon and stash its handle in app state. Call once
/// from `setup()` after the API server has bound (so the webview can
/// already make API calls when the tray fires its first event).
pub fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let snapshot = StopwatchSnapshot::default();
    let menu = build_menu(app, &snapshot)?;

    let icon = app.default_window_icon().cloned().ok_or_else(|| {
        tauri::Error::Anyhow(anyhow::anyhow!("no default window icon configured"))
    })?;

    let tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip(tray_tooltip(&snapshot))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| handle_menu_event(app, event.id.as_ref()))
        .on_tray_icon_event(|tray, event| {
            // Left-click brings the main window forward. We intentionally
            // don't toggle hide/show — users routinely click the tray on
            // every macOS minimise and expect "show", not "yoyo".
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                focus_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    if let Some(state) = app.try_state::<TrayHandle<R>>() {
        *state.0.lock().expect("tray handle mutex poisoned") = Some(tray);
    } else {
        app.manage(TrayHandle::<R>(Mutex::new(Some(tray))));
    }
    Ok(())
}

/// Tauri command: push a new stopwatch snapshot into the tray. Called
/// frequently (≈1 Hz while running) — keep it allocation-light.
#[tauri::command]
pub fn update_tray_state<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, StopwatchStateMutex>,
    tray: tauri::State<'_, TrayHandle<R>>,
    snapshot: StopwatchSnapshot,
) -> Result<(), String> {
    {
        let mut current = state.0.lock().map_err(|e| e.to_string())?;
        *current = snapshot.clone();
    }
    let menu = build_menu(&app, &snapshot).map_err(|e| e.to_string())?;
    let tooltip = tray_tooltip(&snapshot);
    let guard = tray.0.lock().map_err(|e| e.to_string())?;
    if let Some(tray_icon) = guard.as_ref() {
        tray_icon.set_menu(Some(menu)).map_err(|e| e.to_string())?;
        tray_icon
            .set_tooltip(Some(&tooltip))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn duration_format_pads_each_field() {
        assert_eq!(format_duration(0), "00:00:00");
        assert_eq!(format_duration(59), "00:00:59");
        assert_eq!(format_duration(60), "00:01:00");
        assert_eq!(format_duration(3661), "01:01:01");
        assert_eq!(format_duration(36_000), "10:00:00");
    }

    #[test]
    fn status_label_uses_idle_when_nothing_to_show() {
        let snap = StopwatchSnapshot {
            onboarding_complete: true,
            ..Default::default()
        };
        assert_eq!(status_label(&snap), "Idle");
    }

    #[test]
    fn status_label_flags_setup_before_anything_else() {
        let snap = StopwatchSnapshot {
            onboarding_complete: false,
            is_running: true,
            elapsed_seconds: 42,
            ..Default::default()
        };
        assert_eq!(status_label(&snap), "Setup required");
    }

    #[test]
    fn status_label_running_includes_label_and_duration() {
        let snap = StopwatchSnapshot {
            onboarding_complete: true,
            is_running: true,
            elapsed_seconds: 125,
            label: Some("Animo — task 18".into()),
            ..Default::default()
        };
        assert_eq!(status_label(&snap), "Animo — task 18 — 00:02:05");
    }

    #[test]
    fn status_label_paused_falls_back_when_no_label() {
        let snap = StopwatchSnapshot {
            onboarding_complete: true,
            can_resume: true,
            elapsed_seconds: 10,
            ..Default::default()
        };
        assert_eq!(status_label(&snap), "Paused — 00:00:10");
    }
}
