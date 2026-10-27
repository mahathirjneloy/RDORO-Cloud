use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show_hide = MenuItem::with_id(app, "show_hide", "Show / Hide RDORO", true, None::<&str>)?;
    let start_pause = MenuItem::with_id(app, "start_pause", "Start / Pause", true, None::<&str>)?;
    let skip = MenuItem::with_id(app, "skip", "Skip Phase", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let mode_focus = MenuItem::with_id(app, "mode_focus", "Mode: Focus", true, None::<&str>)?;
    let mode_short = MenuItem::with_id(app, "mode_short", "Mode: Short Break", true, None::<&str>)?;
    let mode_long = MenuItem::with_id(app, "mode_long", "Mode: Long Break", true, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit RDORO", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show_hide, &start_pause, &skip, &sep1, &mode_focus, &mode_short, &mode_long, &sep2, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .tooltip("RDORO - Focus Timer")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show_hide" => {
                if let Some(w) = app.get_webview_window("main") {
                    if w.is_visible().unwrap_or(false) { let _ = w.hide(); }
                    else { let _ = w.show(); let _ = w.unminimize(); let _ = w.set_focus(); }
                }
            }
            "start_pause" => { let _ = app.emit("tray-action", "toggle"); }
            "skip" => { let _ = app.emit("tray-action", "skip"); }
            "mode_focus" => { let _ = app.emit("tray-action", "mode:focus"); }
            "mode_short" => { let _ = app.emit("tray-action", "mode:short"); }
            "mode_long" => { let _ = app.emit("tray-action", "mode:long"); }
            "quit" => { app.exit(0); }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                if let Some(w) = tray.app_handle().get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}