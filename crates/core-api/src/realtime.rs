use std::time::{SystemTime, UNIX_EPOCH};

use socketioxide::{
    extract::{Data, SocketRef},
    SocketIo,
};
use tokio::{
    spawn,
    sync::broadcast,
    time::{sleep, Duration},
};
use tracing::info;

use crate::{
    app_state::{AppState, RealtimeCommand},
    generation::{
        classify_group_chat_intent, generate_chat_reply_text, generate_group_coordinator_text,
        generate_memory_summary_text,
    },
    models::{
        CharacterRecord, ConversationRecord, ConversationUpdatedEventPayload, ErrorEventPayload,
        JoinConversationSocketPayload, MessageRecord, SendMessageSocketPayload, TypingEventPayload,
    },
};

const CHAT_NAMESPACE: &str = "/chat";
const SOCKET_PATH: &str = "/socket.io";
const EVENT_JOIN_CONVERSATION: &str = "join_conversation";
const EVENT_SEND_MESSAGE: &str = "send_message";
const EVENT_NEW_MESSAGE: &str = "new_message";
const EVENT_TYPING_START: &str = "typing_start";
const EVENT_TYPING_STOP: &str = "typing_stop";
const EVENT_CONVERSATION_UPDATED: &str = "conversation_updated";

pub fn install(io: SocketIo, state: AppState) {
    let mut event_receiver = state.realtime_events.subscribe();
    let event_state = state.clone();
    let event_io = io.clone();

    spawn(async move {
        loop {
            match event_receiver.recv().await {
                Ok(command) => handle_internal_command(command, &event_state, &event_io).await,
                Err(broadcast::error::RecvError::Lagged(skipped)) => {
                    let timestamp = now_token();
                    let mut realtime = event_state
                        .realtime
                        .write()
                        .expect("realtime lock poisoned");
                    record_realtime_event(
                        &mut realtime,
                        format!("internal-command-lagged:{skipped}"),
                        &timestamp,
                    );
                }
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    });

    let connect_state = state.clone();
    let connect_io = io.clone();

    io.ns(CHAT_NAMESPACE, move |socket: SocketRef| {
        let state = connect_state.clone();
        let io = connect_io.clone();

        async move {
            handle_connect(&socket, &state);

            let join_state = state.clone();
            socket.on(
                EVENT_JOIN_CONVERSATION,
                move |socket: SocketRef, Data::<JoinConversationSocketPayload>(payload)| {
                    let state = join_state.clone();

                    async move {
                        handle_join(socket, payload, state).await;
                    }
                },
            );

            let send_state = state.clone();
            let send_io = io.clone();
            socket.on(
                EVENT_SEND_MESSAGE,
                move |socket: SocketRef, Data::<SendMessageSocketPayload>(payload)| {
                    let state = send_state.clone();
                    let io = send_io.clone();

                    async move {
                        handle_send_message(socket, payload, state, io).await;
                    }
                },
            );

            let disconnect_state = state.clone();
            socket.on_disconnect(move |socket: SocketRef| {
                let state = disconnect_state.clone();

                async move {
                    handle_disconnect(socket, state).await;
                }
            });
        }
    });
}

async fn handle_internal_command(command: RealtimeCommand, state: &AppState, io: &SocketIo) {
    match command {
        RealtimeCommand::EmitConversationMessage {
            conversation_id,
            message,
            source,
        } => {
            emit_room_event(io, &conversation_id, EVENT_NEW_MESSAGE, &message).await;
            stamp_message_event(
                state,
                &format!("internal-message:{source}:{conversation_id}"),
            );
        }
    }
}

pub const fn namespace() -> &'static str {
    CHAT_NAMESPACE
}

pub const fn socket_path() -> &'static str {
    SOCKET_PATH
}

pub fn event_names() -> Vec<String> {
    vec![
        EVENT_JOIN_CONVERSATION.into(),
        EVENT_SEND_MESSAGE.into(),
        EVENT_NEW_MESSAGE.into(),
        EVENT_TYPING_START.into(),
        EVENT_TYPING_STOP.into(),
        EVENT_CONVERSATION_UPDATED.into(),
    ]
}

fn handle_connect(socket: &SocketRef, state: &AppState) {
    let socket_id = socket.id.to_string();
    let timestamp = now_token();
    let mut realtime = state.realtime.write().expect("realtime lock poisoned");
    realtime.connected_clients += 1;
    record_realtime_event(&mut realtime, format!("connected:{socket_id}"), &timestamp);
    info!("socket connected: {}", socket_id);
}

