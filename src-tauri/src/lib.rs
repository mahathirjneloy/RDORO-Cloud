pub mod database;
pub mod notifications;
pub mod shortcuts;
pub mod tray;

use std::sync::{Arc, Mutex};
use tauri::{Manager, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db_state = database::init_db().expect("Failed to initialize SQLite database");
    let watchdog_arc = Arc::new(Mutex::new(None));

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(db_state)
        .manage(notifications::WatchdogState { target_end_ms: watchdog_arc.clone() })
        .setup(move |app| {
            let handle = app.handle().clone();
            tray::setup_tray(&handle)?;
            notifications::spawn_watchdog(handle.clone(), watchdog_arc.clone());
            let _ = shortcuts::register_global_hotkey(handle.clone(), "Ctrl+Alt+P".to_string());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            database::record_session,
            database::delete_session,
            database::save_active_timer,
            database::save_settings_json,
            database::load_settings_json,
            database::query_stats,
            database::export_data,
            database::open_data_folder,
            notifications::set_rust_watchdog,
            notifications::sync_taskbar_progress,
            notifications::notify_phase_complete,
            shortcuts::register_global_hotkey,
        ])
        .run(tauri::generate_context!())
        .expect("error while running RDORO");
}