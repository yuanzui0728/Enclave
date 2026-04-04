use std::time::{SystemTime, UNIX_EPOCH};

use axum::{
    extract::{Path, Query, State},
    routing::{get, post},
    Json, Router,
};

use crate::{
    app_state::AppState,
    error::{ApiError, ApiResult},
    generation::generate_social_greeting_text,
    models::{
        FriendListItemRecord, FriendRequestRecord, FriendshipRecord, SendFriendRequestPayload,
        ShakePreviewCharacterRecord, ShakeResultRecord, SuccessResponse, TriggerScenePayload,
        UserScopedRequest,
    },
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/friend-requests", get(get_pending_requests))
        .route("/friend-requests/send", post(send_friend_request))
        .route("/friend-requests/:id/accept", post(accept_request))
        .route("/friend-requests/:id/decline", post(decline_request))
        .route("/friends", get(get_friends))
        .route("/shake", post(shake))
        .route("/trigger-scene", post(trigger_scene))
}

async fn get_pending_requests(
    State(state): State<AppState>,
    Query(query): Query<UserScopedRequest>,
) -> Json<Vec<FriendRequestRecord>> {
    let runtime = state.runtime.read().expect("runtime lock poisoned");
    let mut requests = runtime
        .friend_requests
        .values()
        .filter(|request| request.user_id == query.user_id && request.status == "pending")
        .cloned()
        .collect::<Vec<_>>();

    requests.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    Json(requests)
}

async fn accept_request(
    Path(id): Path<String>,
    State(state): State<AppState>,
    Json(payload): Json<UserScopedRequest>,
) -> ApiResult<Json<FriendshipRecord>> {
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    let character_id = {
        let request = runtime
            .friend_requests
            .get_mut(&id)
            .ok_or_else(|| ApiError::not_found("Request not found"))?;

        if request.user_id != payload.user_id {
            return Err(ApiError::not_found("Request not found"));
        }

        request.status = "accepted".into();
        request.character_id.clone()
    };

    if let Some(existing) = runtime
        .friendships
        .values()
        .find(|friendship| {
            friendship.user_id == payload.user_id && friendship.character_id == character_id
        })
        .cloned()
    {
        drop(runtime);
        state.request_persist("social-accept-request");
        return Ok(Json(existing));
    }

    let friendship = FriendshipRecord {
        id: format!("friendship_{}", now_token()),
        user_id: payload.user_id,
        character_id,
        intimacy_level: 10,
        status: "friend".into(),
        created_at: now_token(),
        last_interacted_at: None,
    };

    runtime
        .friendships
        .insert(friendship.id.clone(), friendship.clone());
    drop(runtime);
    state.request_persist("social-accept-request");

    Ok(Json(friendship))
}

async fn decline_request(
    Path(id): Path<String>,
    State(state): State<AppState>,
    Json(payload): Json<UserScopedRequest>,
) -> Json<SuccessResponse> {
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");

    if let Some(request) = runtime.friend_requests.get_mut(&id) {
        if request.user_id == payload.user_id {
            request.status = "declined".into();
        }
    }
    drop(runtime);
    state.request_persist("social-decline-request");

    Json(SuccessResponse { success: true })
}

async fn get_friends(
    State(state): State<AppState>,
    Query(query): Query<UserScopedRequest>,
) -> Json<Vec<FriendListItemRecord>> {
    let runtime = state.runtime.read().expect("runtime lock poisoned");

    let items = runtime
        .friendships
        .values()
        .filter(|friendship| friendship.user_id == query.user_id)
        .filter_map(|friendship| {
            runtime
                .characters
                .get(&friendship.character_id)
                .map(|character| FriendListItemRecord {
                    friendship: friendship.clone(),
                    character: character.clone(),
                })
        })
        .collect::<Vec<_>>();

    Json(items)
}

async fn shake(
    State(state): State<AppState>,
    Json(payload): Json<UserScopedRequest>,
) -> Json<Option<ShakeResultRecord>> {
    let character = {
        let runtime = state.runtime.read().expect("runtime lock poisoned");
        let available = runtime
            .characters
            .values()
            .filter(|character| {
                !runtime.friendships.values().any(|friendship| {
                    friendship.user_id == payload.user_id && friendship.character_id == character.id
                })
            })
            .cloned()
            .collect::<Vec<_>>();

        if available.is_empty() {
            return Json(None);
        }

        available[pseudo_random_index(available.len())].clone()
    };
    let greeting = generate_social_greeting_text(&state, &character, None)
        .await
        .unwrap_or_else(|| fallback_shake_greeting(&character.name));

    Json(Some(ShakeResultRecord {
        character: ShakePreviewCharacterRecord {
            id: character.id.clone(),
            name: character.name.clone(),
            avatar: character.avatar.clone(),
            relationship: character.relationship.clone(),
            expert_domains: character.expert_domains.clone(),
        },
        greeting,
    }))
}

