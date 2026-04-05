use std::{
    fs,
    path::{Path as FsPath, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use serde::Serialize;
use serde_json::json;

use crate::{
    app_state::AppState,
    evals,
    error::{ApiError, ApiResult},
    models::{
        InferencePreviewRequest, InferencePreviewResponse, InferenceUsageRecord,
        ProviderConfigResponse, ProviderTestRequest, ProviderTestResult, RealtimeRoomStatusRecord,
        RealtimeStatusRecord, SchedulerStatusRecord, UpdateProviderConfigRequest,
    },
    persistence, realtime, runtime_paths, scheduler,
    seed::{scheduler_jobs, LEGACY_MIGRATED_MODULES, SCHEDULER_COLD_START_ENABLED},
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ServiceHealth {
    name: String,
    healthy: bool,
    version: String,
    message: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DatabaseStatus {
    path: String,
    wal_enabled: bool,
    connected: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InferenceStatus {
    healthy: bool,
    active_provider: Option<String>,
    queue_depth: u32,
    max_concurrency: u32,
    in_flight_requests: u32,
    total_requests: u32,
    successful_requests: u32,
    failed_requests: u32,
    last_success_at: Option<String>,
    last_error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LegacySurfaceStatus {
    api_prefix: String,
    migrated_modules: Vec<String>,
    users_count: usize,
    characters_count: usize,
    narrative_arcs_count: usize,
    behavior_logs_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemStatus {
    core_api: ServiceHealth,
    desktop_shell: ServiceHealth,
    database: DatabaseStatus,
    inference_gateway: InferenceStatus,
    legacy_surface: LegacySurfaceStatus,
    scheduler: SchedulerStatusRecord,
    app_mode: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OperationResult {
    success: bool,
    message: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/status", get(system_status))
        .nest("/evals", evals::routes::router())
        .route("/realtime", get(realtime_status))
        .route("/scheduler", get(scheduler_status))
        .route("/scheduler/run/:id", post(run_scheduler_job))
        .route("/provider", get(get_provider_config).put(set_provider_config))
        .route("/provider/test", post(provider_test))
        .route("/inference/preview", post(inference_preview))
        .route("/logs", get(log_index))
        .route("/diag/export", post(export_diag))
        .route("/backup/create", post(create_backup))
        .route("/backup/restore", post(restore_backup))
}

async fn system_status(State(state): State<AppState>) -> Json<SystemStatus> {
    Json(build_system_status(&state))
}

async fn realtime_status(State(state): State<AppState>) -> Json<RealtimeStatusRecord> {
    Json(build_realtime_status(&state))
}

async fn get_provider_config(State(state): State<AppState>) -> Json<ProviderConfigResponse> {
    let runtime = state.runtime.read().expect("runtime lock poisoned");
    Json(build_provider_config_response(
        &runtime.config.provider.endpoint,
        &runtime.config.provider.model,
        runtime.config.provider.api_key.as_deref(),
        &runtime.config.provider.mode,
    ))
}

async fn set_provider_config(
    State(state): State<AppState>,
    Json(payload): Json<UpdateProviderConfigRequest>,
) -> ApiResult<Json<ProviderConfigResponse>> {
    let provider = normalize_provider_payload(
        &payload.endpoint,
        &payload.model,
        payload.api_key.as_deref(),
        &payload.mode,
    )
    .map_err(ApiError::bad_request)?;

    {
        let mut runtime = state.runtime.write().expect("runtime lock poisoned");
        runtime.config.ai_model = provider.model.clone();
        runtime.config.provider.endpoint = provider.endpoint.clone();
        runtime.config.provider.model = provider.model.clone();
        runtime.config.provider.api_key = provider.api_key.clone();
        runtime.config.provider.mode = provider.mode.clone();
    }

    state
        .inference_gateway
        .configure_provider(provider_config_to_gateway(
            &provider.endpoint,
            &provider.model,
            provider.api_key.as_deref(),
            &provider.mode,
        ));
    state.request_persist("system-set-provider");
    runtime_paths::append_core_api_log(
        &state.database_path,
        "INFO",
        &format!(
            "provider configuration updated: model={} endpoint={} mode={}",
            provider.model, provider.endpoint, provider.mode
        ),
    );

    Ok(Json(provider))
}

async fn provider_test(
    State(state): State<AppState>,
    Json(payload): Json<ProviderTestRequest>,
) -> Json<ProviderTestResult> {
    let provider = match normalize_provider_payload(
        &payload.endpoint,
        &payload.model,
        payload.api_key.as_deref(),
        payload.mode.as_deref().unwrap_or("cloud"),
    ) {
        Ok(provider) => provider,
        Err(message) => {
            return Json(ProviderTestResult {
                success: false,
                message,
                normalized_endpoint: Some(payload.endpoint.trim().trim_end_matches('/').to_string()),
                status_code: None,
            });
        }
    };

    match state
        .inference_gateway
        .probe_provider(provider_config_to_gateway(
            &provider.endpoint,
            &provider.model,
            provider.api_key.as_deref(),
            &provider.mode,
        ))
        .await
    {
        Ok(result) => Json(ProviderTestResult {
            success: result.success,
            message: result.message,
            normalized_endpoint: Some(result.normalized_endpoint),
            status_code: result.status_code,
        }),
        Err(message) => Json(ProviderTestResult {
            success: false,
            message,
            normalized_endpoint: Some(provider.endpoint),
            status_code: None,
        }),
    }
}

async fn inference_preview(
    State(state): State<AppState>,
    Json(payload): Json<InferencePreviewRequest>,
) -> Json<InferencePreviewResponse> {
    let prompt = payload.prompt.trim().to_string();
    if prompt.is_empty() {
        return Json(InferencePreviewResponse {
            success: false,
            output: None,
            model: None,
            finish_reason: None,
            usage: None,
            error: Some("Preview prompt is required".into()),
        });
    }

    let mut messages = Vec::new();
    if let Some(system_prompt) = payload
        .system_prompt
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        messages.push(yinjie_inference_gateway::ChatMessage {
            role: "system".into(),
            content: system_prompt.to_string(),
        });
    }
    messages.push(yinjie_inference_gateway::ChatMessage {
        role: "user".into(),
        content: prompt,
    });

    let request = yinjie_inference_gateway::ChatCompletionRequest {
        messages,
        model: payload
            .model
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string()),
        temperature: Some(0.3),
        max_tokens: Some(256),
    };

    match state.inference_gateway.chat_completion(request).await {
        Ok(result) => {
            runtime_paths::append_core_api_log(
                &state.database_path,
                "INFO",
                &format!("inference preview succeeded for model {}", result.model),
            );

            Json(InferencePreviewResponse {
                success: true,
                output: Some(result.content),
                model: Some(result.model),
                finish_reason: result.finish_reason,
                usage: result.usage.map(|usage| InferenceUsageRecord {
                    prompt_tokens: usage.prompt_tokens,
                    completion_tokens: usage.completion_tokens,
                    total_tokens: usage.total_tokens,
                }),
                error: None,
            })
        }
        Err(message) => {
            runtime_paths::append_core_api_log(
                &state.database_path,
                "WARN",
                &format!("inference preview failed: {}", message),
            );

            Json(InferencePreviewResponse {
                success: false,
                output: None,
                model: None,
                finish_reason: None,
                usage: None,
                error: Some(message),
            })
        }
    }
}

async fn scheduler_status(State(state): State<AppState>) -> Json<SchedulerStatusRecord> {
    Json(build_scheduler_status(&state))
}

async fn run_scheduler_job(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> ApiResult<Json<OperationResult>> {
    let message = scheduler::run_job_now(state, &id)
        .await
        .map_err(ApiError::bad_request)?;

    Ok(Json(OperationResult {
        success: true,
        message,
    }))
}

async fn log_index(State(state): State<AppState>) -> Json<Vec<String>> {
    Json(build_log_index(&state))
}

async fn export_diag(State(state): State<AppState>) -> ApiResult<Json<OperationResult>> {
    let export_dir = export_diagnostics_bundle(&state).map_err(ApiError::bad_request)?;
    runtime_paths::append_core_api_log(
        &state.database_path,
        "INFO",
        &format!("diagnostics exported to {}", export_dir.display()),
    );

    Ok(Json(OperationResult {
        success: true,
        message: format!("Diagnostics exported to {}", export_dir.display()),
    }))
}

async fn create_backup(State(state): State<AppState>) -> ApiResult<Json<OperationResult>> {
    let backup_path = persistence::create_backup(&state).map_err(ApiError::bad_request)?;
    runtime_paths::append_core_api_log(
        &state.database_path,
        "INFO",
        &format!("backup created at {}", backup_path.display()),
    );

    Ok(Json(OperationResult {
        success: true,
        message: format!("Backup created at {}", backup_path.display()),
    }))
}

async fn restore_backup(State(state): State<AppState>) -> ApiResult<Json<OperationResult>> {
    let backup_path = persistence::restore_latest_backup(&state).map_err(ApiError::bad_request)?;
    state.request_persist("system-restore-backup");
    runtime_paths::append_core_api_log(
        &state.database_path,
        "INFO",
        &format!("restored runtime state from {}", backup_path.display()),
    );

    Ok(Json(OperationResult {
        success: true,
        message: format!("Restored runtime state from {}", backup_path.display()),
    }))
}

fn build_scheduler_status(state: &AppState) -> SchedulerStatusRecord {
    let runtime = state.runtime.read().expect("runtime lock poisoned");
    let scheduler_state = state.scheduler.read().expect("scheduler lock poisoned");
    let mut jobs = scheduler_jobs();

    for job in &mut jobs {
        if let Some(execution) = scheduler_state.jobs.get(&job.id) {
            job.run_count = execution.run_count;
            job.running = execution.running;
            job.last_run_at = execution.last_run_at.clone();
            job.last_duration_ms = execution.last_duration_ms;
            job.last_result = execution.last_result.clone();
        }
    }

    SchedulerStatusRecord {
        healthy: true,
        mode: if scheduler_state.mode.is_empty() {
            "scaffolded".into()
        } else {
            scheduler_state.mode.clone()
        },
        cold_start_enabled: SCHEDULER_COLD_START_ENABLED,
        world_snapshots: runtime.world_contexts.len(),
        last_world_snapshot_at: runtime
            .world_contexts
            .last()
            .map(|context| context.timestamp.clone()),
        jobs,
        started_at: scheduler_state.started_at.clone(),
        recent_runs: scheduler_state.recent_runs.clone(),
    }
}

fn build_system_status(state: &AppState) -> SystemStatus {
    let runtime = state.runtime.read().expect("runtime lock poisoned");
    let scheduler = build_scheduler_status(state);
    let snapshot_path = persistence::snapshot_path(&state.database_path);
    let gateway_metrics = state.inference_gateway.metrics();

    SystemStatus {
        core_api: ServiceHealth {
            name: "yinjie-core-api".into(),
            healthy: true,
            version: env!("CARGO_PKG_VERSION").into(),
            message: Some(format!(
                "Compatibility surface online for {} legacy modules.",
                LEGACY_MIGRATED_MODULES.len()
            )),
        },
        desktop_shell: ServiceHealth {
            name: "yinjie-desktop".into(),
            healthy: true,
            version: "0.1.0".into(),
            message: Some(
                "Desktop shell packaging has been validated on this machine with MSI output."
                    .into(),
            ),
        },
        database: DatabaseStatus {
            path: state.database_path.display().to_string(),
            wal_enabled: true,
            connected: snapshot_path.exists(),
        },
        inference_gateway: InferenceStatus {
            healthy: gateway_metrics.active_provider.is_some() && gateway_metrics.last_error.is_none(),
            active_provider: gateway_metrics
                .active_provider
                .as_ref()
                .map(|provider| format!("{} @ {}", provider.model, provider.endpoint)),
            queue_depth: gateway_metrics.queue_depth as u32,
            max_concurrency: gateway_metrics.max_concurrency as u32,
            in_flight_requests: gateway_metrics.in_flight_requests as u32,
            total_requests: gateway_metrics.total_requests as u32,
            successful_requests: gateway_metrics.successful_requests as u32,
            failed_requests: gateway_metrics.failed_requests as u32,
            last_success_at: gateway_metrics.last_success_at,
            last_error: gateway_metrics.last_error,
        },
        legacy_surface: LegacySurfaceStatus {
            api_prefix: "/api".into(),
            migrated_modules: LEGACY_MIGRATED_MODULES
                .iter()
                .map(|module| (*module).to_string())
                .collect(),
            users_count: runtime.users.len(),
            characters_count: runtime.characters.len(),
            narrative_arcs_count: runtime.narrative_arcs.len(),
            behavior_logs_count: runtime.ai_behavior_logs.len(),
        },
        scheduler,
        app_mode: std::env::var("YINJIE_APP_MODE").unwrap_or_else(|_| "development".into()),
    }
}

fn build_realtime_status(state: &AppState) -> RealtimeStatusRecord {
    let realtime_state = state.realtime.read().expect("realtime lock poisoned");
    let mut rooms = realtime_state
        .room_subscribers
        .iter()
        .map(|(room_id, subscriber_count)| RealtimeRoomStatusRecord {
            room_id: room_id.clone(),
            subscriber_count: *subscriber_count,
        })
        .collect::<Vec<_>>();

    rooms.sort_by(|left, right| left.room_id.cmp(&right.room_id));

    RealtimeStatusRecord {
        healthy: true,
        namespace: realtime::namespace().into(),
        socket_path: realtime::socket_path().into(),
        connected_clients: realtime_state.connected_clients,
        active_rooms: realtime_state.room_subscribers.len(),
        event_names: realtime::event_names(),
        rooms,
        recent_events: realtime_state.recent_events.clone(),
        last_event_at: realtime_state.last_event_at.clone(),
        last_message_at: realtime_state.last_message_at.clone(),
    }
}

fn build_log_index(state: &AppState) -> Vec<String> {
    let mut logs = collect_existing_files(&runtime_paths::logs_dir(&state.database_path));

    if logs.is_empty() {
        logs.push(runtime_paths::core_api_log_path(&state.database_path));
    }

    logs.sort();
    logs.into_iter()
        .map(|path| path.display().to_string())
        .collect()
}

fn normalize_provider_payload(
    endpoint: &str,
    model: &str,
    api_key: Option<&str>,
    mode: &str,
) -> Result<ProviderConfigResponse, String> {
    let normalized_endpoint = endpoint.trim().trim_end_matches('/').to_string();
    let normalized_model = model.trim().to_string();
    let normalized_mode = mode.trim().to_string();
    let normalized_api_key = api_key.and_then(|value| {
        let normalized = value.trim().to_string();
        if normalized.is_empty() {
            None
        } else {
            Some(normalized)
        }
    });

    if normalized_endpoint.is_empty() {
        return Err("Provider endpoint is required".into());
    }
    if !normalized_endpoint.starts_with("http://") && !normalized_endpoint.starts_with("https://") {
        return Err("Provider endpoint must start with http:// or https://".into());
    }
    if normalized_model.is_empty() {
        return Err("Provider model is required".into());
    }
    if normalized_mode.is_empty() {
        return Err("Provider mode is required".into());
    }

    Ok(build_provider_config_response(
        &normalized_endpoint,
        &normalized_model,
        normalized_api_key.as_deref(),
        &normalized_mode,
    ))
}

fn build_provider_config_response(
    endpoint: &str,
    model: &str,
    api_key: Option<&str>,
    mode: &str,
) -> ProviderConfigResponse {
    ProviderConfigResponse {
        endpoint: endpoint.to_string(),
        model: model.to_string(),
        api_key: api_key.map(|value| value.to_string()),
        mode: mode.to_string(),
    }
}

fn provider_config_to_gateway(
    endpoint: &str,
    model: &str,
    api_key: Option<&str>,
    mode: &str,
) -> yinjie_inference_gateway::ProviderConfig {
    yinjie_inference_gateway::ProviderConfig {
        endpoint: endpoint.to_string(),
        model: model.to_string(),
        api_key: api_key.map(|value| value.to_string()),
        mode: mode.to_string(),
    }
}

fn export_diagnostics_bundle(state: &AppState) -> Result<PathBuf, String> {
    let diagnostics_dir = runtime_paths::diagnostics_dir(&state.database_path);
    let export_dir = diagnostics_dir.join(format!("diagnostics-{}", now_token()));

    fs::create_dir_all(&export_dir)
        .map_err(|error| format!("create {}: {error}", export_dir.display()))?;

    let snapshot_path = persistence::flush_now(state, "diagnostics-export")?;
    let system_status = build_system_status(state);
    let realtime_status = build_realtime_status(state);
    let scheduler_status = build_scheduler_status(state);
    let log_paths = build_log_index_paths(state);

    write_json_file(&export_dir.join("system-status.json"), &system_status)?;
    write_json_file(&export_dir.join("realtime-status.json"), &realtime_status)?;
    write_json_file(&export_dir.join("scheduler-status.json"), &scheduler_status)?;
    write_json_file(
        &export_dir.join("manifest.json"),
        &json!({
            "exportedAt": now_token(),
            "coreApiVersion": env!("CARGO_PKG_VERSION"),
            "databasePath": state.database_path.display().to_string(),
            "snapshotPath": snapshot_path.display().to_string(),
            "logPaths": log_paths.iter().map(|path| path.display().to_string()).collect::<Vec<_>>(),
            "backupDir": persistence::backup_dir(&state.database_path).display().to_string(),
            "appMode": std::env::var("YINJIE_APP_MODE").unwrap_or_else(|_| "development".into()),
        }),
    )?;

    copy_if_exists(&snapshot_path, &export_dir.join("runtime-snapshot.json"))?;
    copy_files(&log_paths, &export_dir.join("logs"))?;
    copy_recent_backups(
        &persistence::backup_dir(&state.database_path),
        &export_dir.join("backups"),
    )?;

    Ok(export_dir)
}

fn build_log_index_paths(state: &AppState) -> Vec<PathBuf> {
    let mut paths = collect_existing_files(&runtime_paths::logs_dir(&state.database_path));
    if paths.is_empty() {
        paths.push(runtime_paths::core_api_log_path(&state.database_path));
    }
    paths.sort();
    paths
}

fn collect_existing_files(dir: &FsPath) -> Vec<PathBuf> {
    fs::read_dir(dir)
        .ok()
        .into_iter()
        .flat_map(|entries| entries.filter_map(|entry| entry.ok().map(|item| item.path())))
        .filter(|path| path.is_file())
        .collect()
}

fn copy_recent_backups(source_dir: &FsPath, export_dir: &FsPath) -> Result<(), String> {
    if !source_dir.exists() {
        return Ok(());
    }

    let mut backups = collect_existing_files(source_dir);
    backups.sort();
    let selected = backups.into_iter().rev().take(3).collect::<Vec<_>>();
    copy_files(&selected, export_dir)
}

fn copy_files(files: &[PathBuf], export_dir: &FsPath) -> Result<(), String> {
    if files.is_empty() {
        return Ok(());
    }

    fs::create_dir_all(export_dir)
        .map_err(|error| format!("create {}: {error}", export_dir.display()))?;

    for file in files {
        if let Some(name) = file.file_name() {
            copy_if_exists(file, &export_dir.join(name))?;
        }
    }

    Ok(())
}

fn copy_if_exists(source: &FsPath, target: &FsPath) -> Result<(), String> {
    if !source.exists() {
        return Ok(());
    }

    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("create {}: {error}", parent.display()))?;
    }

    fs::copy(source, target)
        .map_err(|error| format!("copy {} -> {}: {error}", source.display(), target.display()))?;

    Ok(())
}

fn write_json_file(path: &FsPath, value: &impl Serialize) -> Result<(), String> {
    let content = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("serialize {}: {error}", path.display()))?;

    fs::write(path, content).map_err(|error| format!("write {}: {error}", path.display()))
}

fn now_token() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}
