use std::time::{SystemTime, UNIX_EPOCH};

use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    routing::{get, post},
    Json, Router,
};
use serde_json::json;

use crate::{
    app_state::AppState,
    auth_support::require_session_user,
    error::{ApiError, ApiResult},
    generation::generate_social_greeting_text,
    models::{
        BlockCharacterPayload, BlockedCharacterRecord, FriendListItemRecord, FriendRequestRecord,
        FriendshipRecord, SendFriendRequestPayload, ShakePreviewCharacterRecord, ShakeResultRecord,
        SuccessResponse, TriggerScenePayload, UnblockCharacterPayload, UserScopedRequest,
    },
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/friend-requests", get(get_pending_requests))
        .route("/friend-requests/send", post(send_friend_request))
        .route("/friend-requests/:id/accept", post(accept_request))
        .route("/friend-requests/:id/decline", post(decline_request))
        .route("/friends", get(get_friends))
        .route("/blocks", get(get_blocked_characters))
        .route("/block", post(block_character))
        .route("/unblock", post(unblock_character))
        .route("/shake", post(shake))
        .route("/trigger-scene", post(trigger_scene))
}

async fn get_pending_requests(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<UserScopedRequest>,
) -> ApiResult<Json<Vec<FriendRequestRecord>>> {
    require_session_user(&headers, &state, &query.user_id)?;
    let runtime = state.runtime.read().expect("runtime lock poisoned");
    let mut requests = runtime
        .friend_requests
        .values()
        .filter(|request| request.user_id == query.user_id && request.status == "pending")
        .cloned()
        .collect::<Vec<_>>();

    requests.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    Ok(Json(requests))
}

