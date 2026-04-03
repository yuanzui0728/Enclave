mod app_state;
mod error;
mod models;
mod realtime;
mod routes;
mod seed;

use std::{net::SocketAddr, path::PathBuf};

use anyhow::Context;
use axum::{http::StatusCode, response::IntoResponse, routing::get, Router};
use socketioxide::SocketIo;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing::info;

use crate::app_state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    init_tracing();

    let port = std::env::var("YINJIE_CORE_API_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(39091);

    let database_path = std::env::var("YINJIE_DATABASE_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("./runtime-data/yinjie.sqlite"));

    let state = AppState::new(port, database_path);
    let (socket_layer, io) = SocketIo::new_layer();
    realtime::install(io, state.clone());

    let router = Router::new()
        .route("/health", get(health))
        .nest("/system", routes::system::router())
        .nest("/api", routes::legacy::router())
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .layer(socket_layer)
        .with_state(state.clone());

    let address = SocketAddr::from(([127, 0, 0, 1], state.port));
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

fn init_tracing() {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "info,tower_http=info".into());

    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false)
        .compact()
        .init();
}