async fn handle_disconnect(socket: SocketRef, state: AppState) {
    let socket_id = socket.id.to_string();
    let joined_rooms = socket
        .rooms()
        .into_iter()
        .map(|room| room.to_string())
        .filter(|room| room != &socket_id)
        .collect::<Vec<_>>();
    let timestamp = now_token();

    let mut realtime = state.realtime.write().expect("realtime lock poisoned");
    realtime.connected_clients = realtime.connected_clients.saturating_sub(1);

    for room_id in joined_rooms {
        match realtime.room_subscribers.get_mut(&room_id) {
            Some(count) if *count > 1 => *count -= 1,
            Some(_) => {
                realtime.room_subscribers.remove(&room_id);
            }
            None => {}
        }
    }

    record_realtime_event(
        &mut realtime,
        format!("disconnected:{socket_id}"),
        &timestamp,
    );
    info!("socket disconnected: {}", socket_id);
}

async fn handle_join(socket: SocketRef, payload: JoinConversationSocketPayload, state: AppState) {
    let conversation_id = payload.conversation_id.trim().to_string();

    if conversation_id.is_empty() {
        return;
    }

    let already_joined = socket
        .rooms()
        .iter()
        .any(|room| room.to_string() == conversation_id);

    socket.join(conversation_id.clone());

    if !already_joined {
        let timestamp = now_token();
        let mut realtime = state.realtime.write().expect("realtime lock poisoned");
        *realtime
            .room_subscribers
            .entry(conversation_id.clone())
            .or_insert(0) += 1;
        record_realtime_event(
            &mut realtime,
            format!("joined:{conversation_id}"),
            &timestamp,
        );
    }
}

async fn handle_send_message(
    socket: SocketRef,
    payload: SendMessageSocketPayload,
    state: AppState,
    io: SocketIo,
) {
    let Some(user_id) = payload
        .user_id
        .clone()
        .filter(|value| !value.trim().is_empty())
    else {
        let _ = socket.emit(
            "error",
            &ErrorEventPayload {
                message: "未登录，请先登录".into(),
            },
        );
        return;
    };

    let conversation = ensure_conversation(
        &state,
        &user_id,
        &payload.character_id,
        &payload.conversation_id,
    );
    let conversation_id = conversation.id.clone();
    ensure_socket_joined(&socket, &conversation_id, &state);

    match get_activity_mode(&state, &payload.character_id).as_deref() {
        Some("sleeping") => {
            let system_message = build_system_message(&conversation_id, sleeping_hints());
            emit_room_event(&io, &conversation_id, EVENT_NEW_MESSAGE, &system_message).await;
            stamp_message_event(&state, "sleeping-system-message");
            return;
        }
        Some("working") | Some("commuting") => {
            let system_message = build_system_message(&conversation_id, busy_hints());
            emit_room_event(&io, &conversation_id, EVENT_NEW_MESSAGE, &system_message).await;
            stamp_message_event(&state, "busy-system-message");

            let delayed_state = state.clone();
            let delayed_io = io.clone();
            let delayed_payload = payload.clone();
            let delayed_conversation_id = conversation_id.clone();

            tokio::spawn(async move {
                sleep(Duration::from_millis(busy_delay_ms())).await;
                process_conversation_turn(
                    delayed_state,
                    delayed_io,
                    delayed_conversation_id,
                    delayed_payload.character_id,
                    user_id,
                    delayed_payload.text,
                )
                .await;
            });

            return;
        }
        _ => {}
    }

    process_conversation_turn(
        state,
        io,
        conversation_id,
        payload.character_id,
        user_id,
        payload.text,
    )
    .await;
}