async fn accept_request(
    Path(id): Path<String>,
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<UserScopedRequest>,
) -> ApiResult<Json<FriendshipRecord>> {
    require_session_user(&headers, &state, &payload.user_id)?;
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    let request = runtime
        .friend_requests
        .get(&id)
        .cloned()
        .ok_or_else(|| ApiError::not_found("Request not found"))?;

    if request.user_id != payload.user_id {
        return Err(ApiError::not_found("Request not found"));
    }

    if request.status == "declined" {
        return Err(ApiError::conflict("Request already declined"));
    }

    let character_id = request.character_id.clone();
    let accepted_character = runtime
        .characters
        .get(&character_id)
        .cloned()
        .ok_or_else(|| ApiError::not_found("Character not found"))?;

    if let Some(existing) = runtime
        .friendships
        .values()
        .find(|friendship| {
            friendship.user_id == payload.user_id && friendship.character_id == character_id
        })
        .cloned()
    {
        if let Some(request) = runtime.friend_requests.get_mut(&id) {
            request.status = "accepted".into();
        }
        drop(runtime);
        state.ensure_narrative_arc(&payload.user_id, &accepted_character);
        state.request_persist("social-accept-request");
        return Ok(Json(existing));
    }

    if request.status != "pending" {
        return Err(ApiError::conflict(format!(
            "Request is already {}",
            request.status
        )));
    }

    if let Some(request) = runtime.friend_requests.get_mut(&id) {
        request.status = "accepted".into();
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
    state.ensure_narrative_arc(&friendship.user_id, &accepted_character);
    state.append_behavior_log(
        accepted_character.id.clone(),
        "friend_request",
        Some(friendship.id.clone()),
        Some("friend-request-accepted".into()),
        Some(json!({
            "userId": friendship.user_id,
            "characterName": accepted_character.name,
            "friendshipId": friendship.id,
        })),
    );
    state.request_persist("social-accept-request");

    Ok(Json(friendship))
}

async fn decline_request(
    Path(id): Path<String>,
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<UserScopedRequest>,
) -> ApiResult<Json<SuccessResponse>> {
    require_session_user(&headers, &state, &payload.user_id)?;
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    let request = runtime
        .friend_requests
        .get(&id)
        .cloned()
        .ok_or_else(|| ApiError::not_found("Request not found"))?;

    if request.user_id != payload.user_id {
        return Err(ApiError::not_found("Request not found"));
    }

    if request.status == "accepted" {
        return Err(ApiError::conflict("Request already accepted"));
    }

    if request.status == "declined" {
        drop(runtime);
        return Ok(Json(SuccessResponse { success: true }));
    }

    if let Some(request) = runtime.friend_requests.get_mut(&id) {
        request.status = "declined".into();
    }
    drop(runtime);
    state.request_persist("social-decline-request");

    Ok(Json(SuccessResponse { success: true }))
}

async fn get_friends(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<UserScopedRequest>,
) -> ApiResult<Json<Vec<FriendListItemRecord>>> {
    require_session_user(&headers, &state, &query.user_id)?;
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

    Ok(Json(items))
}

async fn get_blocked_characters(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<UserScopedRequest>,
) -> ApiResult<Json<Vec<BlockedCharacterRecord>>> {
    require_session_user(&headers, &state, &query.user_id)?;
    let runtime = state.runtime.read().expect("runtime lock poisoned");
    let mut items = runtime
        .blocked_characters
        .values()
        .filter(|item| item.user_id == query.user_id)
        .cloned()
        .collect::<Vec<_>>();
    items.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    Ok(Json(items))
}

async fn block_character(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<BlockCharacterPayload>,
) -> ApiResult<Json<BlockedCharacterRecord>> {
    require_session_user(&headers, &state, &payload.user_id)?;
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    let character = runtime
        .characters
        .get(&payload.character_id)
        .cloned()
        .ok_or_else(|| ApiError::not_found("Character not found"))?;

    if let Some(existing) = runtime
        .blocked_characters
        .values()
        .find(|item| item.user_id == payload.user_id && item.character_id == payload.character_id)
        .cloned()
    {
        return Ok(Json(existing));
    }

    runtime
        .friend_requests
        .retain(|_, request| !(request.user_id == payload.user_id && request.character_id == payload.character_id));
    runtime
        .friendships
        .retain(|_, friendship| !(friendship.user_id == payload.user_id && friendship.character_id == payload.character_id));
    let direct_conversation_ids = runtime
        .conversations
        .values()
        .filter(|conversation| {
            conversation.user_id == payload.user_id
                && conversation.r#type == "direct"
                && conversation
                    .participants
                    .iter()
                    .any(|participant| participant == &payload.character_id)
        })
        .map(|conversation| conversation.id.clone())
        .collect::<Vec<_>>();
    for conversation_id in direct_conversation_ids {
        runtime.conversations.remove(&conversation_id);
        runtime.messages.remove(&conversation_id);
    }

    let record = BlockedCharacterRecord {
        id: format!("block_{}", now_token()),
        user_id: payload.user_id.clone(),
        character_id: payload.character_id.clone(),
        reason: payload.reason.as_ref().map(|value| value.trim().to_string()).filter(|value| !value.is_empty()),
        created_at: now_token(),
    };
    runtime
        .blocked_characters
        .insert(record.id.clone(), record.clone());
    drop(runtime);
    state.append_behavior_log(
        character.id.clone(),
        "block",
        Some(record.id.clone()),
        Some("user-blocked-character".into()),
        Some(json!({
            "userId": payload.user_id,
            "characterName": character.name,
        })),
    );
    state.request_persist("social-block-character");

    Ok(Json(record))
}

async fn unblock_character(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<UnblockCharacterPayload>,
) -> ApiResult<Json<SuccessResponse>> {
    require_session_user(&headers, &state, &payload.user_id)?;
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    let existing_block_id = runtime
        .blocked_characters
        .values()
        .find(|item| item.user_id == payload.user_id && item.character_id == payload.character_id)
        .map(|item| item.id.clone())
        .ok_or_else(|| ApiError::not_found("Blocked character not found"))?;
    runtime.blocked_characters.remove(&existing_block_id);
    drop(runtime);
    state.request_persist("social-unblock-character");

    Ok(Json(SuccessResponse { success: true }))
}

async fn shake(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<UserScopedRequest>,
) -> ApiResult<Json<Option<ShakeResultRecord>>> {
    require_session_user(&headers, &state, &payload.user_id)?;
    let character = {
        let runtime = state.runtime.read().expect("runtime lock poisoned");
        let available = runtime
            .characters
            .values()
            .filter(|character| is_available_for_new_request(&runtime, &payload.user_id, &character.id))
            .cloned()
            .collect::<Vec<_>>();

        if available.is_empty() {
            return Ok(Json(None));
        }

        available[pseudo_random_index(available.len())].clone()
    };
    let greeting = generate_social_greeting_text(&state, &character, None)
        .await
        .unwrap_or_else(|| fallback_shake_greeting(&character.name));

    Ok(Json(Some(ShakeResultRecord {
        character: ShakePreviewCharacterRecord {
            id: character.id.clone(),
            name: character.name.clone(),
            avatar: character.avatar.clone(),
            relationship: character.relationship.clone(),
            expert_domains: character.expert_domains.clone(),
        },
        greeting,
    })))
}

async fn send_friend_request(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<SendFriendRequestPayload>,
) -> ApiResult<Json<FriendRequestRecord>> {
    require_session_user(&headers, &state, &payload.user_id)?;
    let greeting = payload.greeting.trim();
    if greeting.is_empty() {
        return Err(ApiError::bad_request("greeting is required"));
    }
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    let character = runtime
        .characters
        .get(&payload.character_id)
        .cloned()
        .ok_or_else(|| ApiError::not_found("Character not found"))?;

    if is_blocked(&runtime, &payload.user_id, &payload.character_id) {
        return Err(ApiError::conflict(format!("{} is blocked", character.name)));
    }

    if has_friendship(&runtime, &payload.user_id, &payload.character_id) {
        return Err(ApiError::conflict(format!(
            "{} is already your friend",
            character.name
        )));
    }

    if let Some(existing) = runtime
        .friend_requests
        .values()
        .find(|request| is_pending_request(request, &payload.user_id, &payload.character_id))
        .cloned()
    {
        return Ok(Json(existing));
    }

    let request = build_friend_request(
        payload.user_id,
        character.id,
        character.name,
        character.avatar,
        None,
        Some(greeting.into()),
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
    headers: HeaderMap,
    Json(payload): Json<TriggerScenePayload>,
) -> ApiResult<Json<Option<FriendRequestRecord>>> {
    require_session_user(&headers, &state, &payload.user_id)?;
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
            .filter(|character| is_available_for_new_request(&runtime, &payload.user_id, &character.id))
            .cloned()
            .collect::<Vec<_>>();

        if candidates.is_empty() {
            return Ok(Json(None));
        }

        candidates[pseudo_random_index(candidates.len())].clone()
    };
    let greeting = generate_social_greeting_text(&state, &character, Some(&payload.scene))
        .await
        .unwrap_or_else(|| fallback_scene_greeting(&character.name, &payload.scene));

    let request = {
        let mut runtime = state.runtime.write().expect("runtime lock poisoned");

        if has_friendship(&runtime, &payload.user_id, &character.id) {
            return Ok(Json(None));
        }

        if let Some(existing) = runtime
            .friend_requests
            .values()
            .find(|request| is_pending_request(request, &payload.user_id, &character.id))
            .cloned()
        {
            return Ok(Json(Some(existing)));
        }

        let request = build_friend_request(
            payload.user_id,
            character.id.clone(),
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
    state.append_behavior_log(
        character.id.clone(),
        "friend_request",
        Some(request.id.clone()),
        Some("scene-trigger".into()),
        Some(json!({
            "userId": request.user_id,
            "scene": payload.scene,
            "characterName": character.name,
        })),
    );

    Ok(Json(Some(request)))
}

fn is_available_for_new_request(
    runtime: &crate::app_state::RuntimeState,
    user_id: &str,
    character_id: &str,
) -> bool {
    !has_friendship(runtime, user_id, character_id)
        && !is_blocked(runtime, user_id, character_id)
        && !runtime
            .friend_requests
            .values()
            .any(|request| is_pending_request(request, user_id, character_id))
}

fn has_friendship(runtime: &crate::app_state::RuntimeState, user_id: &str, character_id: &str) -> bool {
    runtime.friendships.values().any(|friendship| {
        friendship.user_id == user_id && friendship.character_id == character_id
    })
}

fn is_blocked(runtime: &crate::app_state::RuntimeState, user_id: &str, character_id: &str) -> bool {
    runtime
        .blocked_characters
        .values()
        .any(|item| item.user_id == user_id && item.character_id == character_id)
}

fn is_pending_request(request: &FriendRequestRecord, user_id: &str, character_id: &str) -> bool {
    request.user_id == user_id && request.character_id == character_id && request.status == "pending"
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
