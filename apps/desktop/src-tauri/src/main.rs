#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    io,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
};

use serde::Serialize;
use tauri::{Manager, State};

struct DesktopState {
    core_api: Mutex<Option<ManagedCoreApiProcess>>,
}

struct ManagedCoreApiProcess {
    child: Child,
    port: u16,
    database_path: PathBuf,
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
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopOperationResult {
    success: bool,
    message: String,
}

fn main() {
    tauri::Builder::default()
        .manage(DesktopState {
            core_api: Mutex::new(None),
        })
        .setup(|app| {
            let handle = app.handle().clone();
            if let Err(error) = ensure_runtime_dirs(&handle) {
                return Err(Box::new(io::Error::new(io::ErrorKind::Other, error)));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_runtime_context,
            desktop_core_api_status,
            probe_core_api_health,
            start_core_api,
            stop_core_api
        ])
        .run(tauri::generate_context!())
        .expect("error while running yinjie desktop");
}

#[tauri::command]
fn desktop_runtime_context(app: tauri::AppHandle) -> Result<DesktopRuntimeContext, String> {
    let paths = resolve_runtime_paths(&app)?;
    Ok(DesktopRuntimeContext {
        app_data_dir: paths.app_data_dir.display().to_string(),
        runtime_data_dir: paths.runtime_data_dir.display().to_string(),
        database_path: paths.database_path.display().to_string(),
        core_api_port: paths.port,
        core_api_base_url: core_api_base_url(paths.port),
        app_url: default_app_url(),
    })
}

#[tauri::command]
fn desktop_core_api_status(
    app: tauri::AppHandle,
    state: State<DesktopState>,
) -> Result<DesktopCoreApiStatus, String> {
    let paths = resolve_runtime_paths(&app)?;
    let base_url = core_api_base_url(paths.port);
    let reachable = probe_health(&base_url);
    let mut guard = state.core_api.lock().map_err(|_| "core api state lock poisoned")?;

    let (running, pid, message, database_path) = match guard.as_mut() {
        Some(process) => {
            let exited = process
                .child
                .try_wait()
                .map_err(|error| error.to_string())?
                .is_some();
            if exited {
                *guard = None;
                (
                    false,
                    None,
                    if reachable {
                        "core api reachable but no managed child is attached".to_string()
                    } else {
                        "managed core api process has exited".to_string()
                    },
                    paths.database_path.display().to_string(),
                )
            } else {
                (
                    true,
                    Some(process.child.id()),
                    if reachable {
                        "managed core api process is running".to_string()
                    } else {
                        "managed core api process is running but health probe failed".to_string()
                    },
                    process.database_path.display().to_string(),
                )
            }
        }
        None => (
            false,
            None,
            if reachable {
                "core api is reachable but not managed by the desktop shell".to_string()
            } else {
                "core api is not running".to_string()
            },
            paths.database_path.display().to_string(),
        ),
    };

    Ok(DesktopCoreApiStatus {
        configured_port: paths.port,
        base_url,
        running,
        reachable,
        pid,
        database_path,
        message,
    })
}

#[tauri::command]
fn probe_core_api_health(app: tauri::AppHandle) -> Result<DesktopOperationResult, String> {
    let paths = resolve_runtime_paths(&app)?;
    let base_url = core_api_base_url(paths.port);
    let reachable = probe_health(&base_url);

    Ok(DesktopOperationResult {
        success: reachable,
        message: if reachable {
            format!("core api responded at {base_url}")
        } else {
            format!("core api did not respond at {base_url}")
        },
    })
}

#[tauri::command]
fn start_core_api(
    app: tauri::AppHandle,
    state: State<DesktopState>,
) -> Result<DesktopOperationResult, String> {
    let paths = resolve_runtime_paths(&app)?;
    ensure_runtime_dirs(&app)?;
    let mut guard = state.core_api.lock().map_err(|_| "core api state lock poisoned")?;

    if let Some(process) = guard.as_mut() {
        if process
            .child
            .try_wait()
            .map_err(|error| error.to_string())?
            .is_none()
        {
            return Ok(DesktopOperationResult {
                success: true,
                message: format!("core api already running on {}", core_api_base_url(process.port)),
            });
        }
    }

    let command = std::env::var("YINJIE_CORE_API_CMD")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("yinjie-core-api"));

    let mut child = Command::new(&command)
        .env("YINJIE_CORE_API_PORT", paths.port.to_string())
        .env("YINJIE_DATABASE_PATH", &paths.database_path)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| {
            format!(
                "failed to start core api with command {}: {}",
                command.display(),
                error
            )
        })?;

    let pid = child.id();
    *guard = Some(ManagedCoreApiProcess {
        child,
        port: paths.port,
        database_path: paths.database_path.clone(),
    });

    Ok(DesktopOperationResult {
        success: true,
        message: format!(
            "started core api process {} on {}",
            pid,
            core_api_base_url(paths.port)
        ),
    })
}

#[tauri::command]
fn stop_core_api(state: State<DesktopState>) -> Result<DesktopOperationResult, String> {
    let mut guard = state.core_api.lock().map_err(|_| "core api state lock poisoned")?;

    let Some(mut process) = guard.take() else {
        return Ok(DesktopOperationResult {
            success: true,
            message: "no managed core api process to stop".to_string(),
        });
    };

    process.child.kill().map_err(|error| error.to_string())?;
    let _ = process.child.wait();

    Ok(DesktopOperationResult {
        success: true,
        message: "stopped managed core api process".to_string(),
    })
}

struct RuntimePaths {
    app_data_dir: PathBuf,
    runtime_data_dir: PathBuf,
    database_path: PathBuf,
    port: u16,
}

fn resolve_runtime_paths(app: &tauri::AppHandle) -> Result<RuntimePaths, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let runtime_data_dir = app_data_dir.join("runtime-data");
    let database_path = runtime_data_dir.join("yinjie.sqlite");
    let port = std::env::var("YINJIE_CORE_API_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(39091);

    Ok(RuntimePaths {
        app_data_dir,
        runtime_data_dir,
        database_path,
        port,
    })
}

fn ensure_runtime_dirs(app: &tauri::AppHandle) -> Result<(), String> {
    let paths = resolve_runtime_paths(app)?;
    std::fs::create_dir_all(&paths.runtime_data_dir).map_err(|error| error.to_string())
}

fn core_api_base_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}")
}

fn default_app_url() -> String {
    if cfg!(debug_assertions) {
        "http://127.0.0.1:5180".to_string()
    } else {
        "app://index.html".to_string()
    }
}

fn probe_health(base_url: &str) -> bool {
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
