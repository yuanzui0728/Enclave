#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use tauri::{
    menu::MenuBuilder,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Window, WindowEvent,
};
#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
#[cfg(target_os = "windows")]
use window_vibrancy::apply_acrylic;

const MAIN_WINDOW_LABEL: &str = "main";
const TRAY_ICON_ID: &str = "main-tray";
const TRAY_MENU_SHOW_ID: &str = "tray-show";
const TRAY_MENU_QUIT_ID: &str = "tray-quit";

struct DesktopWindowState {
    allow_exit: AtomicBool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopRuntimeContext {
    app_data_dir: String,
    runtime_data_dir: String,
    database_path: String,
    core_api_port: u16,
    core_api_base_url: String,
    app_url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopCoreApiStatus {
    configured_port: u16,
    base_url: String,
    running: bool,
    reachable: bool,
    pid: Option<u32>,
    database_path: String,
    message: String,
    command: String,
    command_source: String,
    managed_by_desktop_shell: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopOperationResult {
    success: bool,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopRuntimeDiagnostics {
    platform: String,
    core_api_command: String,
    core_api_command_source: String,
    core_api_command_resolved: bool,
    core_api_reachable: bool,
    diagnostics_status: String,
    bundled_core_api_path: String,
    bundled_core_api_exists: bool,
    core_api_port_occupied: bool,
    managed_by_desktop_shell: bool,
    managed_child_pid: Option<u32>,
    desktop_log_path: String,
    last_core_api_error: Option<String>,
    linux_missing_packages: Vec<String>,
    summary: String,
}

struct RuntimePaths {
    app_data_dir: PathBuf,
    runtime_data_dir: PathBuf,
    database_path: PathBuf,
    logs_dir: PathBuf,
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(DesktopWindowState {
            allow_exit: AtomicBool::new(false),
        })
        .on_window_event(handle_window_event)
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "windows")]
                {
                    let _ = apply_acrylic(&window, Some((18, 22, 30, 160)));
                }

                #[cfg(target_os = "macos")]
                {
                    let _ = apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None);
                }
            }

            setup_system_tray(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_runtime_context,
            desktop_core_api_status,
            desktop_runtime_diagnostics,
            desktop_window_close,
            desktop_window_drag,
            desktop_window_is_maximized,
            desktop_window_minimize,
            desktop_window_toggle_maximize,
            probe_core_api_health,
            start_core_api,
            stop_core_api,
            restart_core_api
        ])
        .run(tauri::generate_context!())
        .expect("error while running yinjie desktop");
}

fn setup_system_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let tray_menu = MenuBuilder::new(app)
        .text(TRAY_MENU_SHOW_ID, "打开隐界")
        .separator()
        .text(TRAY_MENU_QUIT_ID, "退出")
        .build()?;
    let mut tray_builder = TrayIconBuilder::with_id(TRAY_ICON_ID)
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .tooltip("隐界");

    if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }

    tray_builder
        .on_menu_event(|app, event| match event.id.as_ref() {
            TRAY_MENU_SHOW_ID => {
                let _ = show_main_window(app);
            }
            TRAY_MENU_QUIT_ID => {
                if let Some(state) = app.try_state::<DesktopWindowState>() {
                    state.allow_exit.store(true, Ordering::SeqCst);
                }
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            }
            | TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } => {
                let _ = show_main_window(&tray.app_handle());
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}

fn handle_window_event(window: &Window, event: &WindowEvent) {
    if window.label() != MAIN_WINDOW_LABEL {
        return;
    }

    if let WindowEvent::CloseRequested { api, .. } = event {
        let state = window.state::<DesktopWindowState>();
        if state.allow_exit.load(Ordering::SeqCst) {
            return;
        }

        api.prevent_close();
        let _ = hide_main_window(&window.app_handle());
    }
}

fn hide_main_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        window.set_skip_taskbar(true)?;
        window.hide()?;
    }

    Ok(())
}

fn show_main_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(state) = app.try_state::<DesktopWindowState>() {
        state.allow_exit.store(false, Ordering::SeqCst);
    }

    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        window.set_skip_taskbar(false)?;
        let _ = window.unminimize();
        window.show()?;
        window.set_focus()?;
    }

    Ok(())
}

#[tauri::command]
fn desktop_runtime_context(app: tauri::AppHandle) -> Result<DesktopRuntimeContext, String> {
    let paths = resolve_runtime_paths(&app)?;
    let configured_base_url = configured_remote_base_url();

    Ok(DesktopRuntimeContext {
        app_data_dir: paths.app_data_dir.display().to_string(),
        runtime_data_dir: paths.runtime_data_dir.display().to_string(),
        database_path: paths.database_path.display().to_string(),
        core_api_port: 0,
        core_api_base_url: configured_base_url,
        app_url: default_app_url(),
    })
}

#[tauri::command]
fn desktop_core_api_status(app: tauri::AppHandle) -> Result<DesktopCoreApiStatus, String> {
    let paths = resolve_runtime_paths(&app)?;
    let configured_base_url = configured_remote_base_url();
    let reachable = probe_remote_health(&configured_base_url);

    Ok(DesktopCoreApiStatus {
        configured_port: 0,
        base_url: configured_base_url.clone(),
        running: false,
        reachable,
        pid: None,
        database_path: paths.database_path.display().to_string(),
        message: if configured_base_url.is_empty() {
            "Desktop shell is remote-only. Configure the server address inside the app.".to_string()
        } else if reachable {
            format!("Remote Core API responded at {configured_base_url}")
        } else {
            format!("Remote Core API is configured but not reachable at {configured_base_url}")
        },
        command: String::new(),
        command_source: "remote".to_string(),
        managed_by_desktop_shell: false,
    })
}

