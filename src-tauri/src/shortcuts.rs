use tauri::{AppHandle, Emitter};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[tauri::command]
pub fn register_global_hotkey(app: AppHandle, accelerator: String) -> Result<(), String> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    if accelerator.trim().is_empty() { return Ok(()); }
    gs.on_shortcut(accelerator.as_str(), move |app_handle, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            let _ = app_handle.emit("global-shortcut-toggle", ());
        }
    }).map_err(|e| e.to_string())?;
    Ok(())
}