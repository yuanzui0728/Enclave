#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    io,
    io::Write,
    net::TcpListener,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use serde::Serialize;
use tauri::{Manager, State};

struct DesktopState {
    core_api: Mutex<Option<ManagedCoreApiProcess>>,
    last_core_api_error: Mutex<Option<String>>,
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

struct CoreApiCommandResolution {
    command: PathBuf,
    source: &'static str,
    bundled_path: PathBuf,
    bundled_exists: bool,
    resolved: bool,
}

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn main() {
    tauri::Builder::default()
        .manage(DesktopState {
            core_api: Mutex::new(None),
            last_core_api_error: Mutex::new(None),
        })
        .setup(|app| {
            let handle = app.handle().clone();
            if let Err(error) = ensure_runtime_dirs(&handle) {
                return Err(Box::new(io::Error::new(io::ErrorKind::Other, error)));
            }
            if let Err(error) = attempt_core_api_autostart(&handle) {
                append_desktop_log(&handle, "ERROR", &error).ok();
                eprintln!("desktop core api autostart skipped: {error}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_runtime_context,
            desktop_core_api_status,
            desktop_runtime_diagnostics,
            probe_core_api_health,
            start_core_api,
            stop_core_api,
            restart_core_api
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
    let resolution = resolve_core_api_command(&app);
    let mut guard = state.core_api.lock().map_err(|_| "core api state lock poisoned")?;

    let (running, pid, message, database_path, managed_by_desktop_shell) = match guard.as_mut() {
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
                    false,
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
                    true,
                )
            }
        }
        None => (
            false,
            None,
            if reachable {
                "core api is reachable but not managed by the desktop shell".to_string()
            } else if resolution.source == "bundled" && resolution.bundled_exists {
                "core api is not running; next launch will use the bundled sidecar".to_string()
            } else if resolution.source == "env" {
                format!(
                    "core api is not running; next launch will use YINJIE_CORE_API_CMD ({})",
                    resolution.command.display()
                )
            } else if resolution.resolved {
                format!(
                    "core api is not running; next launch will use PATH command {}",
                    resolution.command.display()
                )
            } else {
                format!(
                    "core api is not running and command {} is unresolved",
                    resolution.command.display()
                )
            },
            paths.database_path.display().to_string(),
            false,
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
        command: resolution.command.display().to_string(),
        command_source: resolution.source.to_string(),
        managed_by_desktop_shell,
    })
}

#[tauri::command]
fn desktop_runtime_diagnostics(
    app: tauri::AppHandle,
    state: State<DesktopState>,
) -> DesktopRuntimeDiagnostics {
    let paths = resolve_runtime_paths(&app).ok();
    let resolution = resolve_core_api_command(&app);
    let desktop_log_path = paths
        .as_ref()
        .map(|value| value.logs_dir.join("desktop.log").display().to_string())
        .unwrap_or_else(|| "runtime-data/logs/desktop.log".to_string());
    let linux_missing_packages = linux_missing_packages();
    let reachable = paths
        .as_ref()
        .map(|value| probe_health(&core_api_base_url(value.port)))
        .unwrap_or(false);
    let port_occupied = paths
        .as_ref()
        .map(|value| is_port_occupied(value.port))
        .unwrap_or(false);
    let last_core_api_error = state
        .last_core_api_error
        .lock()
        .ok()
        .and_then(|value| value.clone());
    let (managed_by_desktop_shell, managed_child_pid) = state
        .core_api
        .lock()
        .ok()
        .and_then(|guard| {
            guard.as_ref().map(|process| {
                let pid = process.child.id();
                (true, Some(pid))
            })
        })
        .unwrap_or((false, None));
    let diagnostics_status = classify_diagnostics_status(
        &resolution,
        reachable,
        port_occupied,
        last_core_api_error.as_deref(),
    );

    let summary = if diagnostics_status == "bundled-sidecar-missing" {
        format!(
            "bundled core api sidecar is missing at {}",
            resolution.bundled_path.display()
        )
    } else if diagnostics_status == "command-missing" {
        format!(
            "core api command {} is not currently resolvable",
            resolution.command.display()
        )
    } else if diagnostics_status == "port-occupied" {
        paths.as_ref()
            .map(|value| format!("core api port {} is already occupied by another process", value.port))
            .unwrap_or_else(|| "core api port is already occupied by another process".to_string())
    } else if let Some(error) = &last_core_api_error {
        format!("last core api start error: {error}")
    } else if diagnostics_status == "health-probe-failed" {
        format!(
            "core api command resolved via {}, but health probe is still failing",
            resolution.source
        )
    } else if linux_missing_packages.is_empty() {
        format!("desktop runtime dependencies look ready via {}", resolution.source)
    } else {
        format!(
            "missing Linux desktop packages: {}",
            linux_missing_packages.join(", ")
        )
    };

    DesktopRuntimeDiagnostics {
        platform: std::env::consts::OS.to_string(),
        core_api_command: resolution.command.display().to_string(),
        core_api_command_source: resolution.source.to_string(),
        core_api_command_resolved: resolution.resolved,
        core_api_reachable: reachable,
        diagnostics_status: diagnostics_status.to_string(),
        bundled_core_api_path: resolution.bundled_path.display().to_string(),
        bundled_core_api_exists: resolution.bundled_exists,
        core_api_port_occupied: port_occupied,
        managed_by_desktop_shell,
        managed_child_pid,
        desktop_log_path,
        last_core_api_error,
        linux_missing_packages,
        summary,
    }
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

    if let Some(message) = ensure_managed_process_alive(&mut guard)? {
        return Ok(DesktopOperationResult {
            success: true,
            message,
        });
    }

    let pid = spawn_managed_core_api(&app, &paths, &mut guard, state.inner())?;

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

#[tauri::command]
fn restart_core_api(
    app: tauri::AppHandle,
    state: State<DesktopState>,
) -> Result<DesktopOperationResult, String> {
    {
        let mut guard = state.core_api.lock().map_err(|_| "core api state lock poisoned")?;
        if let Some(mut process) = guard.take() {
            let _ = process.child.kill();
            let _ = process.child.wait();
        }
    }

    let paths = resolve_runtime_paths(&app)?;
    ensure_runtime_dirs(&app)?;
    let mut guard = state.core_api.lock().map_err(|_| "core api state lock poisoned")?;
    let pid = spawn_managed_core_api(&app, &paths, &mut guard, state.inner())?;

    Ok(DesktopOperationResult {
        success: true,
        message: format!(
            "restarted core api process {} on {}",
            pid,
            core_api_base_url(paths.port)
        ),
    })
}

fn attempt_core_api_autostart(app: &tauri::AppHandle) -> Result<(), String> {
    let autostart_enabled = std::env::var("YINJIE_DESKTOP_AUTOSTART_CORE_API")
        .map(|value| value != "0" && value.to_lowercase() != "false")
        .unwrap_or(true);

    if !autostart_enabled {
        return Ok(());
    }

    let paths = resolve_runtime_paths(app)?;
    let base_url = core_api_base_url(paths.port);
    if probe_health(&base_url) {
        return Ok(());
    }

    let state = app.state::<DesktopState>();
    let mut guard = state
        .core_api
        .lock()
        .map_err(|_| "core api state lock poisoned")?;

    if ensure_managed_process_alive(&mut guard)?.is_some() {
        return Ok(());
    }

    let _ = spawn_managed_core_api(app, &paths, &mut guard, state.inner())?;
    Ok(())
}

struct RuntimePaths {
    app_data_dir: PathBuf,
    runtime_data_dir: PathBuf,
    database_path: PathBuf,
    logs_dir: PathBuf,
    port: u16,
}

fn resolve_runtime_paths(app: &tauri::AppHandle) -> Result<RuntimePaths, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let runtime_data_dir = app_data_dir.join("runtime-data");
    let database_path = runtime_data_dir.join("yinjie.sqlite");
    let logs_dir = runtime_data_dir.join("logs");
    let port = std::env::var("YINJIE_CORE_API_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(39091);

    Ok(RuntimePaths {
        app_data_dir,
        runtime_data_dir,
        database_path,
        logs_dir,
        port,
    })
}

fn ensure_runtime_dirs(app: &tauri::AppHandle) -> Result<(), String> {
    let paths = resolve_runtime_paths(app)?;
    std::fs::create_dir_all(&paths.runtime_data_dir).map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&paths.logs_dir).map_err(|error| error.to_string())
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

fn ensure_managed_process_alive(
    guard: &mut Option<ManagedCoreApiProcess>,
) -> Result<Option<String>, String> {
    let Some(process) = guard.as_mut() else {
        return Ok(None);
    };

    let exited = process
        .child
        .try_wait()
        .map_err(|error| error.to_string())?
        .is_some();

    if exited {
        *guard = None;
        return Ok(None);
    }

    Ok(Some(format!(
        "core api already running on {}",
        core_api_base_url(process.port)
    )))
}

fn spawn_managed_core_api(
    app: &tauri::AppHandle,
    paths: &RuntimePaths,
    guard: &mut Option<ManagedCoreApiProcess>,
    state: &DesktopState,
) -> Result<u32, String> {
    let resolution = resolve_core_api_command(app);
    let command = resolution.command;

    let mut process = Command::new(&command);
    process
        .env("YINJIE_CORE_API_PORT", paths.port.to_string())
        .env("YINJIE_DATABASE_PATH", &paths.database_path)
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    apply_windows_background_spawn(&mut process);

    let child = process
        .spawn()
        .map_err(|error| {
            let message = format!(
                "failed to start core api with command {}: {}",
                command.display(),
                error
            );
            record_core_api_error(app, state, &message);
            message
        })?;

    let pid = child.id();
    *guard = Some(ManagedCoreApiProcess {
        child,
        port: paths.port,
        database_path: paths.database_path.clone(),
    });
    clear_core_api_error(state);

    Ok(pid)
}

fn apply_windows_background_spawn(command: &mut Command) {
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
}

fn resolve_core_api_command(app: &tauri::AppHandle) -> CoreApiCommandResolution {
    let bundled_path = bundled_core_api_path(app);
    let bundled_exists = bundled_path.exists();

    if let Ok(command) = std::env::var("YINJIE_CORE_API_CMD") {
        let command = PathBuf::from(command);
        let resolved = command
            .to_str()
            .map(command_exists)
            .unwrap_or_else(|| command.exists());

        return CoreApiCommandResolution {
            command,
            source: "env",
            bundled_path,
            bundled_exists,
            resolved,
        };
    }

    if bundled_exists {
        return CoreApiCommandResolution {
            command: bundled_path.clone(),
            source: "bundled",
            bundled_path,
            bundled_exists: true,
            resolved: true,
        };
    }

    let command = fallback_core_api_command();
    let resolved = command_exists(command.to_string_lossy().as_ref());

    CoreApiCommandResolution {
        command,
        source: "path",
        bundled_path,
        bundled_exists: false,
        resolved,
    }
}

fn fallback_core_api_command() -> PathBuf {
    PathBuf::from(executable_name("yinjie-core-api"))
}

fn bundled_core_api_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .resource_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(executable_name("yinjie-core-api"))
}

fn executable_name(name: &str) -> String {
    if cfg!(target_os = "windows") {
        format!("{name}.exe")
    } else {
        name.to_string()
    }
}

fn command_exists(command: &str) -> bool {
    if command.contains(std::path::MAIN_SEPARATOR) {
        return PathBuf::from(command).exists();
    }

    std::env::var_os("PATH")
        .map(|paths| {
            std::env::split_paths(&paths).any(|path| {
                let candidate = path.join(command);
                if candidate.exists() {
                    return true;
                }

                #[cfg(target_os = "windows")]
                {
                    if candidate.extension().is_none() {
                        return path.join(format!("{command}.exe")).exists();
                    }
                }

                false
            })
        })
        .unwrap_or(false)
}

fn record_core_api_error(app: &tauri::AppHandle, state: &DesktopState, message: &str) {
    if let Ok(mut last_error) = state.last_core_api_error.lock() {
        *last_error = Some(message.to_string());
    }

    let _ = append_desktop_log(app, "ERROR", message);
}

fn clear_core_api_error(state: &DesktopState) {
    if let Ok(mut last_error) = state.last_core_api_error.lock() {
        *last_error = None;
    }
}

fn append_desktop_log(app: &tauri::AppHandle, level: &str, message: &str) -> Result<(), String> {
    let paths = resolve_runtime_paths(app)?;
    std::fs::create_dir_all(&paths.logs_dir).map_err(|error| error.to_string())?;
    let log_path = paths.logs_dir.join("desktop.log");
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .map_err(|error| error.to_string())?;
    writeln!(file, "{} [{}] {}", now_token(), level, message).map_err(|error| error.to_string())
}

fn now_token() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}

fn classify_diagnostics_status(
    resolution: &CoreApiCommandResolution,
    reachable: bool,
    port_occupied: bool,
    last_error: Option<&str>,
) -> &'static str {
    if reachable {
        return "ready";
    }

    if resolution.source == "bundled" && !resolution.bundled_exists {
        return "bundled-sidecar-missing";
    }

    if !resolution.resolved {
        return "command-missing";
    }

    if port_occupied {
        return "port-occupied";
    }

    if last_error.is_some() {
        return "spawn-failed";
    }

    "health-probe-failed"
}

fn is_port_occupied(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_err()
}

fn linux_missing_packages() -> Vec<String> {
    #[cfg(target_os = "linux")]
    {
        let required_packages = ["glib-2.0", "gobject-2.0", "gtk+-3.0", "webkit2gtk-4.1"];
        return required_packages
            .iter()
            .filter(|package| !pkg_config_exists(package))
            .map(|package| (*package).to_string())
            .collect();
    }

    #[cfg(not(target_os = "linux"))]
    {
        Vec::new()
    }
}

#[cfg(target_os = "linux")]
fn pkg_config_exists(package: &str) -> bool {
    Command::new("pkg-config")
        .arg("--exists")
        .arg(package)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
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