async fn process_conversation_turn(
    state: AppState,
    io: SocketIo,
    conversation_id: String,
    character_id: String,
    user_id: String,
    text: String,
) {
    emit_room_event(
        &io,
        &conversation_id,
        EVENT_TYPING_START,
        &TypingEventPayload {
            character_id: character_id.clone(),
        },
    )
    .await;

    let (conversation, messages) = persist_conversation_turn_gateway(
        &state,
        &conversation_id,
        &character_id,
        &user_id,
        &text,
    )
    .await;
    let typing_delay = typing_delay_ms(
        messages
            .iter()
            .find(|message| message.sender_type == "character"),
    );
    sleep(Duration::from_millis(typing_delay)).await;

    emit_room_event(
        &io,
        &conversation_id,
        EVENT_TYPING_STOP,
        &TypingEventPayload { character_id },
    )
    .await;

    for message in &messages {
        emit_room_event(&io, &conversation_id, EVENT_NEW_MESSAGE, message).await;
    }

    if conversation.r#type == "group" {
        emit_room_event(
            &io,
            &conversation_id,
            EVENT_CONVERSATION_UPDATED,
            &ConversationUpdatedEventPayload {
                id: conversation.id,
                r#type: conversation.r#type,
                title: conversation.title,
                participants: conversation.participants,
            },
        )
        .await;
    }

    stamp_message_event(&state, "conversation-turn");
}

async fn emit_room_event<T: serde::Serialize>(
    io: &SocketIo,
    room_id: &str,
    event: &str,
    payload: &T,
) {
    if let Some(namespace) = io.of(CHAT_NAMESPACE) {
        let _ = namespace.to(room_id.to_string()).emit(event, payload).await;
    }
}

fn ensure_socket_joined(socket: &SocketRef, conversation_id: &str, state: &AppState) {
    let already_joined = socket
        .rooms()
        .iter()
        .any(|room| room.to_string() == conversation_id);

    if already_joined {
        return;
    }

    socket.join(conversation_id.to_string());

    let timestamp = now_token();
    let mut realtime = state.realtime.write().expect("realtime lock poisoned");
    *realtime
        .room_subscribers
        .entry(conversation_id.to_string())
        .or_insert(0) += 1;
    record_realtime_event(
        &mut realtime,
        format!("auto-joined:{conversation_id}"),
        &timestamp,
    );
}

fn ensure_conversation(
    state: &AppState,
    user_id: &str,
    character_id: &str,
    requested_id: &str,
) -> ConversationRecord {
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    let conversation_id = if requested_id.trim().is_empty() {
        format!("{user_id}_{character_id}")
    } else {
        requested_id.to_string()
    };

    if let Some(existing) = runtime.conversations.get(&conversation_id) {
        return existing.clone();
    }

    let title = runtime
        .characters
        .get(character_id)
        .map(|character| character.name.clone())
        .unwrap_or_else(|| character_id.to_string());

    let conversation = ConversationRecord {
        id: conversation_id.clone(),
        user_id: user_id.to_string(),
        r#type: "direct".into(),
        title,
        participants: vec![character_id.to_string()],
        messages: Vec::new(),
        created_at: now_token(),
        updated_at: now_token(),
        last_read_at: None,
    };

    runtime
        .conversations
        .insert(conversation_id.clone(), conversation.clone());
    runtime.messages.entry(conversation_id).or_default();

    conversation
}

#[allow(dead_code, unused_variables, unused_mut)]
fn persist_conversation_turn(
    state: &AppState,
    conversation_id: &str,
    requested_character_id: &str,
    user_id: &str,
    text: &str,
) -> (ConversationRecord, Vec<MessageRecord>) {
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    let user_name = runtime
        .users
        .get(user_id)
        .map(|user| user.username.clone())
        .unwrap_or_else(|| "我".into());

    let (conversation_type, participants, title) = {
        let conversation = runtime
            .conversations
            .get(conversation_id)
            .cloned()
            .expect("conversation should exist before message persistence");

        (
            conversation.r#type,
            conversation.participants,
            conversation.title,
        )
    };
    let user_message = MessageRecord {
        id: format!("msg_{}_user", now_token()),
        conversation_id: conversation_id.to_string(),
        sender_type: "user".into(),
        sender_id: user_id.to_string(),
        sender_name: user_name,
        r#type: "text".into(),
        text: text.to_string(),
        created_at: now_token(),
    };

    let mut generated_messages = vec![user_message.clone()];
    let mut reply_characters = participants
        .iter()
        .filter_map(|participant| runtime.characters.get(participant).cloned())
        .collect::<Vec<_>>();

    if conversation_type == "direct" && reply_characters.is_empty() {
        if let Some(character) = runtime.characters.get(requested_character_id).cloned() {
            reply_characters.push(character);
        }
    }

    drop(runtime);

    for character in reply_characters {
        let reply = MessageRecord {
            id: format!("msg_{}_{}", now_token(), character.id),
            conversation_id: conversation_id.to_string(),
            sender_type: "character".into(),
            sender_id: character.id.clone(),
            sender_name: character.name.clone(),
            r#type: "text".into(),
            text: build_reply_text(&character, text, conversation_type == "group"),
            created_at: now_token(),
        };
        generated_messages.push(reply);
    }

    let conversation_snapshot = {
        let mut runtime = state.runtime.write().expect("runtime lock poisoned");
        let messages = runtime
            .messages
            .entry(conversation_id.to_string())
            .or_default();
        messages.extend(generated_messages.iter().cloned());
        let conversation = runtime
            .conversations
            .get_mut(conversation_id)
            .expect("conversation should exist while updating timestamp");
        conversation.updated_at = now_token();
        conversation.title = title;
        conversation.clone()
    };
    state.request_persist("realtime-conversation-turn");

    (conversation_snapshot, generated_messages)
}

