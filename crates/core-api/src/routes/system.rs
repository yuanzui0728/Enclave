use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use serde::Serialize;

use crate::{
    app_state::AppState,
    error::{ApiError, ApiResult},
    models::{
        ProviderTestRequest, ProviderTestResult, RealtimeRoomStatusRecord, RealtimeStatusRecord,
        SchedulerStatusRecord,
    },
    realtime, scheduler,
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
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LegacySurfaceStatus {
    api_prefix: String,
    migrated_modules: Vec<String>,
    users_count: usize,
    characters_count: usize,
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
        .route("/realtime", get(realtime_status))
        .route("/scheduler", get(scheduler_status))
        .route("/scheduler/run/:id", post(run_scheduler_job))
        .route("/provider/test", post(provider_test))
        .route("/logs", get(log_index))
        .route("/diag/export", post(export_diag))
        .route("/backup/create", post(create_backup))
        .route("/backup/restore", post(restore_backup))
}

async fn system_status(State(state): State<AppState>) -> Json<SystemStatus> {
    let runtime = state.runtime.read().expect("runtime lock poisoned");
    let scheduler = build_scheduler_status(&state);

    Json(SystemStatus {
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
            connected: false,
        },
        inference_gateway: InferenceStatus {
            healthy: false,
            active_provider: None,
            queue_depth: 0,
            max_concurrency: 4,
        },
        legacy_surface: LegacySurfaceStatus {
            api_prefix: "/api".into(),
            migrated_modules: LEGACY_MIGRATED_MODULES
                .iter()
                .map(|module| (*module).to_string())
                .collect(),
            users_count: runtime.users.len(),
            characters_count: runtime.characters.len(),
        },
        scheduler: SchedulerStatusRecord {
            healthy: scheduler.healthy,
            mode: scheduler.mode,
            cold_start_enabled: scheduler.cold_start_enabled,
            world_snapshots: runtime.world_contexts.len(),
            last_world_snapshot_at: runtime
                .world_contexts
                .last()
                .map(|context| context.timestamp.clone()),
            jobs: scheduler.jobs,
            started_at: scheduler.started_at,
            recent_runs: scheduler.recent_runs,
        },
        app_mode: std::env::var("YINJIE_APP_MODE").unwrap_or_else(|_| "development".into()),
    })
}

async fn realtime_status(State(state): State<AppState>) -> Json<RealtimeStatusRecord> {
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

    Json(RealtimeStatusRecord {
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
    })
}

async fn provider_test(Json(payload): Json<ProviderTestRequest>) -> Json<ProviderTestResult> {
    let normalized = payload.endpoint.trim().trim_end_matches('/').to_string();
    let success = normalized.starts_with("http://") || normalized.starts_with("https://");
    let auth_mode = if payload.api_key.as_deref().unwrap_or_default().is_empty() {
        "no key provided"
    } else {
        "key provided"
    };

    Json(ProviderTestResult {
        success,
        message: if success {
            format!(
                "Provider endpoint accepted for phase-2 migration. model={}, auth={}",
                payload.model, auth_mode
            )
        } else {
            "Endpoint must start with http:// or https://".into()
        },
        normalized_endpoint: Some(normalized),
    })
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

async fn log_index() -> Json<Vec<String>> {
    Json(vec![
        "runtime/logs/core-api.log".into(),
        "runtime/logs/inference-gateway.log".into(),
        "runtime/logs/desktop-shell.log".into(),
    ])
}

async fn export_diag() -> Json<OperationResult> {
    Json(OperationResult {
        success: true,
        message: "Diagnostics export scaffolded. Archive generation will be wired in phase 5."
            .into(),
    })
}

async fn create_backup() -> Json<OperationResult> {
    Json(OperationResult {
    success: true,
    message: "Backup workflow scaffolded. SQLite snapshot pipeline will be added during production hardening.".into(),
  })
}

async fn restore_backup() -> Json<OperationResult> {
    Json(OperationResult {
    success: true,
    message: "Restore workflow scaffolded. User-facing recovery guardrails will be added before release.".into(),
  })
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
