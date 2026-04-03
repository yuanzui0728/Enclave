use std::time::{SystemTime, UNIX_EPOCH};

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};

use crate::{
    app_state::AppState,
    error::{ApiError, ApiResult},
    models::{
        AddGroupMemberPayload, ConversationListItemRecord, ConversationRecord, CreateGroupPayload,
        GetOrCreateConversationPayload, GroupMemberRecord, GroupMessageRecord, GroupRecord,
        MessageRecord, SendGroupMessagePayload, UserScopedRequest,
    },
};

pub fn router() -> Router<AppState> {
    Router::new()
        .nest("/conversations", conversations_router())
        .nest("/groups", groups_router())
}

fn conversations_router() -> Router<AppState> {
    Router::new()
        .route("/", get(get_conversations).post(get_or_create_conversation))
        .route("/:id/messages", get(get_conversation_messages))
        .route("/:id/read", post(mark_conversation_read))
}

fn groups_router() -> Router<AppState> {
    Router::new()
        .route("/", post(create_group))
        .route("/:id", get(get_group))
        .route(
            "/:id/members",
            get(get_group_members).post(add_group_member),
        )
        .route(
            "/:id/messages",
            get(get_group_messages).post(send_group_message),
        )
}

async fn get_conversations(
    State(state): State<AppState>,
    Query(query): Query<UserScopedRequest>,
) -> Json<Vec<ConversationListItemRecord>> {
    let runtime = state.runtime.read().expect("runtime lock poisoned");
    let mut items = runtime
        .conversations
        .values()
        .filter(|conversation| conversation.user_id == query.user_id)
        .map(|conversation| {
            let messages = runtime
                .messages
                .get(&conversation.id)
                .cloned()
                .unwrap_or_default();
            let last_message = messages.last().cloned();
            let unread_count = messages
                .iter()
                .filter(|message| {
                    message.sender_type == "character"
                        && match conversation.last_read_at.as_ref() {
                            Some(last_read) => {
                                parse_timestamp(&message.created_at) > parse_timestamp(last_read)
                            }
                            None => true,
                        }
                })
                .count();

            ConversationListItemRecord {
                id: conversation.id.clone(),
                user_id: conversation.user_id.clone(),
                r#type: conversation.r#type.clone(),
                title: conversation.title.clone(),
                participants: conversation.participants.clone(),
                messages: messages.clone(),
                created_at: conversation.created_at.clone(),
                updated_at: conversation.updated_at.clone(),
                last_read_at: conversation.last_read_at.clone(),
                last_message,
                unread_count,
            }
        })
        .collect::<Vec<_>>();

    items.sort_by(|left, right| {
        parse_timestamp(&right.updated_at).cmp(&parse_timestamp(&left.updated_at))
    });
    Json(items)
}

async fn get_or_create_conversation(
    State(state): State<AppState>,
    Json(payload): Json<GetOrCreateConversationPayload>,
) -> Json<ConversationRecord> {
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    let conversation_id = format!("{}_{}", payload.user_id, payload.character_id);

    if let Some(existing) = runtime.conversations.get(&conversation_id) {
        return Json(existing.clone());
    }

    let title = runtime
        .characters
        .get(&payload.character_id)
        .map(|character| character.name.clone())
        .unwrap_or_else(|| payload.character_id.clone());

    let conversation = ConversationRecord {
        id: conversation_id.clone(),
        user_id: payload.user_id,
        r#type: "direct".into(),
        title,
        participants: vec![payload.character_id],
        messages: Vec::new(),
        created_at: now_token(),
        updated_at: now_token(),
        last_read_at: None,
    };

    runtime
        .conversations
        .insert(conversation_id.clone(), conversation.clone());
    runtime.messages.insert(conversation_id, Vec::new());

    Json(conversation)
}

