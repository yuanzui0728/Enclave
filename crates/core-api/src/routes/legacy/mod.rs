use axum::Router;

use crate::app_state::AppState;

pub mod auth;
pub mod chat;
pub mod characters;
pub mod config;
pub mod social;
pub mod world;

pub fn router() -> Router<AppState> {
  Router::new()
    .nest("/auth", auth::router())
    .merge(chat::router())
    .nest("/characters", characters::router())
    .nest("/config", config::router())
    .nest("/social", social::router())
    .nest("/world", world::router())
}
