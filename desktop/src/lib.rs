// =====================================================================================================================
// Tauri shell — boots an in-process axum server then opens the webview pointed at it.
// =====================================================================================================================
//
// Why a separate library crate alongside `main.rs`?  Tauri's mobile targets
// (and `cargo tauri` codegen) prefer to call into a single `run()` entrypoint
// from the platform-specific binaries. Keeping the shell logic in a lib makes
// that handoff trivial and lets us unit-test pieces (e.g. port discovery)
// without spinning up the windowing layer.
//
// The bootstrap sequence:
//   1. setup hook fires on the Tauri thread.
//   2. We spawn a dedicated tokio runtime on a worker thread that calls
//      `animo_api::bind` — which creates the SQLx pool, runs migrations,
//      opens a TCP listener on 127.0.0.1:0, and returns the actual bound
//      port.
//   3. The port is handed back to the Tauri thread via an std::sync::mpsc
//      channel. Synchronous because the webview must not open before we
//      know where to point it.
//   4. We stash the port in app state (`ApiPort`) so the frontend can read
//      it through the `api_base` Tauri command.
//   5. The worker thread then calls `bound.serve()` and blocks for the
//      lifetime of the app, draining requests.

mod hotkey;
mod tray;

use std::sync::{mpsc, Mutex};
use std::thread;

use animo_api::{bind, Config};
use tauri::{Manager, State};

use crate::tray::{StopwatchSnapshot, StopwatchStateMutex, TrayHandle};

/// Port assigned to the embedded axum server at startup. Exposed to the
/// webview via the [`api_base`] command so the XMLUI frontend can build its
/// `apiBase` global without hard-coding a port at compile time.
struct ApiPort(u16);

/// On first launch in a dev build, seed the Tauri app-data dir with the
/// existing dev `api/data.db` so contributors don't lose their local users.
///
/// Behavior:
///   - If `data_dir/data.db` already exists → no-op (avoids clobbering data
///     once the desktop shell has its own DB).
///   - Release builds (`cfg!(debug_assertions) == false`) → no-op. End users
///     who install the bundled app should start with an empty DB; a future
///     "Import existing database" Settings flow can replace this.
///   - Dev builds → look for `<repo>/api/data.db` via the `CARGO_MANIFEST_DIR`
///     baked in at compile time. If present, copy it across. This path only
///     resolves on the developer's own machine.
fn bootstrap_data_dir(data_dir: &std::path::Path) -> anyhow::Result<()> {
    let target = data_dir.join("data.db");
    if target.exists() {
        return Ok(());
    }
    if !cfg!(debug_assertions) {
        return Ok(());
    }
    let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let Some(workspace_root) = manifest_dir.parent() else {
        return Ok(());
    };
    let src = workspace_root.join("api").join("data.db");
    if !src.exists() {
        return Ok(());
    }
    std::fs::copy(&src, &target)
        .map_err(|e| anyhow::anyhow!("seed data.db from {}: {}", src.display(), e))?;
    tracing::info!("seeded {} from {}", target.display(), src.display());
    Ok(())
}

#[tauri::command]
fn api_base(port: State<'_, ApiPort>) -> String {
    // Use `localhost`, not `127.0.0.1`, so the webview and embedded API stay
    // same-site in dev and release. The listener still binds on 127.0.0.1
    // (see `Config::for_desktop`); `localhost` resolves to the same loopback
    // interface.
    format!("http://localhost:{}/api", port.0)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "animo_api=info,animo_desktop_lib=info".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // Bring an existing window forward instead of opening a second instance.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(hotkey::build_plugin())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
            }

            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| anyhow::anyhow!("resolve app_data_dir: {e}"))?;
            std::fs::create_dir_all(&data_dir)?;
            tracing::info!("app data dir: {}", data_dir.display());
            bootstrap_data_dir(&data_dir)?;

            let (tx, rx) = mpsc::channel::<anyhow::Result<u16>>();
            let cfg = Config::for_desktop(&data_dir);

            // Dedicated tokio runtime on its own OS thread keeps the axum
            // server isolated from Tauri's runtime — avoids "runtime within
            // a runtime" panics and lets us tear it down by dropping the
            // thread on process exit.
            thread::Builder::new()
                .name("api-server".into())
                .spawn(move || {
                    let rt = match tokio::runtime::Builder::new_multi_thread()
                        .enable_all()
                        .build()
                    {
                        Ok(rt) => rt,
                        Err(e) => {
                            let _ = tx.send(Err(anyhow::anyhow!("build tokio runtime: {e}")));
                            return;
                        }
                    };

                    rt.block_on(async move {
                        match bind(cfg).await {
                            Ok(bound) => {
                                let port = bound.local_addr.port();
                                tracing::info!("api bound on http://{}", bound.local_addr);
                                if tx.send(Ok(port)).is_err() {
                                    tracing::error!("main thread dropped port receiver");
                                    return;
                                }
                                if let Err(e) = bound.serve().await {
                                    tracing::error!("api serve loop ended: {e}");
                                }
                            }
                            Err(e) => {
                                let _ = tx.send(Err(e));
                            }
                        }
                    });
                })
                .map_err(|e| anyhow::anyhow!("spawn api-server thread: {e}"))?;

            // Block here — the webview must not open before the server is
            // listening, otherwise the first XMLUI fetch races the bind.
            let port = rx
                .recv()
                .map_err(|e| anyhow::anyhow!("api-server thread vanished before binding: {e}"))?
                .map_err(|e| anyhow::anyhow!("api bootstrap failed: {e}"))?;

            app.manage(ApiPort(port));

            // Tray state must exist before `tray::create` runs, otherwise
            // the menu-click handler can't reach the snapshot for its
            // onboarding fallback check.
            app.manage(StopwatchStateMutex(
                Mutex::new(StopwatchSnapshot::default()),
            ));
            app.manage(TrayHandle::<tauri::Wry>(Mutex::new(None)));
            tray::create(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![api_base, tray::update_tray_state])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