async fn send_friend_request(
    State(state): State<AppState>,
    Json(payload): Json<SendFriendRequestPayload>,
) -> ApiResult<Json<FriendRequestRecord>> {
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    let character = runtime
        .characters
        .get(&payload.character_id)
        .cloned()
        .ok_or_else(|| ApiError::not_found("Character not found"))?;

    if let Some(existing) = runtime
        .friend_requests
        .values()
        .find(|request| {
            request.user_id == payload.user_id
                && request.character_id == payload.character_id
                && request.status == "pending"
        })
        .cloned()
    {
        return Ok(Json(existing));
    }

    let request = build_friend_request(
        payload.user_id,
        character.id,
        character.name,
        character.avatar,
        Some("shake".into()),
        Some(payload.greeting),
    );

    runtime
        .friend_requests
        .insert(request.id.clone(), request.clone());
    drop(runtime);
    state.request_persist("social-send-request");

    Ok(Json(request))
}

async fn trigger_scene(
    State(state): State<AppState>,
    Json(payload): Json<TriggerScenePayload>,
) -> ApiResult<Json<Option<FriendRequestRecord>>> {
    let character = {
        let runtime = state.runtime.read().expect("runtime lock poisoned");
        let candidates = runtime
            .characters
            .values()
            .filter(|character| {
                character
                    .trigger_scenes
                    .as_ref()
                    .is_some_and(|scenes| scenes.iter().any(|scene| scene == &payload.scene))
            })
            .filter(|character| {
                !runtime.friendships.values().any(|friendship| {
                    friendship.user_id == payload.user_id && friendship.character_id == character.id
                })
            })
            .cloned()
            .collect::<Vec<_>>();

        if candidates.is_empty() {
            return Ok(Json(None));
        }

        let character = candidates[pseudo_random_index(candidates.len())].clone();

        if let Some(existing) = runtime
            .friend_requests
            .values()
            .find(|request| {
                request.user_id == payload.user_id
                    && request.character_id == character.id
                    && request.status == "pending"
            })
            .cloned()
        {
            return Ok(Json(Some(existing)));
        }

        character
    };
    let greeting = generate_social_greeting_text(&state, &character, Some(&payload.scene))
        .await
        .unwrap_or_else(|| fallback_scene_greeting(&character.name, &payload.scene));

    let request = {
        let mut runtime = state.runtime.write().expect("runtime lock poisoned");

        if let Some(existing) = runtime
            .friend_requests
            .values()
            .find(|request| {
                request.user_id == payload.user_id
                    && request.character_id == character.id
                    && request.status == "pending"
            })
            .cloned()
        {
            return Ok(Json(Some(existing)));
        }

        let request = build_friend_request(
            payload.user_id,
            character.id,
            character.name.clone(),
            character.avatar.clone(),
            Some(payload.scene.clone()),
            Some(greeting),
        );

        runtime
            .friend_requests
            .insert(request.id.clone(), request.clone());
        request
    };
    state.request_persist("social-trigger-scene");

    Ok(Json(Some(request)))
}

fn build_friend_request(
    user_id: String,
    character_id: String,
    character_name: String,
    character_avatar: String,
    trigger_scene: Option<String>,
    greeting: Option<String>,
) -> FriendRequestRecord {
    FriendRequestRecord {
        id: format!("friend_request_{}", now_token()),
        user_id,
        character_id,
        character_name,
        character_avatar,
        trigger_scene,
        greeting,
        status: "pending".into(),
        created_at: now_token(),
        expires_at: Some(expiry_token()),
    }
}

fn fallback_shake_greeting(character_name: &str) -> String {
    format!("Hello, I'm {}. We just met in Hidden World.", character_name)
}

fn fallback_scene_greeting(character_name: &str, scene: &str) -> String {
    format!("Hello, I'm {}. We crossed paths in {}.", character_name, scene)
}

fn pseudo_random_index(length: usize) -> usize {
    if length <= 1 {
        return 0;
    }

    let tick = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as usize;

    tick % length
}

fn now_token() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}

fn expiry_token() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| (value.as_secs() + 86_400).to_string())
        .unwrap_or_else(|_| "0".into())
}
