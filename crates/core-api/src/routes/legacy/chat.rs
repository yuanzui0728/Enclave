use std::{
    collections::hash_map::DefaultHasher,
    hash::{Hash, Hasher},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde_json::json;
use tokio::time::sleep;

use crate::{
    app_state::AppState,
    error::{ApiError, ApiResult},
    generation::generate_chat_reply_text,
    models::{
        AddGroupMemberPayload, ConversationListItemRecord, ConversationRecord, CreateGroupPayload,
        GetOrCreateConversationPayload, GroupMemberRecord, GroupMessageRecord, GroupRecord,
        MessageRecord, SendGroupMessagePayload, UserScopedRequest,
    },
    runtime_paths,
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
    drop(runtime);
    state.request_persist("chat-create-conversation");

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
    {
        let mut runtime = state.runtime.write().expect("runtime lock poisoned");
        let conversation = runtime
            .conversations
            .get_mut(&id)
            .ok_or_else(|| ApiError::not_found(format!("Conversation {} not found", id)))?;

        conversation.last_read_at = Some(now_token());
        conversation.updated_at = now_token();
    }
    state.request_persist("chat-mark-read");

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
    drop(runtime);
    state.request_persist("chat-create-group");

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
    let member = {
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
        member
    };

    state.request_persist("chat-add-group-member");
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
    let should_trigger_ai_replies = payload.sender_type == "user";
    let trigger_sender_name = payload.sender_name.clone();
    let trigger_text = payload.text.clone();
    let message = {
        let mut runtime = state.runtime.write().expect("runtime lock poisoned");
        let messages = runtime.group_messages.entry(id.clone()).or_default();

        let message = GroupMessageRecord {
            id: format!("group_message_{}", now_token()),
            group_id: id.clone(),
            sender_id: payload.sender_id,
            sender_type: payload.sender_type,
            sender_name: payload.sender_name,
            sender_avatar: payload.sender_avatar,
            text: payload.text,
            r#type: "text".into(),
            created_at: now_token(),
        };

        messages.push(message.clone());
        message
    };

    state.request_persist("chat-send-group-message");

    if should_trigger_ai_replies {
        spawn_group_ai_replies(state.clone(), id, trigger_sender_name, trigger_text);
    }

    Json(message)
}

fn spawn_group_ai_replies(
    state: AppState,
    group_id: String,
    sender_name: String,
    user_text: String,
) {
    let plans = build_group_reply_plans(&state, &group_id, &sender_name, &user_text);

    for plan in plans {
        let state = state.clone();
        let group_id = group_id.clone();
        let sender_name = sender_name.clone();
        let user_text = user_text.clone();
        tokio::spawn(async move {
            sleep(Duration::from_millis(plan.delay_ms)).await;

            let reply_text = generate_chat_reply_text(
                &state,
                &plan.character,
                &plan.conversation,
                &plan.history,
            )
            .await
            .unwrap_or_else(|| fallback_group_reply_text(&plan.character, &sender_name, &user_text));

            {
                let mut runtime = state.runtime.write().expect("runtime lock poisoned");
                let messages = runtime.group_messages.entry(group_id.clone()).or_default();
                messages.push(GroupMessageRecord {
                    id: format!("group_message_{}", now_token()),
                    group_id: group_id.clone(),
                    sender_id: plan.character.id.clone(),
                    sender_type: "character".into(),
                    sender_name: plan.character.name.clone(),
                    sender_avatar: Some(plan.character.avatar.clone()),
                    text: reply_text,
                    r#type: "text".into(),
                    created_at: now_token(),
                });
            }

            runtime_paths::append_core_api_log(
                &state.database_path,
                "INFO",
                &format!(
                    "group {} generated async reply from {} after user message",
                    group_id, plan.character.id
                ),
            );
            state.append_behavior_log(
                plan.character.id.clone(),
                "comment",
                Some(group_id.clone()),
                Some("group-async-reply".into()),
                Some(json!({
                    "groupId": group_id,
                    "characterName": plan.character.name,
                    "source": "group-reply",
                })),
            );
            state.request_persist("chat-group-ai-reply");
        });
    }
}

fn build_group_reply_plans(
    state: &AppState,
    group_id: &str,
    sender_name: &str,
    user_text: &str,
) -> Vec<GroupReplyPlan> {
    let runtime = state.runtime.read().expect("runtime lock poisoned");
    let Some(group) = runtime.groups.get(group_id) else {
        return Vec::new();
    };

    let character_members = runtime
        .group_members
        .get(group_id)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter(|member| member.member_type == "character")
        .collect::<Vec<_>>();
    if character_members.is_empty() {
        return Vec::new();
    }

    let participants = character_members
        .iter()
        .map(|member| member.member_id.clone())
        .collect::<Vec<_>>();
    let conversation = ConversationRecord {
        id: group_id.to_string(),
        user_id: group.creator_id.clone(),
        r#type: "group".into(),
        title: group.name.clone(),
        participants,
        messages: Vec::new(),
        created_at: group.created_at.clone(),
        updated_at: now_token(),
        last_read_at: None,
    };
    let history = runtime
        .group_messages
        .get(group_id)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .rev()
        .take(10)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .map(group_message_to_conversation_message)
        .collect::<Vec<_>>();

    character_members
        .into_iter()
        .filter_map(|member| {
            let character = runtime.characters.get(&member.member_id)?.clone();
            if !should_emit_group_reply(&character, group_id, sender_name, user_text) {
                return None;
            }

            Some(GroupReplyPlan {
                character,
                conversation: conversation.clone(),
                history: history.clone(),
                delay_ms: reply_delay_ms(group_id, &member.member_id, sender_name, user_text),
            })
        })
        .collect()
}

fn group_message_to_conversation_message(message: GroupMessageRecord) -> MessageRecord {
    MessageRecord {
        id: message.id,
        conversation_id: message.group_id,
        sender_type: message.sender_type,
        sender_id: message.sender_id,
        sender_name: message.sender_name,
        r#type: message.r#type,
        text: message.text,
        created_at: message.created_at,
    }
}

fn should_emit_group_reply(
    character: &crate::models::CharacterRecord,
    group_id: &str,
    sender_name: &str,
    user_text: &str,
) -> bool {
    let threshold = match character.activity_frequency.as_str() {
        "high" => 0.7,
        "low" => 0.2,
        _ => 0.4,
    };

    deterministic_roll(&[
        group_id,
        &character.id,
        sender_name,
        user_text,
        &now_token(),
    ]) <= threshold
}

fn deterministic_roll(parts: &[&str]) -> f64 {
    let mut hasher = DefaultHasher::new();
    for part in parts {
        part.hash(&mut hasher);
    }
    (hasher.finish() % 10_000) as f64 / 10_000.0
}

fn reply_delay_ms(group_id: &str, character_id: &str, sender_name: &str, user_text: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    group_id.hash(&mut hasher);
    character_id.hash(&mut hasher);
    sender_name.hash(&mut hasher);
    user_text.hash(&mut hasher);
    5_000 + (hasher.finish() % 25_001)
}

fn fallback_group_reply_text(
    character: &crate::models::CharacterRecord,
    sender_name: &str,
    user_text: &str,
) -> String {
    format!(
        "{}看到{}提到“{}”，也补充了一句自己的看法。",
        character.name, sender_name, user_text
    )
}

#[derive(Clone)]
struct GroupReplyPlan {
    character: crate::models::CharacterRecord,
    conversation: ConversationRecord,
    history: Vec<MessageRecord>,
    delay_ms: u64,
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
