use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{window::{ProgressBarState, ProgressBarStatus, UserAttentionType}, AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

pub struct WatchdogState {
    pub target_end_ms: Arc<Mutex<Option<i64>>>,
}

pub fn spawn_watchdog(app: AppHandle, target_end_ms: Arc<Mutex<Option<i64>>>) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(500));
        if let Ok(mut guard) = target_end_ms.lock() {
            if let Some(end_ms) = *guard {
                let now_ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64;
                if now_ms >= end_ms {
                    *guard = None;
                    let _ = app.emit("rust-timer-expired", now_ms);
                }
            }
        }
    });
}

#[tauri::command]
pub fn set_rust_watchdog(state: tauri::State<WatchdogState>, end_timestamp_ms: Option<i64>) -> Result<(), String> {
    let mut guard = state.target_end_ms.lock().map_err(|e| e.to_string())?;
    *guard = end_timestamp_ms;
    Ok(())
}

#[tauri::command]
pub fn sync_taskbar_progress(app: AppHandle, running: bool, progress_percent: Option<u64>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let state = match (running, progress_percent) {
            (true, Some(p)) => ProgressBarState { status: Some(ProgressBarStatus::Normal), progress: Some(p.min(100)) },
            _ => ProgressBarState { status: Some(ProgressBarStatus::None), progress: None },
        };
        let _ = window.set_progress_bar(state);
    }
    Ok(())
}

#[tauri::command]
pub fn notify_phase_complete(app: AppHandle, title: String, body: String, enable_toast: bool) -> Result<(), String> {
    if enable_toast {
        let _ = app.notification().builder().title(&title).body(&body).show();
    }
    if let Some(window) = app.get_webview_window("main") {
        if !window.is_focused().unwrap_or(false) {
            let _ = window.request_user_attention(Some(UserAttentionType::Informational));
        }
    }
    Ok(())
}