async fn persist_conversation_turn_gateway(
    state: &AppState,
    conversation_id: &str,
    requested_character_id: &str,
    user_id: &str,
    text: &str,
) -> (ConversationRecord, Vec<MessageRecord>) {
    let (user_name, mut conversation, previous_messages, reply_characters, primary_character_id) = {
        let runtime = state.runtime.read().expect("runtime lock poisoned");
        let conversation = runtime
            .conversations
            .get(conversation_id)
            .cloned()
            .expect("conversation should exist before message persistence");
        let mut reply_characters = conversation
            .participants
            .iter()
            .filter_map(|participant| runtime.characters.get(participant).cloned())
            .collect::<Vec<_>>();

        if conversation.r#type == "direct" && reply_characters.is_empty() {
            if let Some(character) = runtime.characters.get(requested_character_id).cloned() {
                reply_characters.push(character);
            }
        }

        (
            runtime
                .users
                .get(user_id)
                .map(|user| user.username.clone())
                .unwrap_or_else(|| "User".into()),
            conversation,
            runtime
                .messages
                .get(conversation_id)
                .cloned()
                .unwrap_or_default(),
            reply_characters,
            runtime
                .conversations
                .get(conversation_id)
                .and_then(|stored| stored.participants.first().cloned())
                .or_else(|| {
                    if requested_character_id.trim().is_empty() {
                        None
                    } else {
                        Some(requested_character_id.to_string())
                    }
                }),
        )
    };

    let user_message = MessageRecord {
        id: format!("msg_{}_user", now_token()),
        conversation_id: conversation_id.to_string(),
        sender_type: "user".into(),
        sender_id: user_id.to_string(),
        sender_name: user_name,
        r#type: "text".into(),
        text: text.to_string(),
        created_at: now_token(),
    };

    let mut generated_messages = vec![user_message.clone()];
    let mut handled_group_upgrade = false;

    if conversation.r#type == "direct" {
        if let Some(primary_character_id) = primary_character_id.as_ref() {
            let primary_character = reply_characters
                .iter()
                .find(|character| character.id == *primary_character_id)
                .cloned()
                .or_else(|| {
                    let runtime = state.runtime.read().expect("runtime lock poisoned");
                    runtime.characters.get(primary_character_id).cloned()
                });

            if let Some(primary_character) = primary_character {
                let intent = classify_group_chat_intent(state, &primary_character, text)
                    .await
                    .unwrap_or_default();
                if intent.needs_group_chat && !intent.required_domains.is_empty() {
                    let invited_characters = {
                        let runtime = state.runtime.read().expect("runtime lock poisoned");
                        let known_character_ids = runtime
                            .conversations
                            .values()
                            .filter(|item| item.user_id == user_id)
                            .flat_map(|item| item.participants.iter().cloned())
                            .filter(|participant| participant != &primary_character.id)
                            .collect::<Vec<_>>();

                        runtime
                            .characters
                            .values()
                            .filter(|character| {
                                character.id != primary_character.id
                                    && known_character_ids.contains(&character.id)
                                    && character.expert_domains.iter().any(|domain| {
                                        intent
                                            .required_domains
                                            .iter()
                                            .any(|required| required == &domain.to_lowercase())
                                    })
                            })
                            .take(2)
                            .cloned()
                            .collect::<Vec<_>>()
                    };

                    if !invited_characters.is_empty() {
                        handled_group_upgrade = true;
                        conversation.r#type = "group".into();
                        conversation.title = "临时咨询群".into();
                        for invited in &invited_characters {
                            if !conversation.participants.contains(&invited.id) {
                                conversation.participants.push(invited.id.clone());
                            }
                        }

                        let coordinator_text = generate_group_coordinator_text(
                            state,
                            &primary_character,
                            &invited_characters,
                            text,
                        )
                        .await
                        .unwrap_or_else(|| {
                            fallback_group_coordinator_text(&primary_character, &invited_characters)
                        });
                        generated_messages.push(MessageRecord {
                            id: format!("msg_{}_coord", now_token()),
                            conversation_id: conversation_id.to_string(),
                            sender_type: "character".into(),
                            sender_id: primary_character.id.clone(),
                            sender_name: primary_character.name.clone(),
                            r#type: "text".into(),
                            text: coordinator_text,
                            created_at: now_token(),
                        });

                        for invited in &invited_characters {
                            generated_messages.push(build_group_invite_system_message(
                                conversation_id,
                                &primary_character.name,
                                &invited.name,
                            ));
                        }

                        for invited in invited_characters {
                            let mut generation_history = previous_messages.clone();
                            generation_history.extend(generated_messages.iter().cloned());
                            let reply_text = generate_chat_reply_text(
                                state,
                                &invited,
                                &conversation,
                                &generation_history,
                            )
                            .await
                            .unwrap_or_else(|| build_reply_text(&invited, text, true));
                            generated_messages.push(MessageRecord {
                                id: format!("msg_{}_{}", now_token(), invited.id),
                                conversation_id: conversation_id.to_string(),
                                sender_type: "character".into(),
                                sender_id: invited.id.clone(),
                                sender_name: invited.name.clone(),
                                r#type: "text".into(),
                                text: reply_text,
                                created_at: now_token(),
                            });
                        }
                    }
                }
            }
        }
    }

    if !handled_group_upgrade {
        for character in reply_characters {
            let mut generation_history = previous_messages.clone();
            generation_history.extend(generated_messages.iter().cloned());
            let reply_text = generate_chat_reply_text(
                state,
                &character,
                &conversation,
                &generation_history,
            )
            .await
            .unwrap_or_else(|| build_reply_text(&character, text, conversation.r#type == "group"));
            let reply = MessageRecord {
                id: format!("msg_{}_{}", now_token(), character.id),
                conversation_id: conversation_id.to_string(),
                sender_type: "character".into(),
                sender_id: character.id.clone(),
                sender_name: character.name.clone(),
                r#type: "text".into(),
                text: reply_text,
                created_at: now_token(),
            };
            generated_messages.push(reply);
        }
    }

    let mut full_history = previous_messages.clone();
    full_history.extend(generated_messages.iter().cloned());
    let refreshed_memory = if !full_history.is_empty() && full_history.len() % 10 == 0 {
        if let Some(primary_character_id) = primary_character_id.as_ref() {
            let primary_character = {
                let runtime = state.runtime.read().expect("runtime lock poisoned");
                runtime.characters.get(primary_character_id).cloned()
            };

            match primary_character {
                Some(character) => generate_memory_summary_text(state, &character, &full_history)
                    .await
                    .map(|summary| (character.id, summary, character.profile.memory_summary)),
                None => None,
            }
        } else {
            None
        }
    } else {
        None
    };

    let conversation_snapshot = {
        let mut runtime = state.runtime.write().expect("runtime lock poisoned");
        let messages = runtime
            .messages
            .entry(conversation_id.to_string())
            .or_default();
        messages.extend(generated_messages.iter().cloned());
        if let Some((character_id, summary, previous_summary)) = refreshed_memory.as_ref() {
            if let Some(character) = runtime.characters.get_mut(character_id) {
                character.profile.memory_summary = summary.clone();
                match character.profile.memory.as_mut() {
                    Some(memory) => {
                        memory.recent_summary = summary.clone();
                    }
                    None => {
                        character.profile.memory = Some(crate::models::MemoryLayers {
                            core_memory: if previous_summary.trim().is_empty() {
                                summary.clone()
                            } else {
                                previous_summary.clone()
                            },
                            recent_summary: summary.clone(),
                            forgetting_curve: 70,
                        });
                    }
                }
            }
        }
        let stored_conversation = runtime
            .conversations
            .get_mut(conversation_id)
            .expect("conversation should exist while updating timestamp");
        stored_conversation.updated_at = now_token();
        stored_conversation.title = conversation.title.clone();
        stored_conversation.r#type = conversation.r#type.clone();
        stored_conversation.participants = conversation.participants.clone();
        stored_conversation.clone()
    };
    state.request_persist("realtime-conversation-turn");

    (conversation_snapshot, generated_messages)
}

fn get_activity_mode(state: &AppState, character_id: &str) -> Option<String> {
    let runtime = state.runtime.read().expect("runtime lock poisoned");
    runtime.characters.get(character_id).and_then(|character| {
        character.current_activity.clone().or_else(|| {
            if character.is_online {
                None
            } else {
                Some("sleeping".into())
            }
        })
    })
}

fn build_system_message(conversation_id: &str, options: &[&str]) -> MessageRecord {
    let timestamp = now_token();
    let index = parse_timestamp(&timestamp) as usize % options.len();

    MessageRecord {
        id: format!("msg_{}_system", timestamp),
        conversation_id: conversation_id.to_string(),
        sender_type: "system".into(),
        sender_id: "system".into(),
        sender_name: "system".into(),
        r#type: "system".into(),
        text: options[index].to_string(),
        created_at: timestamp,
    }
}

fn build_group_invite_system_message(
    conversation_id: &str,
    inviter_name: &str,
    invited_name: &str,
) -> MessageRecord {
    MessageRecord {
        id: format!("msg_{}_group_system", now_token()),
        conversation_id: conversation_id.to_string(),
        sender_type: "system".into(),
        sender_id: "system".into(),
        sender_name: "system".into(),
        r#type: "system".into(),
        text: format!("{inviter_name} 邀请 {invited_name} 加入了群聊"),
        created_at: now_token(),
    }
}

fn fallback_group_coordinator_text(
    trigger_character: &CharacterRecord,
    invited_characters: &[CharacterRecord],
) -> String {
    let invited_names = invited_characters
        .iter()
        .map(|character| character.name.as_str())
        .collect::<Vec<_>>();
    format!(
        "{}觉得这个问题适合拉上{}一起看看。",
        trigger_character.name,
        invited_names.join("和")
    )
}

fn build_reply_text(character: &CharacterRecord, user_text: &str, is_group: bool) -> String {
    let topic = character
        .expert_domains
        .first()
        .cloned()
        .unwrap_or_else(|| "日常".into());
    let excerpt = shorten(user_text, 20);

    if is_group {
        format!(
            "{}：我看到你提到“{}”，先补一句偏 {} 视角的判断，后面我们可以再展开。",
            character.name, excerpt, topic
        )
    } else {
        format!(
            "{}收到了你关于“{}”的消息。先从{}角度回应一句：这件事值得继续往下聊。",
            character.name, excerpt, topic
        )
    }
}

fn shorten(text: &str, max_chars: usize) -> String {
    let shortened = text.chars().take(max_chars).collect::<String>();
    if text.chars().count() > max_chars {
        format!("{shortened}...")
    } else {
        shortened
    }
}

fn sleeping_hints() -> &'static [&'static str] {
    &[
        "（消息已送达，对方正在休息，醒来后会看到。）",
        "（现在已经很晚了，对方暂时睡着了，明天再聊吧。）",
        "（对方休息中，这条消息会在醒来后看到。）",
    ]
}

