mod app_state;
mod error;
mod generation;
mod models;
mod persistence;
mod realtime;
mod routes;
mod runtime_paths;
mod scheduler;
mod seed;

use std::{
    fs,
    net::SocketAddr,
    path::{Path, PathBuf},
};

use anyhow::Context;
use axum::{http::StatusCode, response::IntoResponse, routing::get, Router};
use socketioxide::SocketIo;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing::info;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::prelude::*;

use crate::app_state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let port = std::env::var("YINJIE_CORE_API_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(39091);

    let database_path = std::env::var("YINJIE_DATABASE_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("./runtime-data/yinjie.sqlite"));
    let log_path = runtime_paths::core_api_log_path(&database_path);
    let _log_guard = init_tracing(&log_path)?;

    let (state, persistence_receiver) = AppState::new(port, database_path);
    persistence::install(state.clone(), persistence_receiver);
    let (socket_layer, io) = SocketIo::new_layer();
    realtime::install(io, state.clone());
    scheduler::install(state.clone());
    state.request_persist("core-api-started");

    let router = Router::new()
        .route("/health", get(health))
        .nest("/system", routes::system::router())
        .nest("/api", routes::legacy::router())
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .layer(socket_layer)
        .with_state(state.clone());

    let address = SocketAddr::from(([127, 0, 0, 1], state.port));
    runtime_paths::append_core_api_log(
        &state.database_path,
        "INFO",
        &format!("starting yinjie-core-api on {}", address),
    );
    info!("starting yinjie-core-api on {}", address);

    let listener = tokio::net::TcpListener::bind(address)
        .await
        .with_context(|| format!("failed to bind core api on {address}"))?;

    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("core api server error")?;

    Ok(())
}

async fn health() -> impl IntoResponse {
    (StatusCode::OK, "ok")
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}

fn init_tracing(log_path: &Path) -> anyhow::Result<WorkerGuard> {
    if let Some(parent) = log_path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create log directory {}", parent.display()))?;
    }

    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "info,tower_http=info".into());
    let log_dir = log_path.parent().unwrap_or_else(|| Path::new("."));
    let file_name = log_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("core-api.log");
    let file_appender = tracing_appender::rolling::never(log_dir, file_name);
    let (file_writer, guard) = tracing_appender::non_blocking(file_appender);

    tracing_subscriber::registry()
        .with(filter)
        .with(
            tracing_subscriber::fmt::layer()
                .with_target(false)
                .compact(),
        )
        .with(
            tracing_subscriber::fmt::layer()
                .with_ansi(false)
                .with_target(false)
                .compact()
                .with_writer(file_writer),
        )
        .init();

    Ok(guard)
}
