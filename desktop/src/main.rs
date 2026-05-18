// Prevents an extra console window from appearing on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    time_tracking_desktop_lib::run()
}
