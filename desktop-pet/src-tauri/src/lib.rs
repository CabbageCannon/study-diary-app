use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, WebviewWindow,
};

struct TrayMenuState {
    autostart: CheckMenuItem,
    always_on_top: CheckMenuItem,
    mouse_through: CheckMenuItem,
    pause_resume: MenuItem,
    complete: MenuItem,
}

fn emit_command(app: &AppHandle, command: &str) {
    let _ = app.emit("tray-command", command);
}

fn toggle_window_visibility(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
        }
    }
}

#[tauri::command]
fn apply_window_preferences(
    app: AppHandle,
    window: WebviewWindow,
    always_on_top: bool,
    mouse_through: bool,
) -> Result<(), String> {
    window
        .set_always_on_top(always_on_top)
        .map_err(|error| error.to_string())?;
    window
        .set_ignore_cursor_events(mouse_through)
        .map_err(|error| error.to_string())?;
    let state = app.state::<TrayMenuState>();
    state
        .always_on_top
        .set_checked(always_on_top)
        .map_err(|error| error.to_string())?;
    state
        .mouse_through
        .set_checked(mouse_through)
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_autostart_checked(app: AppHandle, enabled: bool) -> Result<(), String> {
    app.state::<TrayMenuState>()
        .autostart
        .set_checked(enabled)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn update_study_status(app: AppHandle, study_status: String) -> Result<(), String> {
    let state = app.state::<TrayMenuState>();
    let (label, can_complete) = match study_status.as_str() {
        "running" => ("暂停学习", true),
        "paused" => ("继续学习", true),
        _ => ("开始学习", false),
    };
    state
        .pause_resume
        .set_text(label)
        .map_err(|error| error.to_string())?;
    state
        .complete
        .set_enabled(can_complete)
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                None::<Vec<String>>,
            ))?;

            let show_hide = MenuItem::with_id(app, "toggle_visibility", "显示 / 隐藏桌宠", true, None::<&str>)?;
            let start = MenuItem::with_id(app, "start_study", "开始学习", true, None::<&str>)?;
            let pause_resume = MenuItem::with_id(app, "pause_resume", "暂停 / 继续", true, None::<&str>)?;
            let complete = MenuItem::with_id(app, "complete_study", "完成学习", true, None::<&str>)?;
            let open_app = MenuItem::with_id(app, "open_app", "打开学习系统", true, None::<&str>)?;
            let open_settings = MenuItem::with_id(app, "open_settings", "打开桌宠设置", true, None::<&str>)?;
            let autostart = CheckMenuItem::with_id(app, "autostart", "开机启动", true, false, None::<&str>)?;
            let always_on_top = CheckMenuItem::with_id(app, "always_on_top", "始终置顶", true, true, None::<&str>)?;
            let mouse_through = CheckMenuItem::with_id(app, "mouse_through", "鼠标穿透", true, false, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let second_separator = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[
                    &show_hide,
                    &start,
                    &pause_resume,
                    &complete,
                    &open_app,
                    &open_settings,
                    &second_separator,
                    &autostart,
                    &always_on_top,
                    &mouse_through,
                    &separator,
                    &quit,
                ],
            )?;
            app.manage(TrayMenuState {
                autostart,
                always_on_top,
                mouse_through,
                pause_resume,
                complete,
            });
            let icon = app.default_window_icon().cloned();
            let tray = TrayIconBuilder::with_id("study-desktop-pet")
                .tooltip("学习桌宠")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle_visibility" => toggle_window_visibility(app),
                    "quit" => app.exit(0),
                    command => emit_command(app, command),
                });
            if let Some(icon) = icon {
                tray.icon(icon).build(app)?;
            } else {
                tray.build(app)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![apply_window_preferences, set_autostart_checked, update_study_status])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run Study Desktop Pet");
}
