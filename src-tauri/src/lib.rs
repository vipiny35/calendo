//! Menu bar host for Calendo.
//!
//! There is no main window. The process is an accessory: a status item whose
//! left click opens a month popover, and a settings window opened on demand.

mod glass;
mod settings;

use settings::{AppSettings, SettingsStore};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    ActivationPolicy, AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize,
    Position, Size, State, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as AutostartManagerExt};

const CALENDAR_LABEL: &str = "calendar";
const SETTINGS_LABEL: &str = "settings";
const TRAY_ID: &str = "calendo";
const AUTOSTART_ARG: &str = "--autostart";
const CALENDAR_WIDTH: f64 = 292.0;
const CALENDAR_WIDTH_WEEKS: f64 = 320.0;
const CALENDAR_HEIGHT: f64 = 352.0;
const SETTINGS_WIDTH: f64 = 480.0;
const SETTINGS_HEIGHT: f64 = 620.0;

struct AppState {
    settings: Mutex<SettingsStore>,
    ignore_calendar_blur: AtomicBool,
}

fn calendar_width(show_week_numbers: bool) -> f64 {
    if show_week_numbers {
        CALENDAR_WIDTH_WEEKS
    } else {
        CALENDAR_WIDTH
    }
}

fn user_data_dir(app: &AppHandle) -> PathBuf {
    if cfg!(target_os = "macos") {
        if let Some(home) = std::env::var_os("HOME") {
            return Path::new(&home).join("Library/Application Support/Calendo");
        }
    }
    app.path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn merge_settings(
    current: &AppSettings,
    patch: &serde_json::Value,
) -> Result<AppSettings, String> {
    let mut merged =
        serde_json::to_value(current).map_err(|error| format!("Invalid settings: {error}"))?;
    if let (Some(base), Some(fields)) = (merged.as_object_mut(), patch.as_object()) {
        for (key, value) in fields {
            base.insert(key.clone(), value.clone());
        }
    }
    serde_json::from_value(merged).map_err(|error| format!("Invalid settings patch: {error}"))
}

fn set_launch_at_login(app: &AppHandle, enabled: bool) {
    let manager = app.autolaunch();
    let _ = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };
}

fn show_week_numbers(app: &AppHandle) -> bool {
    app.state::<AppState>()
        .settings
        .lock()
        .map(|store| store.value().show_week_numbers)
        .unwrap_or(false)
}

fn close_calendar(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(CALENDAR_LABEL) {
        let _ = window.hide();
    }
}

fn position_calendar(app: &AppHandle, tray_rect: tauri::Rect) {
    let Some(window) = app.get_webview_window(CALENDAR_LABEL) else {
        return;
    };
    let width = calendar_width(show_week_numbers(app));
    let _ = window.set_size(Size::Logical(LogicalSize::new(width, CALENDAR_HEIGHT)));
    let scale = window.scale_factor().unwrap_or(1.0);
    let tray_pos: PhysicalPosition<f64> = tray_rect.position.to_physical(scale);
    let tray_size: PhysicalSize<f64> = tray_rect.size.to_physical(scale);
    let win_width = (width * scale).round() as i32;
    let win_height = (CALENDAR_HEIGHT * scale).round() as i32;
    let gap = (4.0 * scale).round() as i32;
    let mut x = tray_pos.x as i32 + (tray_size.width as i32 / 2) - (win_width / 2);
    let mut y = tray_pos.y as i32 + tray_size.height as i32 + gap;

    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());
    if let Some(monitor) = monitor {
        let origin = monitor.position();
        let size = monitor.size();
        let pad = (8.0 * scale).round() as i32;
        let min_x = origin.x + pad;
        let max_x = origin.x + size.width as i32 - win_width - pad;
        if max_x >= min_x {
            x = x.clamp(min_x, max_x);
        }
        let max_y = origin.y + size.height as i32 - win_height - pad;
        if y > max_y {
            y = tray_pos.y as i32 - win_height - gap;
        }
    }

    let _ = window.set_position(Position::Physical(PhysicalPosition::new(x, y)));
}

fn show_calendar(app: &AppHandle, tray_rect: tauri::Rect) {
    position_calendar(app, tray_rect);
    if let Some(window) = app.get_webview_window(CALENDAR_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
    }
    let _ = app.emit("calendar-shown", ());
}

fn toggle_calendar(app: &AppHandle, tray_rect: tauri::Rect) {
    let visible = app
        .get_webview_window(CALENDAR_LABEL)
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false);
    if visible {
        app.state::<AppState>()
            .ignore_calendar_blur
            .store(true, Ordering::SeqCst);
        close_calendar(app);
        return;
    }
    show_calendar(app, tray_rect);
}

