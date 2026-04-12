#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs::File,
    io::Write,
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{
    menu::MenuBuilder,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Window, WindowEvent,
};
use tauri_plugin_dialog::DialogExt;
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSaveRemoteFileInput {
    url: String,
    file_name: String,
    dialog_title: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSaveTextFileInput {
    contents: String,
    file_name: String,
    dialog_title: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSaveBinaryFileInput {
    bytes: Vec<u8>,
    file_name: String,
    dialog_title: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopTextStoreReadResult {
    exists: bool,
    contents: Option<String>,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopFileSaveResult {
    success: bool,
    cancelled: bool,
    saved_path: Option<String>,
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
        .plugin(tauri_plugin_dialog::init())
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
            desktop_save_remote_file,
            desktop_save_text_file,
            desktop_save_binary_file,
            desktop_read_feedback_store,
            desktop_write_feedback_store,
            desktop_read_live_companion_store,
            desktop_write_live_companion_store,
            desktop_read_mobile_handoff_store,
            desktop_write_mobile_handoff_store,
            desktop_read_notes_store,
            desktop_write_notes_store,
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
async fn desktop_save_remote_file(
    app: tauri::AppHandle,
    input: DesktopSaveRemoteFileInput,
) -> Result<DesktopFileSaveResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let url = input.url.trim().to_string();
        if url.is_empty() {
            return Err("Missing file URL.".to_string());
        }

        let Some(target_file_path) =
            prompt_save_file_path(&app, &input.file_name, input.dialog_title.as_deref())?
        else {
            return Ok(cancelled_file_save_result());
        };
        ensure_parent_dir_exists(&target_file_path)?;

        let mut response = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(120))
            .build()
            .map_err(|error| error.to_string())?
            .get(url)
            .send()
            .and_then(reqwest::blocking::Response::error_for_status)
            .map_err(|error| error.to_string())?;
        let mut output = File::create(&target_file_path).map_err(|error| error.to_string())?;

        response
            .copy_to(&mut output)
            .map_err(|error| error.to_string())?;
        output.flush().map_err(|error| error.to_string())?;

        Ok(saved_file_result(&target_file_path))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_save_text_file(
    app: tauri::AppHandle,
    input: DesktopSaveTextFileInput,
) -> Result<DesktopFileSaveResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(target_file_path) =
            prompt_save_file_path(&app, &input.file_name, input.dialog_title.as_deref())?
        else {
            return Ok(cancelled_file_save_result());
        };
        ensure_parent_dir_exists(&target_file_path)?;
        std::fs::write(&target_file_path, input.contents).map_err(|error| error.to_string())?;
        Ok(saved_file_result(&target_file_path))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_save_binary_file(
    app: tauri::AppHandle,
    input: DesktopSaveBinaryFileInput,
) -> Result<DesktopFileSaveResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(target_file_path) =
            prompt_save_file_path(&app, &input.file_name, input.dialog_title.as_deref())?
        else {
            return Ok(cancelled_file_save_result());
        };
        ensure_parent_dir_exists(&target_file_path)?;
        std::fs::write(&target_file_path, input.bytes).map_err(|error| error.to_string())?;
        Ok(saved_file_result(&target_file_path))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_read_feedback_store(
    app: tauri::AppHandle,
) -> Result<DesktopTextStoreReadResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-feedback.json");

        match std::fs::read_to_string(&target_file_path) {
            Ok(contents) => Ok(DesktopTextStoreReadResult {
                exists: true,
                contents: Some(contents),
                message: format!(
                    "Read desktop feedback store from {}",
                    target_file_path.display()
                ),
            }),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                Ok(DesktopTextStoreReadResult {
                    exists: false,
                    contents: None,
                    message: "Desktop feedback store has not been created yet.".to_string(),
                })
            }
            Err(error) => Err(error.to_string()),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_write_feedback_store(
    app: tauri::AppHandle,
    contents: String,
) -> Result<DesktopOperationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-feedback.json");
        ensure_parent_dir_exists(&target_file_path)?;
        std::fs::write(&target_file_path, contents).map_err(|error| error.to_string())?;

        Ok(DesktopOperationResult {
            success: true,
            message: format!(
                "Saved desktop feedback store to {}",
                target_file_path.display()
            ),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_read_live_companion_store(
    app: tauri::AppHandle,
) -> Result<DesktopTextStoreReadResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-live-companion.json");

        match std::fs::read_to_string(&target_file_path) {
            Ok(contents) => Ok(DesktopTextStoreReadResult {
                exists: true,
                contents: Some(contents),
                message: format!(
                    "Read desktop live companion store from {}",
                    target_file_path.display()
                ),
            }),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                Ok(DesktopTextStoreReadResult {
                    exists: false,
                    contents: None,
                    message: "Desktop live companion store has not been created yet.".to_string(),
                })
            }
            Err(error) => Err(error.to_string()),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_write_live_companion_store(
    app: tauri::AppHandle,
    contents: String,
) -> Result<DesktopOperationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-live-companion.json");
        ensure_parent_dir_exists(&target_file_path)?;
        std::fs::write(&target_file_path, contents).map_err(|error| error.to_string())?;

        Ok(DesktopOperationResult {
            success: true,
            message: format!(
                "Saved desktop live companion store to {}",
                target_file_path.display()
            ),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_read_mobile_handoff_store(
    app: tauri::AppHandle,
) -> Result<DesktopTextStoreReadResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-mobile-handoff.json");

        match std::fs::read_to_string(&target_file_path) {
            Ok(contents) => Ok(DesktopTextStoreReadResult {
                exists: true,
                contents: Some(contents),
                message: format!(
                    "Read desktop mobile handoff store from {}",
                    target_file_path.display()
                ),
            }),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                Ok(DesktopTextStoreReadResult {
                    exists: false,
                    contents: None,
                    message: "Desktop mobile handoff store has not been created yet.".to_string(),
                })
            }
            Err(error) => Err(error.to_string()),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_write_mobile_handoff_store(
    app: tauri::AppHandle,
    contents: String,
) -> Result<DesktopOperationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-mobile-handoff.json");
        ensure_parent_dir_exists(&target_file_path)?;
        std::fs::write(&target_file_path, contents).map_err(|error| error.to_string())?;

        Ok(DesktopOperationResult {
            success: true,
            message: format!(
                "Saved desktop mobile handoff store to {}",
                target_file_path.display()
            ),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_read_notes_store(
    app: tauri::AppHandle,
) -> Result<DesktopTextStoreReadResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-notes.json");

        match std::fs::read_to_string(&target_file_path) {
            Ok(contents) => Ok(DesktopTextStoreReadResult {
                exists: true,
                contents: Some(contents),
                message: format!(
                    "Read desktop notes store from {}",
                    target_file_path.display()
                ),
            }),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                Ok(DesktopTextStoreReadResult {
                    exists: false,
                    contents: None,
                    message: "Desktop notes store has not been created yet.".to_string(),
                })
            }
            Err(error) => Err(error.to_string()),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn desktop_write_notes_store(
    app: tauri::AppHandle,
    contents: String,
) -> Result<DesktopOperationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_file_path = resolve_runtime_paths(&app)?
            .runtime_data_dir
            .join("desktop-notes.json");
        ensure_parent_dir_exists(&target_file_path)?;
        std::fs::write(&target_file_path, contents).map_err(|error| error.to_string())?;

        Ok(DesktopOperationResult {
            success: true,
            message: format!(
                "Saved desktop notes store to {}",
                target_file_path.display()
            ),
        })
    })
    .await
    .map_err(|error| error.to_string())?
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

fn prompt_save_file_path(
    app: &tauri::AppHandle,
    file_name: &str,
    dialog_title: Option<&str>,
) -> Result<Option<PathBuf>, String> {
    let normalized_file_name = sanitize_download_file_name(file_name);
    let normalized_dialog_title = dialog_title
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("保存附件");
    let Some(target_file_path) = app
        .dialog()
        .file()
        .set_title(normalized_dialog_title)
        .set_file_name(normalized_file_name)
        .blocking_save_file()
    else {
        return Ok(None);
    };

    target_file_path
        .into_path()
        .map(Some)
        .map_err(|error| error.to_string())
}

fn ensure_parent_dir_exists(target_file_path: &PathBuf) -> Result<(), String> {
    if let Some(parent_dir) = target_file_path.parent() {
        std::fs::create_dir_all(parent_dir).map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn cancelled_file_save_result() -> DesktopFileSaveResult {
    DesktopFileSaveResult {
        success: false,
        cancelled: true,
        saved_path: None,
        message: "已取消保存。".to_string(),
    }
}

fn saved_file_result(target_file_path: &PathBuf) -> DesktopFileSaveResult {
    DesktopFileSaveResult {
        success: true,
        cancelled: false,
        saved_path: Some(target_file_path.display().to_string()),
        message: format!("已保存到 {}", target_file_path.display()),
    }
}

fn sanitize_download_file_name(value: &str) -> String {
    let sanitized = value
        .trim()
        .trim_matches('.')
        .chars()
        .map(|ch| match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            control if control.is_control() => '_',
            other => other,
        })
        .collect::<String>();
    let sanitized = sanitized.trim().trim_matches('.').to_string();

    if sanitized.is_empty() {
        "download".to_string()
    } else {
        sanitized
    }
}

#[allow(dead_code)]
fn now_token() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}