#[tauri::command]
fn desktop_runtime_diagnostics(app: tauri::AppHandle) -> Result<DesktopRuntimeDiagnostics, String> {
    let paths = resolve_runtime_paths(&app)?;
    let configured_base_url = configured_remote_base_url();
    let reachable = probe_remote_health(&configured_base_url);
    let diagnostics_status = if configured_base_url.is_empty() {
        "remote-unconfigured"
    } else if reachable {
        "ready"
    } else {
        "remote-unreachable"
    };

    Ok(DesktopRuntimeDiagnostics {
        platform: std::env::consts::OS.to_string(),
        core_api_command: String::new(),
        core_api_command_source: "remote".to_string(),
        core_api_command_resolved: true,
        core_api_reachable: reachable,
        diagnostics_status: diagnostics_status.to_string(),
        bundled_core_api_path: String::new(),
        bundled_core_api_exists: false,
        core_api_port_occupied: false,
        managed_by_desktop_shell: false,
        managed_child_pid: None,
        desktop_log_path: paths.logs_dir.join("desktop.log").display().to_string(),
        last_core_api_error: None,
        linux_missing_packages: Vec::new(),
        summary: if configured_base_url.is_empty() {
            "Desktop shell no longer starts a local Core API. Use the in-app remote setup flow.".to_string()
        } else if reachable {
            format!("Desktop shell is configured for remote mode and can reach {configured_base_url}")
        } else {
            format!("Desktop shell is configured for remote mode but cannot reach {configured_base_url}")
        },
    })
}

#[tauri::command]
fn probe_core_api_health() -> DesktopOperationResult {
    let configured_base_url = configured_remote_base_url();
    let reachable = probe_remote_health(&configured_base_url);

    DesktopOperationResult {
        success: reachable,
        message: if configured_base_url.is_empty() {
            "Desktop shell is remote-only. Configure the server address inside the app.".to_string()
        } else if reachable {
            format!("Remote Core API responded at {configured_base_url}")
        } else {
            format!("Remote Core API did not respond at {configured_base_url}")
        },
    }
}

#[tauri::command]
fn start_core_api() -> DesktopOperationResult {
    DesktopOperationResult {
        success: true,
        message: "Desktop shell no longer starts a local Core API. Configure a remote server in Setup.".to_string(),
    }
}

#[tauri::command]
fn stop_core_api() -> DesktopOperationResult {
    DesktopOperationResult {
        success: true,
        message: "Desktop shell no longer manages a local Core API process.".to_string(),
    }
}

#[tauri::command]
fn restart_core_api() -> DesktopOperationResult {
    DesktopOperationResult {
        success: true,
        message: "Desktop shell no longer restarts a local Core API. Re-check the remote server instead.".to_string(),
    }
}

#[tauri::command]
fn desktop_window_close(window: Window) -> Result<(), String> {
    window.close().map_err(|error| error.to_string())
}

#[tauri::command]
fn desktop_window_drag(window: Window) -> Result<(), String> {
    window.start_dragging().map_err(|error| error.to_string())
}

#[tauri::command]
fn desktop_window_is_maximized(window: Window) -> Result<bool, String> {
    window.is_maximized().map_err(|error| error.to_string())
}

#[tauri::command]
fn desktop_window_minimize(window: Window) -> Result<(), String> {
    window.minimize().map_err(|error| error.to_string())
}

#[tauri::command]
fn desktop_window_toggle_maximize(window: Window) -> Result<bool, String> {
    let is_maximized = window.is_maximized().map_err(|error| error.to_string())?;

    if is_maximized {
        window.unmaximize().map_err(|error| error.to_string())?;
        Ok(false)
    } else {
        window.maximize().map_err(|error| error.to_string())?;
        Ok(true)
    }
}

fn configured_remote_base_url() -> String {
    std::env::var("YINJIE_DESKTOP_REMOTE_API_BASE_URL")
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .unwrap_or_default()
}

fn resolve_runtime_paths(app: &tauri::AppHandle) -> Result<RuntimePaths, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let runtime_data_dir = app_data_dir.join("runtime-data");
    let database_path = runtime_data_dir.join("yinjie.sqlite");
    let logs_dir = runtime_data_dir.join("logs");

    std::fs::create_dir_all(&runtime_data_dir).map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&logs_dir).map_err(|error| error.to_string())?;

    Ok(RuntimePaths {
        app_data_dir,
        runtime_data_dir,
        database_path,
        logs_dir,
    })
}

fn default_app_url() -> String {
    if cfg!(debug_assertions) {
        "http://127.0.0.1:5180".to_string()
    } else {
        "app://index.html".to_string()
    }
}

fn probe_remote_health(base_url: &str) -> bool {
    if base_url.trim().is_empty() {
        return false;
    }

    let client = match reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
    {
        Ok(client) => client,
        Err(_) => return false,
    };

    client
        .get(format!("{base_url}/health"))
        .send()
        .map(|response| response.status().is_success())
        .unwrap_or(false)
}

#[allow(dead_code)]
fn now_token() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}
