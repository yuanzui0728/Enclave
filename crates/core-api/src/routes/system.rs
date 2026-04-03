use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use serde::Serialize;

use crate::{
    app_state::AppState,
    models::{ProviderTestRequest, ProviderTestResult, SchedulerStatusRecord},
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
        .route("/scheduler", get(scheduler_status))
        .route("/provider/test", post(provider_test))
        .route("/logs", get(log_index))
        .route("/diag/export", post(export_diag))
        .route("/backup/create", post(create_backup))
        .route("/backup/restore", post(restore_backup))
}

async fn system_status(State(state): State<AppState>) -> Json<SystemStatus> {
    let runtime = state.runtime.read().expect("runtime lock poisoned");

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
      healthy: false,
      version: "0.1.0".into(),
      message: Some("Desktop shell scaffolded; Rust toolchain is still required for runtime validation.".into()),
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
      healthy: true,
      mode: "scaffolded".into(),
      cold_start_enabled: SCHEDULER_COLD_START_ENABLED,
      world_snapshots: runtime.world_contexts.len(),
      last_world_snapshot_at: runtime.world_contexts.last().map(|context| context.timestamp.clone()),
      jobs: scheduler_jobs(),
    },
    app_mode: std::env::var("YINJIE_APP_MODE").unwrap_or_else(|_| "development".into()),
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
    let runtime = state.runtime.read().expect("runtime lock poisoned");

    Json(SchedulerStatusRecord {
        healthy: true,
        mode: "scaffolded".into(),
        cold_start_enabled: SCHEDULER_COLD_START_ENABLED,
        world_snapshots: runtime.world_contexts.len(),
        last_world_snapshot_at: runtime
            .world_contexts
            .last()
            .map(|context| context.timestamp.clone()),
        jobs: scheduler_jobs(),
    })
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
