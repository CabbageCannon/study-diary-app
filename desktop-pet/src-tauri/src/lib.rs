use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, WebviewWindow,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

struct TrayMenuState<R: tauri::Runtime> {
    autostart: CheckMenuItem<R>,
    always_on_top: CheckMenuItem<R>,
    mouse_through: CheckMenuItem<R>,
    interaction_status: MenuItem<R>,
    restore_interaction: MenuItem<R>,
    scale_status: MenuItem<R>,
    decrease_scale: MenuItem<R>,
    reset_scale: MenuItem<R>,
    increase_scale: MenuItem<R>,
    pause_resume: MenuItem<R>,
    complete: MenuItem<R>,
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
            let _ = window.set_focus();
        }
    }
}

fn set_window_interaction_mode(
    app: &AppHandle,
    window: &WebviewWindow,
    interaction_mode: &str,
) -> Result<(), String> {
    let mouse_through = match interaction_mode {
        "interactive" | "temporary" => false,
        "through" => true,
        _ => return Err(format!("Unsupported interaction mode: {interaction_mode}")),
    };

    window
        .set_ignore_cursor_events(mouse_through)
        .map_err(|error| error.to_string())?;

    let state = app.state::<TrayMenuState<tauri::Wry>>();
    let status = match interaction_mode {
        "through" => "交互状态：专注穿透",
        "temporary" => "交互状态：已恢复交互",
        _ => "交互状态：可操作",
    };
    state
        .mouse_through
        .set_checked(mouse_through)
        .map_err(|error| error.to_string())?;
    state
        .interaction_status
        .set_text(status)
        .map_err(|error| error.to_string())?;
    state
        .restore_interaction
        .set_enabled(mouse_through)
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn restore_interactive_mode(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if let Err(error) = set_window_interaction_mode(app, &window, "temporary") {
            eprintln!("Failed to restore desktop pet interaction: {error}");
            return;
        }
        let _ = window.show();
        let _ = app.emit("interaction-mode-command", "temporary");
    }
}

#[tauri::command]
fn apply_window_preferences(
    app: AppHandle,
    window: WebviewWindow,
    always_on_top: bool,
    interaction_mode: String,
) -> Result<(), String> {
    window
        .set_always_on_top(always_on_top)
        .map_err(|error| error.to_string())?;
    set_window_interaction_mode(&app, &window, &interaction_mode)?;
    app.state::<TrayMenuState<tauri::Wry>>()
        .always_on_top
        .set_checked(always_on_top)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_autostart_checked(app: AppHandle, enabled: bool) -> Result<(), String> {
    app.state::<TrayMenuState<tauri::Wry>>()
        .autostart
        .set_checked(enabled)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn update_study_status(app: AppHandle, study_status: String) -> Result<(), String> {
    let state = app.state::<TrayMenuState<tauri::Wry>>();
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

#[tauri::command]
fn update_pet_scale(app: AppHandle, scale: f64) -> Result<(), String> {
    const MIN_SCALE: f64 = 0.75;
    const DEFAULT_SCALE: f64 = 1.0;
    const MAX_SCALE: f64 = 1.5;
    if !scale.is_finite() || !(MIN_SCALE..=MAX_SCALE).contains(&scale) {
        return Err(format!("Unsupported desktop pet scale: {scale}"));
    }

    let state = app.state::<TrayMenuState<tauri::Wry>>();
    state
        .scale_status
        .set_text(format!("桌宠大小：{}%", (scale * 100.0).round()))
        .map_err(|error| error.to_string())?;
    state
        .decrease_scale
        .set_enabled(scale > MIN_SCALE + f64::EPSILON)
        .map_err(|error| error.to_string())?;
    state
        .reset_scale
        .set_enabled((scale - DEFAULT_SCALE).abs() > 0.005)
        .map_err(|error| error.to_string())?;
    state
        .increase_scale
        .set_enabled(scale < MAX_SCALE - f64::EPSILON)
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        restore_interactive_mode(app);
                    }
                })
                .build(),
        )
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
                None::<Vec<&str>>,
            ))?;

            if let Err(error) = app.global_shortcut().register("Ctrl+Shift+P") {
                eprintln!(
                    "Unable to register Ctrl+Shift+P for desktop pet interaction recovery: {error}"
                );
            }

            let show_hide = MenuItem::with_id(
                app,
                "toggle_visibility",
                "显示 / 隐藏桌宠",
                true,
                None::<&str>,
            )?;
            let start = MenuItem::with_id(app, "start_study", "开始学习", true, None::<&str>)?;
            let pause_resume =
                MenuItem::with_id(app, "pause_resume", "暂停 / 继续", true, None::<&str>)?;
            let complete =
                MenuItem::with_id(app, "complete_study", "完成学习", true, None::<&str>)?;
            let open_app = MenuItem::with_id(app, "open_app", "打开学习系统", true, None::<&str>)?;
            let open_settings =
                MenuItem::with_id(app, "open_settings", "打开桌宠设置", true, None::<&str>)?;
            let interaction_status = MenuItem::with_id(
                app,
                "interaction_status",
                "交互状态：可操作",
                false,
                None::<&str>,
            )?;
            let restore_interaction = MenuItem::with_id(
                app,
                "restore_interaction",
                "恢复交互 (Ctrl+Shift+P)",
                false,
                None::<&str>,
            )?;
            let scale_status =
                MenuItem::with_id(app, "scale_status", "桌宠大小：100%", false, None::<&str>)?;
            let decrease_scale =
                MenuItem::with_id(app, "decrease_scale", "缩小桌宠", true, None::<&str>)?;
            let reset_scale =
                MenuItem::with_id(app, "reset_scale", "恢复默认大小", false, None::<&str>)?;
            let increase_scale =
                MenuItem::with_id(app, "increase_scale", "放大桌宠", true, None::<&str>)?;
            let autostart =
                CheckMenuItem::with_id(app, "autostart", "开机启动", true, false, None::<&str>)?;
            let always_on_top =
                CheckMenuItem::with_id(app, "always_on_top", "始终置顶", true, true, None::<&str>)?;
            let mouse_through = CheckMenuItem::with_id(
                app,
                "mouse_through",
                "专注穿透",
                true,
                false,
                None::<&str>,
            )?;
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
                    &interaction_status,
                    &restore_interaction,
                    &scale_status,
                    &decrease_scale,
                    &reset_scale,
                    &increase_scale,
                    &autostart,
                    &always_on_top,
                    &mouse_through,
                    &separator,
                    &quit,
                ],
            )?;
            app.manage(TrayMenuState::<tauri::Wry> {
                autostart,
                always_on_top,
                mouse_through,
                interaction_status,
                restore_interaction,
                scale_status,
                decrease_scale,
                reset_scale,
                increase_scale,
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
                    "restore_interaction" => restore_interactive_mode(app),
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
        .invoke_handler(tauri::generate_handler![
            apply_window_preferences,
            set_autostart_checked,
            update_study_status,
            update_pet_scale
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run Study Desktop Pet");
}
