use std::time::{SystemTime, UNIX_EPOCH};

use axum::routing::get;
use axum::{
    extract::{Path, State},
    Json, Router,
};

use crate::{
    app_state::AppState,
    error::{ApiError, ApiResult},
    models::{CharacterPatch, CharacterRecord, SuccessResponse},
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(find_all).post(create))
        .route("/:id", get(find_one).patch(update).delete(remove))
}

async fn find_all(State(state): State<AppState>) -> Json<Vec<CharacterRecord>> {
    let runtime = state.runtime.read().expect("runtime lock poisoned");
    let mut characters = runtime.characters.values().cloned().collect::<Vec<_>>();
    characters.sort_by(|left, right| left.id.cmp(&right.id));
    Json(characters)
}

async fn find_one(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> ApiResult<Json<CharacterRecord>> {
    let runtime = state.runtime.read().expect("runtime lock poisoned");
    let character = runtime
        .characters
        .get(&id)
        .cloned()
        .ok_or_else(|| ApiError::not_found(format!("Character {} not found", id)))?;

    Ok(Json(character))
}

async fn create(
    State(state): State<AppState>,
    Json(payload): Json<CharacterPatch>,
) -> Json<CharacterRecord> {
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    let id = payload
        .id
        .clone()
        .unwrap_or_else(|| format!("char_{}", now_token()));
    let character = CharacterRecord::from_patch(id, payload);

    runtime
        .characters
        .insert(character.id.clone(), character.clone());

    Json(character)
}

async fn update(
    Path(id): Path<String>,
    State(state): State<AppState>,
    Json(payload): Json<CharacterPatch>,
) -> ApiResult<Json<CharacterRecord>> {
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    let character = runtime
        .characters
        .get_mut(&id)
        .ok_or_else(|| ApiError::not_found(format!("Character {} not found", id)))?;

    character.apply_patch(payload);

    Ok(Json(character.clone()))
}

async fn remove(Path(id): Path<String>, State(state): State<AppState>) -> Json<SuccessResponse> {
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    runtime.characters.remove(&id);
    Json(SuccessResponse { success: true })
}

fn now_token() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}