fn present_settings(app: &AppHandle) {
    close_calendar(app);
    let _ = app.set_activation_policy(ActivationPolicy::Regular);
    if let Some(window) = app.get_webview_window(SETTINGS_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn dismiss_settings(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(SETTINGS_LABEL) {
        let _ = window.hide();
    }
    let _ = app.set_activation_policy(ActivationPolicy::Accessory);
}

fn handle_menu_action(app: &AppHandle, id: &str) {
    match id {
        "settings" => present_settings(app),
        "quit" => app.exit(0),
        _ => {}
    }
}

fn build_tray_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
    let quit = MenuItem::with_id(app, "quit", "Quit Calendo", true, Some("CmdOrCtrl+Q"))?;
    let separator = PredefinedMenuItem::separator(app)?;
    Menu::with_items(
        app,
        &[
            &settings as &dyn tauri::menu::IsMenuItem<tauri::Wry>,
            &separator,
            &quit,
        ],
    )
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_tray_menu(app)?;
    let icon = tauri::image::Image::from_bytes(include_bytes!("../../icons/tray-icon.png"))?;
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .icon_as_template(true)
        .tooltip("Calendo")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| handle_menu_action(app, event.id().as_ref()))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                rect,
                ..
            } = event
            {
                toggle_calendar(tray.app_handle(), rect);
            }
        })
        .build(app)?;
    Ok(())
}

fn build_calendar_window(app: &AppHandle) -> tauri::Result<()> {
    let window = WebviewWindowBuilder::new(app, CALENDAR_LABEL, WebviewUrl::App("calendar.html".into()))
        .title("Calendo")
        .inner_size(CALENDAR_WIDTH, CALENDAR_HEIGHT)
        .decorations(false)
        .transparent(true)
        .shadow(true)
        .resizable(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .accept_first_mouse(true)
        .visible(false)
        .focused(false)
        .build()?;

    glass::apply_calendar_glass(&window);

    let handle = app.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Focused(false) => {
            let app = handle.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(180));
                if app
                    .state::<AppState>()
                    .ignore_calendar_blur
                    .swap(false, Ordering::SeqCst)
                {
                    return;
                }
                if let Some(window) = app.get_webview_window(CALENDAR_LABEL) {
                    let focused = window.is_focused().unwrap_or(false);
                    let visible = window.is_visible().unwrap_or(false);
                    if visible && !focused {
                        let _ = window.hide();
                    }
                }
            });
        }
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            close_calendar(&handle);
        }
        _ => {}
    });
    Ok(())
}

fn build_settings_window(app: &AppHandle) -> tauri::Result<()> {
    let window = WebviewWindowBuilder::new(app, SETTINGS_LABEL, WebviewUrl::App("settings.html".into()))
        .title("Calendo Settings")
        .inner_size(SETTINGS_WIDTH, SETTINGS_HEIGHT)
        .min_inner_size(420.0, 520.0)
        .resizable(true)
        .skip_taskbar(false)
        .visible(false)
        .center()
        .build()?;

    let handle = app.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            dismiss_settings(&handle);
        }
    });
    Ok(())
}

fn spawn_clock(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(30));
        let _ = app.emit("clock-tick", ());
    });
}

#[tauri::command]
fn get_settings(state: State<AppState>) -> Result<AppSettings, String> {
    state
        .settings
        .lock()
        .map(|store| store.value())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn update_settings(
    app: AppHandle,
    state: State<AppState>,
    patch: serde_json::Value,
) -> Result<AppSettings, String> {
    let mut store = state.settings.lock().map_err(|error| error.to_string())?;
    let previous = store.value();
    let next = merge_settings(&previous, &patch)?;
    let saved = store.update(next);
    drop(store);
    if saved.launch_at_login != previous.launch_at_login {
        set_launch_at_login(&app, saved.launch_at_login);
    }
    if saved.show_week_numbers != previous.show_week_numbers {
        if let Some(window) = app.get_webview_window(CALENDAR_LABEL) {
            if window.is_visible().unwrap_or(false) {
                let _ = window.set_size(Size::Logical(LogicalSize::new(
                    calendar_width(saved.show_week_numbers),
                    CALENDAR_HEIGHT,
                )));
            }
        }
    }
    let _ = app.emit("settings-changed", &saved);
    Ok(saved)
}

#[tauri::command]
fn set_tray_title(app: AppHandle, title: String) {
    let _ = app.clone().run_on_main_thread(move || {
        if let Some(tray) = app.tray_by_id(TRAY_ID) {
            let _ = tray.set_title(Some(&title));
        }
    });
}

#[tauri::command]
fn hide_calendar(app: AppHandle) {
    close_calendar(&app);
}

#[tauri::command]
fn open_settings(app: AppHandle) {
    present_settings(&app);
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![AUTOSTART_ARG]),
        ))
        .setup(|app| {
            let _ = app.set_activation_policy(ActivationPolicy::Accessory);
            let user_data = user_data_dir(app.handle());
            std::fs::create_dir_all(&user_data).ok();
            let store = SettingsStore::load(user_data);
            let initial = store.value();
            app.manage(AppState {
                settings: Mutex::new(store),
                ignore_calendar_blur: AtomicBool::new(false),
            });
            set_launch_at_login(app.handle(), initial.launch_at_login);
            build_calendar_window(app.handle())?;
            build_settings_window(app.handle())?;
            build_tray(app.handle())?;
            spawn_clock(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            update_settings,
            set_tray_title,
            hide_calendar,
            open_settings,
            quit_app,
            app_version,
        ])
        .run(tauri::generate_context!())
        .expect("Calendo failed to start");
}