fn busy_hints() -> &'static [&'static str] {
    &[
        "（对方现在正在忙，消息已经看到，稍后回复。）",
        "（对方处于工作/通勤状态，等会儿会接上这段聊天。）",
        "（消息已读，对方手头还有事，稍后会回你。）",
    ]
}

fn busy_delay_ms() -> u64 {
    8_000 + (parse_timestamp(&now_token()) % 7_000) as u64
}

fn typing_delay_ms(reply: Option<&MessageRecord>) -> u64 {
    reply
        .map(|message| {
            let char_count = message.text.chars().count() as u64;
            (char_count * 16).clamp(400, 3_000)
        })
        .unwrap_or(400)
}

fn stamp_message_event(state: &AppState, label: &str) {
    let timestamp = now_token();
    let mut realtime = state.realtime.write().expect("realtime lock poisoned");
    realtime.last_message_at = Some(timestamp.clone());
    record_realtime_event(&mut realtime, label.to_string(), &timestamp);
}

fn record_realtime_event(
    realtime: &mut crate::app_state::RealtimeState,
    label: String,
    timestamp: &str,
) {
    realtime.last_event_at = Some(timestamp.to_string());
    realtime.recent_events.push(format!("{timestamp}:{label}"));

    if realtime.recent_events.len() > 12 {
        let overflow = realtime.recent_events.len() - 12;
        realtime.recent_events.drain(0..overflow);
    }
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
