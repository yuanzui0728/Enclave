use std::time::{SystemTime, UNIX_EPOCH};

use axum::{
    extract::{Path, State},
    http::HeaderMap,
    routing::{patch, post},
    Json, Router,
};

use crate::{
    app_state::AppState,
    auth_support::require_session_user,
    error::{ApiError, ApiResult},
    models::{
        AuthSession, InitUserRequest, LoginRequest, RegisterRequest, SuccessResponse,
        UpdateUserRequest, UserRecord,
    },
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/init", post(init_user))
        .route("/users/:id/onboarding-complete", patch(complete_onboarding))
        .route("/users/:id", patch(update_user))
}

async fn register(
    State(state): State<AppState>,
    Json(payload): Json<RegisterRequest>,
) -> ApiResult<Json<AuthSession>> {
    let username = payload.username.trim();
    let password = payload.password.trim();

    if username.is_empty() || password.is_empty() {
        return Err(ApiError::bad_request("username and password are required"));
    }

    let mut runtime = state.runtime.write().expect("runtime lock poisoned");

    if runtime.users.values().any(|user| user.username == username) {
        return Err(ApiError::conflict("username already exists"));
    }

    let user = UserRecord {
        id: generate_user_id(),
        username: username.into(),
        password_hash: password.into(),
        onboarding_completed: true,
        avatar: None,
        signature: None,
        location_lat: None,
        location_lng: None,
        location_name: None,
        created_at: now_token(),
    };

    let session = build_session(&user);
    runtime.users.insert(user.id.clone(), user);
    drop(runtime);
    state.request_persist("auth-register");

    Ok(Json(session))
}

async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> ApiResult<Json<AuthSession>> {
    let runtime = state.runtime.read().expect("runtime lock poisoned");
    let username = payload.username.trim();
    let password = payload.password.trim();

    let user = runtime
        .users
        .values()
        .find(|user| user.username == username)
        .ok_or_else(|| ApiError::unauthorized("invalid username or password"))?;

    if user.password_hash != password {
        return Err(ApiError::unauthorized("invalid username or password"));
    }

    Ok(Json(build_session(user)))
}

async fn init_user(
    State(state): State<AppState>,
    Json(payload): Json<InitUserRequest>,
) -> ApiResult<Json<AuthSession>> {
    let username = payload.username.trim();

    if username.is_empty() {
        return Err(ApiError::bad_request("username is required"));
    }

    let mut runtime = state.runtime.write().expect("runtime lock poisoned");

    if let Some(existing_user) = runtime
        .users
        .values()
        .find(|user| user.username == username)
    {
        return Ok(Json(build_session(existing_user)));
    }

    let user = UserRecord {
        id: generate_user_id(),
        username: username.into(),
        password_hash: format!("onboarding_{}", now_token()),
        onboarding_completed: false,
        avatar: None,
        signature: None,
        location_lat: None,
        location_lng: None,
        location_name: None,
        created_at: now_token(),
    };

    let session = build_session(&user);
    runtime.users.insert(user.id.clone(), user);
    drop(runtime);
    state.request_persist("auth-init-user");

    Ok(Json(session))
}

async fn complete_onboarding(
    Path(user_id): Path<String>,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<SuccessResponse>> {
    require_session_user(&headers, &state, &user_id)?;
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");

    if let Some(user) = runtime.users.get_mut(&user_id) {
        user.onboarding_completed = true;
    }
    drop(runtime);
    state.request_persist("auth-complete-onboarding");

    Ok(Json(SuccessResponse { success: true }))
}

async fn update_user(
    Path(user_id): Path<String>,
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<UpdateUserRequest>,
) -> ApiResult<Json<SuccessResponse>> {
    require_session_user(&headers, &state, &user_id)?;
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");

    if let Some(username) = payload.username.as_ref() {
        let normalized = username.trim();

        if normalized.is_empty() {
            return Err(ApiError::bad_request("username cannot be empty"));
        }

        let duplicated = runtime
            .users
            .values()
            .any(|user| user.id != user_id && user.username == normalized);

        if duplicated {
            return Err(ApiError::conflict("username already exists"));
        }
    }

    if let Some(user) = runtime.users.get_mut(&user_id) {
        if let Some(username) = payload.username {
            user.username = username.trim().into();
        }
        if let Some(avatar) = payload.avatar {
            user.avatar = Some(avatar);
        }
        if let Some(signature) = payload.signature {
            user.signature = Some(signature);
        }
    }
    drop(runtime);
    state.request_persist("auth-update-user");

    Ok(Json(SuccessResponse { success: true }))
}

fn build_session(user: &UserRecord) -> AuthSession {
    AuthSession {
        token: format!("stub.{}.{}", user.id, now_token()),
        user_id: user.id.clone(),
        username: user.username.clone(),
        onboarding_completed: user.onboarding_completed,
    }
}

fn generate_user_id() -> String {
    format!("user_{}", now_token())
}

fn now_token() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}
