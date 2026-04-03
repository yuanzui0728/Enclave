use axum::{
  extract::State,
  routing::get,
  Json, Router,
};

use crate::{app_state::AppState, models::WorldContextRecord, seed::seeded_world_context};

pub fn router() -> Router<AppState> {
  Router::new().route("/context", get(get_latest_world_context))
}

async fn get_latest_world_context(State(state): State<AppState>) -> Json<WorldContextRecord> {
  {
    let runtime = state.runtime.read().expect("runtime lock poisoned");

    if let Some(context) = runtime.world_contexts.last() {
      return Json(context.clone());
    }
  }

  let mut runtime = state.runtime.write().expect("runtime lock poisoned");
  let context = seeded_world_context();
  runtime.world_contexts.push(context.clone());

  Json(context)
}