async fn get_conversation_messages(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Json<Vec<MessageRecord>> {
    let runtime = state.runtime.read().expect("runtime lock poisoned");
    Json(runtime.messages.get(&id).cloned().unwrap_or_default())
}

async fn mark_conversation_read(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> ApiResult<StatusCode> {
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    let conversation = runtime
        .conversations
        .get_mut(&id)
        .ok_or_else(|| ApiError::not_found(format!("Conversation {} not found", id)))?;

    conversation.last_read_at = Some(now_token());
    conversation.updated_at = now_token();

    Ok(StatusCode::OK)
}

async fn create_group(
    State(state): State<AppState>,
    Json(payload): Json<CreateGroupPayload>,
) -> Json<GroupRecord> {
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    let group_id = format!("group_{}", now_token());
    let group = GroupRecord {
        id: group_id.clone(),
        name: payload.name,
        avatar: None,
        creator_id: payload.creator_id.clone(),
        creator_type: payload.creator_type.clone(),
        created_at: now_token(),
    };

    runtime.groups.insert(group_id.clone(), group.clone());

    let mut members = vec![GroupMemberRecord {
        id: format!("member_{}", now_token()),
        group_id: group_id.clone(),
        member_id: payload.creator_id,
        member_type: payload.creator_type,
        member_name: None,
        member_avatar: None,
        role: "owner".into(),
        joined_at: now_token(),
    }];

    for member_id in payload.member_ids {
        let character = runtime.characters.get(&member_id).cloned();
        members.push(GroupMemberRecord {
            id: format!("member_{}", now_token()),
            group_id: group_id.clone(),
            member_id,
            member_type: "character".into(),
            member_name: character.as_ref().map(|item| item.name.clone()),
            member_avatar: character.as_ref().map(|item| item.avatar.clone()),
            role: "member".into(),
            joined_at: now_token(),
        });
    }

    runtime.group_members.insert(group_id.clone(), members);
    runtime.group_messages.insert(group_id, Vec::new());

    Json(group)
}

async fn get_group(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> ApiResult<Json<GroupRecord>> {
    let runtime = state.runtime.read().expect("runtime lock poisoned");
    let group = runtime
        .groups
        .get(&id)
        .cloned()
        .ok_or_else(|| ApiError::not_found(format!("Group {} not found", id)))?;

    Ok(Json(group))
}

async fn get_group_members(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Json<Vec<GroupMemberRecord>> {
    let runtime = state.runtime.read().expect("runtime lock poisoned");
    Json(runtime.group_members.get(&id).cloned().unwrap_or_default())
}

async fn add_group_member(
    Path(id): Path<String>,
    State(state): State<AppState>,
    Json(payload): Json<AddGroupMemberPayload>,
) -> Json<GroupMemberRecord> {
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    let members = runtime.group_members.entry(id.clone()).or_default();

    if let Some(existing) = members
        .iter()
        .find(|member| member.member_id == payload.member_id)
    {
        return Json(existing.clone());
    }

    let member = GroupMemberRecord {
        id: format!("member_{}", now_token()),
        group_id: id,
        member_id: payload.member_id,
        member_type: payload.member_type,
        member_name: Some(payload.member_name),
        member_avatar: payload.member_avatar,
        role: "member".into(),
        joined_at: now_token(),
    };

    members.push(member.clone());
    Json(member)
}

async fn get_group_messages(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Json<Vec<GroupMessageRecord>> {
    let runtime = state.runtime.read().expect("runtime lock poisoned");
    let mut messages = runtime.group_messages.get(&id).cloned().unwrap_or_default();
    messages.sort_by(|left, right| {
        parse_timestamp(&right.created_at).cmp(&parse_timestamp(&left.created_at))
    });
    Json(messages)
}

async fn send_group_message(
    Path(id): Path<String>,
    State(state): State<AppState>,
    Json(payload): Json<SendGroupMessagePayload>,
) -> Json<GroupMessageRecord> {
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    let messages = runtime.group_messages.entry(id.clone()).or_default();

    let message = GroupMessageRecord {
        id: format!("group_message_{}", now_token()),
        group_id: id,
        sender_id: payload.sender_id,
        sender_type: payload.sender_type,
        sender_name: payload.sender_name,
        sender_avatar: payload.sender_avatar,
        text: payload.text,
        r#type: "text".into(),
        created_at: now_token(),
    };

    messages.push(message.clone());
    Json(message)
}

fn parse_timestamp(value: &str) -> u128 {
    value.parse::<u128>().unwrap_or_default()
}

fn now_token() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}
