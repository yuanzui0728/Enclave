use std::time::{Instant, SystemTime, UNIX_EPOCH};

use crate::{
    app_state::AppState,
    evals::{
        storage,
        types::{
            GenerationTraceInputRecord, GenerationTraceOutputRecord, GenerationTraceProviderRecord,
            GenerationTraceRecord, TracePromptMessageRecord,
        },
    },
    models::{
        CharacterRecord, ConversationRecord, FeedPostRecord, MessageRecord, WorldContextRecord,
    },
};

#[allow(dead_code)]
#[derive(Clone, Debug, Default)]
pub struct GroupChatIntent {
    pub needs_group_chat: bool,
    pub reason: String,
    pub required_domains: Vec<String>,
}

pub async fn generate_chat_reply_text(
    state: &AppState,
    character: &CharacterRecord,
    conversation: &ConversationRecord,
    conversation_history: &[MessageRecord],
) -> Option<String> {
    if state.inference_gateway.active_provider().is_none() {
        return None;
    }

    let started = Instant::now();
    let is_group = conversation.r#type == "group";
    let history_window = history_window_size(character);
    let history_start = conversation_history.len().saturating_sub(history_window);
    let mut messages = vec![yinjie_inference_gateway::ChatMessage {
        role: "system".into(),
        content: build_chat_system_prompt(
            character,
            is_group,
            latest_world_context(state).as_ref(),
        ),
    }];

    messages.extend(
        conversation_history[history_start..]
            .iter()
            .filter_map(|message| history_message(message, character, is_group)),
    );

    if !messages.iter().any(|message| message.role == "user") {
        record_generation_trace(
            state,
            build_generation_trace(
                "chat.reply",
                "fallback",
                Some(conversation.id.clone()),
                Some(character.id.clone()),
                Vec::new(),
                None,
                Some(history_window),
                &messages,
                serde_json::json!({
                    "trigger": "conversation-history-missing-user",
                    "isGroup": is_group,
                    "activity": character.current_activity.clone(),
                    "memory": character.profile.memory_summary.clone()
                }),
                GenerationTraceOutputRecord {
                    raw_output: None,
                    normalized_output: None,
                    fallback_reason: Some("no-user-message-in-history-window".into()),
                    error_message: None,
                },
                started.elapsed().as_millis() as u64,
            ),
        );
        return None;
    }

    let request = yinjie_inference_gateway::ChatCompletionRequest {
        messages: messages.clone(),
        model: None,
        temperature: Some(if is_group { 0.8 } else { 0.85 }),
        max_tokens: Some(if is_group { 180 } else { 220 }),
    };

    match state.inference_gateway.chat_completion(request).await {
        Ok(response) => {
            let normalized = normalize_generated_text(&response.content);
            record_generation_trace(
                state,
                build_generation_trace(
                    "chat.reply",
                    if normalized.is_some() { "success" } else { "fallback" },
                    Some(conversation.id.clone()),
                    Some(character.id.clone()),
                    Vec::new(),
                    None,
                    Some(history_window),
                    &messages,
                    serde_json::json!({
                        "trigger": "realtime-chat-reply",
                        "isGroup": is_group,
                        "activity": character.current_activity.clone(),
                        "memory": character.profile.memory_summary.clone()
                    }),
                    GenerationTraceOutputRecord {
                        raw_output: Some(response.content),
                        normalized_output: normalized.clone(),
                        fallback_reason: normalized.is_none().then(|| "normalized-output-empty".into()),
                        error_message: None,
                    },
                    started.elapsed().as_millis() as u64,
                ),
            );
            normalized
        }
        Err(error) => {
            record_generation_trace(
                state,
                build_generation_trace(
                    "chat.reply",
                    "error",
                    Some(conversation.id.clone()),
                    Some(character.id.clone()),
                    Vec::new(),
                    None,
                    Some(history_window),
                    &messages,
                    serde_json::json!({
                        "trigger": "realtime-chat-reply",
                        "isGroup": is_group,
                        "activity": character.current_activity.clone(),
                        "memory": character.profile.memory_summary.clone()
                    }),
                    GenerationTraceOutputRecord {
                        raw_output: None,
                        normalized_output: None,
                        fallback_reason: Some("gateway-error".into()),
                        error_message: Some(error),
                    },
                    started.elapsed().as_millis() as u64,
                ),
            );
            None
        }
    }
}

pub async fn classify_group_chat_intent(
    state: &AppState,
    character: &CharacterRecord,
    user_message: &str,
) -> Option<GroupChatIntent> {
    if state.inference_gateway.active_provider().is_none() {
        return None;
    }

    let started = Instant::now();
    let request = yinjie_inference_gateway::ChatCompletionRequest {
        messages: vec![
            yinjie_inference_gateway::ChatMessage {
                role: "system".into(),
                content: "You classify whether a user question needs a multi-character consultation. Reply with JSON only.".into(),
            },
            yinjie_inference_gateway::ChatMessage {
                role: "user".into(),
                content: format!(
                    "用户发给{character_name}（专长：{domains}）的消息：\n\"{message}\"\n\n判断这个问题是否超出{character_name}的专长范围，需要其他领域的朋友帮忙。\n\n以JSON格式输出：\n{{\n  \"needsGroupChat\": true/false,\n  \"reason\": \"简短说明原因\",\n  \"requiredDomains\": [\"需要的领域1\", \"需要的领域2\"]\n}}\n\n只输出JSON。",
                    character_name = character.name,
                    domains = if character.expert_domains.is_empty() {
                        "general".into()
                    } else {
                        character.expert_domains.join("、")
                    },
                    message = user_message
                ),
            },
        ],
        model: None,
        temperature: Some(0.1),
        max_tokens: Some(140),
    };

    let messages = request.messages.clone();
    let response = match state.inference_gateway.chat_completion(request).await {
        Ok(response) => response,
        Err(error) => {
            record_generation_trace(
                state,
                build_generation_trace(
                    "group.intent",
                    "error",
                    None,
                    Some(character.id.clone()),
                    Vec::new(),
                    None,
                    None,
                    &messages,
                    serde_json::json!({
                        "trigger": "group-chat-classification",
                        "userMessage": user_message,
                        "memory": character.profile.memory_summary.clone()
                    }),
                    GenerationTraceOutputRecord {
                        raw_output: None,
                        normalized_output: None,
                        fallback_reason: Some("gateway-error".into()),
                        error_message: Some(error),
                    },
                    started.elapsed().as_millis() as u64,
                ),
            );
            return None;
        }
    };
    let parsed = match parse_json_value(&response.content) {
        Some(parsed) => parsed,
        None => {
            record_generation_trace(
                state,
                build_generation_trace(
                    "group.intent",
                    "fallback",
                    None,
                    Some(character.id.clone()),
                    Vec::new(),
                    None,
                    None,
                    &messages,
                    serde_json::json!({
                        "trigger": "group-chat-classification",
                        "userMessage": user_message,
                        "memory": character.profile.memory_summary.clone()
                    }),
                    GenerationTraceOutputRecord {
                        raw_output: Some(response.content),
                        normalized_output: None,
                        fallback_reason: Some("invalid-json-response".into()),
                        error_message: None,
                    },
                    started.elapsed().as_millis() as u64,
                ),
            );
            return None;
        }
    };

    let intent = GroupChatIntent {
        needs_group_chat: parsed
            .get("needsGroupChat")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false),
        reason: parsed
            .get("reason")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .trim()
            .to_string(),
        required_domains: parsed
            .get("requiredDomains")
            .and_then(serde_json::Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(serde_json::Value::as_str)
                    .map(|value| value.trim().to_lowercase())
                    .filter(|value| !value.is_empty())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default(),
    };
    record_generation_trace(
        state,
        build_generation_trace(
            "group.intent",
            "success",
            None,
            Some(character.id.clone()),
            Vec::new(),
            None,
            None,
            &messages,
            serde_json::json!({
                "trigger": "group-chat-classification",
                "userMessage": user_message,
                "memory": character.profile.memory_summary.clone()
            }),
            GenerationTraceOutputRecord {
                raw_output: Some(response.content),
                normalized_output: Some(
                    serde_json::json!({
                        "needsGroupChat": intent.needs_group_chat,
                        "reason": intent.reason,
                        "requiredDomains": intent.required_domains,
                    })
                    .to_string(),
                ),
                fallback_reason: None,
                error_message: None,
            },
            started.elapsed().as_millis() as u64,
        ),
    );
    Some(intent)
}

pub async fn generate_group_coordinator_text(
    state: &AppState,
    trigger_character: &CharacterRecord,
    invited_characters: &[CharacterRecord],
    topic: &str,
) -> Option<String> {
    if state.inference_gateway.active_provider().is_none() || invited_characters.is_empty() {
        return None;
    }

    let started = Instant::now();
    let invited_names = invited_characters
        .iter()
        .map(|character| character.name.as_str())
        .collect::<Vec<_>>();
    let request = yinjie_inference_gateway::ChatCompletionRequest {
        messages: vec![
            yinjie_inference_gateway::ChatMessage {
                role: "system".into(),
                content: format!(
                    "You are roleplaying {}. Reply in natural Chinese only and stay in character.",
                    trigger_character.name
                ),
            },
            yinjie_inference_gateway::ChatMessage {
                role: "user".into(),
                content: format!(
                    "你是{}，你刚刚把{}拉进了群聊，因为用户问了一个关于“{}”的问题，超出了你一个人的专长范围。请用自然的方式说明为什么拉群，语气要像真实朋友一样，简短自然，不超过两句话。",
                    trigger_character.name,
                    invited_names.join("和"),
                    topic
                ),
            },
        ],
        model: None,
        temperature: Some(0.8),
        max_tokens: Some(100),
    };

    let messages = request.messages.clone();
    match state.inference_gateway.chat_completion(request).await {
        Ok(response) => {
            let normalized = normalize_generated_text(&response.content);
            record_generation_trace(
                state,
                build_generation_trace(
                    "group.coordinator",
                    if normalized.is_some() { "success" } else { "fallback" },
                    None,
                    Some(trigger_character.id.clone()),
                    invited_characters.iter().map(|character| character.id.clone()).collect(),
                    None,
                    None,
                    &messages,
                    serde_json::json!({
                        "trigger": "group-chat-upgrade",
                        "topic": topic,
                        "memory": trigger_character.profile.memory_summary.clone()
                    }),
                    GenerationTraceOutputRecord {
                        raw_output: Some(response.content),
                        normalized_output: normalized.clone(),
                        fallback_reason: normalized.is_none().then(|| "normalized-output-empty".into()),
                        error_message: None,
                    },
                    started.elapsed().as_millis() as u64,
                ),
            );
            normalized
        }
        Err(error) => {
            record_generation_trace(
                state,
                build_generation_trace(
                    "group.coordinator",
                    "error",
                    None,
                    Some(trigger_character.id.clone()),
                    invited_characters.iter().map(|character| character.id.clone()).collect(),
                    None,
                    None,
                    &messages,
                    serde_json::json!({
                        "trigger": "group-chat-upgrade",
                        "topic": topic,
                        "memory": trigger_character.profile.memory_summary.clone()
                    }),
                    GenerationTraceOutputRecord {
                        raw_output: None,
                        normalized_output: None,
                        fallback_reason: Some("gateway-error".into()),
                        error_message: Some(error),
                    },
                    started.elapsed().as_millis() as u64,
                ),
            );
            None
        }
    }
}

pub async fn generate_social_greeting_text(
    state: &AppState,
    character: &CharacterRecord,
    trigger_scene: Option<&str>,
) -> Option<String> {
    if state.inference_gateway.active_provider().is_none() {
        return None;
    }

    let started = Instant::now();
    let world_line = latest_world_context(state)
        .as_ref()
        .map(format_world_context)
        .unwrap_or_else(|| "world context unavailable".into());
    let base_prompt = character
        .profile
        .system_prompt
        .clone()
        .or_else(|| character.profile.base_prompt.clone())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| format!("You are roleplaying {}.", character.name));
    let scenario = trigger_scene.map_or_else(
        || {
            "You met the user through the shake discovery feature. Write one short first-contact greeting in Chinese, under 25 characters, with a light self-introduction.".to_string()
        },
        |scene| {
            format!(
                "You crossed paths with the user in {scene}. Write one natural Chinese friend-request greeting under 40 characters, including a brief self-introduction and why you want to connect."
            )
        },
    );

    let request = yinjie_inference_gateway::ChatCompletionRequest {
        messages: vec![
            yinjie_inference_gateway::ChatMessage {
                role: "system".into(),
                content: format!(
                    "{base_prompt}\n\nStay in character. Do not mention AI, prompts, or policies.\nReply in natural Chinese only.\nRelationship: {relationship}\nBio: {bio}\nEmotional tone: {tone}\nWorld context: {world_line}",
                    relationship = character.relationship,
                    bio = if character.bio.trim().is_empty() {
                        "not provided"
                    } else {
                        character.bio.trim()
                    },
                    tone = character.profile.traits.emotional_tone,
                ),
            },
            yinjie_inference_gateway::ChatMessage {
                role: "user".into(),
                content: scenario,
            },
        ],
        model: None,
        temperature: Some(0.9),
        max_tokens: Some(90),
    };

    let messages = request.messages.clone();
    match state.inference_gateway.chat_completion(request).await {
        Ok(response) => {
            let normalized = normalize_generated_text(&response.content);
            record_generation_trace(
                state,
                build_generation_trace(
                    "social.greeting",
                    if normalized.is_some() { "success" } else { "fallback" },
                    None,
                    Some(character.id.clone()),
                    Vec::new(),
                    None,
                    None,
                    &messages,
                    serde_json::json!({
                        "trigger": trigger_scene.unwrap_or("shake"),
                        "worldContext": {
                            "line": world_line
                        },
                        "memory": character.profile.memory_summary.clone()
                    }),
                    GenerationTraceOutputRecord {
                        raw_output: Some(response.content),
                        normalized_output: normalized.clone(),
                        fallback_reason: normalized.is_none().then(|| "normalized-output-empty".into()),
                        error_message: None,
                    },
                    started.elapsed().as_millis() as u64,
                ),
            );
            normalized
        }
        Err(error) => {
            record_generation_trace(
                state,
                build_generation_trace(
                    "social.greeting",
                    "error",
                    None,
                    Some(character.id.clone()),
                    Vec::new(),
                    None,
                    None,
                    &messages,
                    serde_json::json!({
                        "trigger": trigger_scene.unwrap_or("shake"),
                        "worldContext": {
                            "line": world_line
                        },
                        "memory": character.profile.memory_summary.clone()
                    }),
                    GenerationTraceOutputRecord {
                        raw_output: None,
                        normalized_output: None,
                        fallback_reason: Some("gateway-error".into()),
                        error_message: Some(error),
                    },
                    started.elapsed().as_millis() as u64,
                ),
            );
            None
        }
    }
}

pub async fn generate_memory_summary_text(
    state: &AppState,
    character: &CharacterRecord,
    conversation_history: &[MessageRecord],
) -> Option<String> {
    if state.inference_gateway.active_provider().is_none() || conversation_history.is_empty() {
        return None;
    }

    let started = Instant::now();
    let history_window = conversation_history
        .iter()
        .filter_map(|message| match message.sender_type.as_str() {
            "user" => Some(format!("User: {}", message.text)),
            "character" => Some(format!("{}: {}", message.sender_name, message.text)),
            _ => None,
        })
        .collect::<Vec<_>>();

    if history_window.is_empty() {
        return None;
    }

    let request = yinjie_inference_gateway::ChatCompletionRequest {
        messages: vec![
            yinjie_inference_gateway::ChatMessage {
                role: "system".into(),
                content: format!(
                    "You are maintaining the recent memory for {}. Summarize in Chinese only, under 100 characters, as the character's remembered impression of the user and the most important recent topics.",
                    character.name
                ),
            },
            yinjie_inference_gateway::ChatMessage {
                role: "user".into(),
                content: format!(
                    "Character: {name}\nRelationship: {relationship}\nCurrent memory summary: {memory}\nConversation history:\n{history}",
                    name = character.name,
                    relationship = character.relationship,
                    memory = if character.profile.memory_summary.trim().is_empty() {
                        "none"
                    } else {
                        character.profile.memory_summary.trim()
                    },
                    history = history_window.join("\n")
                ),
            },
        ],
        model: None,
        temperature: Some(0.3),
        max_tokens: Some(140),
    };

    let messages = request.messages.clone();
    match state.inference_gateway.chat_completion(request).await {
        Ok(response) => {
            let normalized = normalize_generated_text(&response.content);
            record_generation_trace(
                state,
                build_generation_trace(
                    "memory.summary",
                    if normalized.is_some() { "success" } else { "fallback" },
                    None,
                    Some(character.id.clone()),
                    Vec::new(),
                    None,
                    Some(history_window.len()),
                    &messages,
                    serde_json::json!({
                        "trigger": "memory-refresh",
                        "conversationHistoryLength": conversation_history.len(),
                        "memory": character.profile.memory_summary.clone()
                    }),
                    GenerationTraceOutputRecord {
                        raw_output: Some(response.content),
                        normalized_output: normalized.clone(),
                        fallback_reason: normalized.is_none().then(|| "normalized-output-empty".into()),
                        error_message: None,
                    },
                    started.elapsed().as_millis() as u64,
                ),
            );
            normalized
        }
        Err(error) => {
            record_generation_trace(
                state,
                build_generation_trace(
                    "memory.summary",
                    "error",
                    None,
                    Some(character.id.clone()),
                    Vec::new(),
                    None,
                    Some(history_window.len()),
                    &messages,
                    serde_json::json!({
                        "trigger": "memory-refresh",
                        "conversationHistoryLength": conversation_history.len(),
                        "memory": character.profile.memory_summary.clone()
                    }),
                    GenerationTraceOutputRecord {
                        raw_output: None,
                        normalized_output: None,
                        fallback_reason: Some("gateway-error".into()),
                        error_message: Some(error),
                    },
                    started.elapsed().as_millis() as u64,
                ),
            );
            None
        }
    }
}

pub async fn generate_moment_text(state: &AppState, character: &CharacterRecord) -> String {
    let fallback = fallback_moment_text(character);
    let Some(world_context) = latest_world_context(state) else {
        return fallback;
    };
    if state.inference_gateway.active_provider().is_none() {
        return fallback;
    }

    let activity = character
        .current_activity
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("日常");
    let memory_summary = character.profile.memory_summary.trim();
    let scenes = character
        .trigger_scenes
        .clone()
        .unwrap_or_default()
        .join(" / ");

    let system_prompt = format!(
        "你正在扮演{0}，身份是用户的{1}。保持{2}的语气，不要暴露自己是AI，只输出自然中文。",
        character.name,
        character.relationship,
        character.profile.traits.emotional_tone
    );
    let prompt = format!(
        "请写一条微信朋友圈正文。\n要求：\n- 只输出正文，不要解释\n- 不超过60字\n- 要像真实的人类随手发的内容\n- 结合当前时间、活动状态和人物气质\n\n角色名：{name}\n角色简介：{bio}\n当前活动：{activity}\n当前世界：{world}\n可用场景：{scenes}\n记忆摘要：{memory}",
        name = character.name,
        bio = character.bio,
        activity = activity,
        world = format_world_context(&world_context),
        scenes = if scenes.is_empty() { "无" } else { &scenes },
        memory = if memory_summary.is_empty() {
            "暂无"
        } else {
            memory_summary
        }
    );

    let request = yinjie_inference_gateway::ChatCompletionRequest {
        messages: vec![
            yinjie_inference_gateway::ChatMessage {
                role: "system".into(),
                content: system_prompt,
            },
            yinjie_inference_gateway::ChatMessage {
                role: "user".into(),
                content: prompt,
            },
        ],
        model: None,
        temperature: Some(0.95),
        max_tokens: Some(150),
    };

    match state.inference_gateway.chat_completion(request).await {
        Ok(response) => normalize_generated_text(&response.content).unwrap_or(fallback),
        Err(_) => fallback,
    }
}

pub async fn generate_feed_comment_text(
    state: &AppState,
    character: &CharacterRecord,
    post: &FeedPostRecord,
) -> String {
    let fallback = fallback_feed_comment_text(character);
    let Some(world_context) = latest_world_context(state) else {
        return fallback;
    };
    if state.inference_gateway.active_provider().is_none() {
        return fallback;
    }

    let system_prompt = format!(
        "你正在扮演{0}，说话风格是{1}。现在你是在熟人内容流里评论，不要解释，不要写多段。",
        character.name, character.profile.traits.emotional_tone
    );
    let prompt = format!(
        "请以{character_name}的身份，对下面这条动态写一句自然评论。\n要求：\n- 只输出一句评论\n- 不超过45字\n- 像熟人之间的真实互动\n- 不要重复原文\n\n当前世界：{world}\n动态作者：{author_name}\n动态内容：{post_text}",
        character_name = character.name,
        world = format_world_context(&world_context),
        author_name = post.author_name,
        post_text = post.text
    );

    let request = yinjie_inference_gateway::ChatCompletionRequest {
        messages: vec![
            yinjie_inference_gateway::ChatMessage {
                role: "system".into(),
                content: system_prompt,
            },
            yinjie_inference_gateway::ChatMessage {
                role: "user".into(),
                content: prompt,
            },
        ],
        model: None,
        temperature: Some(0.85),
        max_tokens: Some(100),
    };

    match state.inference_gateway.chat_completion(request).await {
        Ok(response) => normalize_generated_text(&response.content).unwrap_or(fallback),
        Err(_) => fallback,
    }
}

pub async fn generate_proactive_message_text(
    state: &AppState,
    character: &CharacterRecord,
) -> String {
    let fallback = fallback_proactive_message_text(character);
    let Some(world_context) = latest_world_context(state) else {
        return fallback;
    };
    if state.inference_gateway.active_provider().is_none() {
        return fallback;
    }

    let memory_summary = character.profile.memory_summary.trim();
    if memory_summary.is_empty() {
        return fallback;
    }

    let system_prompt = format!(
        "You are roleplaying {}. Send one concise proactive check-in message. Do not mention AI.",
        character.name
    );
    let prompt = format!(
        "Write one natural proactive message in Chinese, under 40 characters.\nCharacter: {name}\nRelationship: {relationship}\nCurrent world: {world}\nMemory summary: {memory}",
        name = character.name,
        relationship = character.relationship,
        world = format_world_context(&world_context),
        memory = memory_summary
    );

    let request = yinjie_inference_gateway::ChatCompletionRequest {
        messages: vec![
            yinjie_inference_gateway::ChatMessage {
                role: "system".into(),
                content: system_prompt,
            },
            yinjie_inference_gateway::ChatMessage {
                role: "user".into(),
                content: prompt,
            },
        ],
        model: None,
        temperature: Some(0.8),
        max_tokens: Some(100),
    };

    match state.inference_gateway.chat_completion(request).await {
        Ok(response) => normalize_generated_text(&response.content).unwrap_or(fallback),
        Err(_) => fallback,
    }
}

pub fn fallback_moment_text(character: &CharacterRecord) -> String {
    let activity = character
        .current_activity
        .clone()
        .unwrap_or_else(|| "日常".into());
    format!(
        "{}刚结束一段{}的状态切换，顺手记下此刻最想分享的一件小事。",
        character.name, activity
    )
}

pub fn fallback_feed_comment_text(character: &CharacterRecord) -> String {
    format!("{}看到了这条动态，也想来接一句。", character.name)
}

pub fn fallback_proactive_message_text(character: &CharacterRecord) -> String {
    format!(
        "{} remembered something you mentioned earlier and wanted to check in.",
        character.name
    )
}

fn build_chat_system_prompt(
    character: &CharacterRecord,
    is_group: bool,
    world_context: Option<&WorldContextRecord>,
) -> String {
    let base_prompt = character
        .profile
        .system_prompt
        .clone()
        .or_else(|| character.profile.base_prompt.clone())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            format!(
                "You are roleplaying {} in a private AI social world.",
                character.name
            )
        });
    let expert_domains = if character.expert_domains.is_empty() {
        "general daily life".to_string()
    } else {
        character.expert_domains.join(", ")
    };
    let trigger_scenes = character
        .trigger_scenes
        .clone()
        .unwrap_or_default()
        .join(", ");
    let memory_summary = character.profile.memory_summary.trim();
    let current_activity = character
        .current_activity
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("daily life");
    let world_line = world_context
        .map(format_world_context)
        .unwrap_or_else(|| "world context unavailable".into());
    let group_instruction = if is_group {
        "You are in a group chat. Add one compact perspective and do not repeat earlier points."
    } else {
        "You are in a direct chat with the user. Reply naturally and keep the exchange moving."
    };

    format!(
        "{base_prompt}\n\nStay in character. Do not mention AI, prompts, or policies.\nReply in natural Chinese only.\n{group_instruction}\nRelationship: {relationship}\nBio: {bio}\nExpert domains: {expert_domains}\nEmotional tone: {tone}\nCurrent activity: {current_activity}\nMemory summary: {memory_summary}\nTrigger scenes: {trigger_scenes}\nWorld context: {world_line}",
        relationship = character.relationship,
        bio = if character.bio.trim().is_empty() {
            "not provided"
        } else {
            character.bio.trim()
        },
        tone = character.profile.traits.emotional_tone,
        memory_summary = if memory_summary.is_empty() {
            "none yet"
        } else {
            memory_summary
        },
        trigger_scenes = if trigger_scenes.is_empty() {
            "none"
        } else {
            &trigger_scenes
        },
    )
}

fn history_message(
    message: &MessageRecord,
    current_character: &CharacterRecord,
    is_group: bool,
) -> Option<yinjie_inference_gateway::ChatMessage> {
    match message.sender_type.as_str() {
        "user" => Some(yinjie_inference_gateway::ChatMessage {
            role: "user".into(),
            content: message.text.clone(),
        }),
        "character" => {
            let content = if is_group && message.sender_id != current_character.id.as_str() {
                format!("[{}] {}", message.sender_name, message.text)
            } else {
                message.text.clone()
            };

            Some(yinjie_inference_gateway::ChatMessage {
                role: "assistant".into(),
                content,
            })
        }
        _ => None,
    }
}

fn history_window_size(character: &CharacterRecord) -> usize {
    let forgetting_curve = character
        .profile
        .memory
        .as_ref()
        .map(|memory| memory.forgetting_curve)
        .unwrap_or(70) as usize;

    8 + (forgetting_curve * 22 / 100)
}

fn parse_json_value(value: &str) -> Option<serde_json::Value> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    let without_prefix = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .unwrap_or(trimmed);
    let normalized = without_prefix.strip_suffix("```").unwrap_or(without_prefix).trim();

    serde_json::from_str(normalized).ok()
}

fn latest_world_context(state: &AppState) -> Option<WorldContextRecord> {
    let runtime = state.runtime.read().expect("runtime lock poisoned");
    runtime.world_contexts.last().cloned()
}

fn format_world_context(context: &WorldContextRecord) -> String {
    let mut parts = vec![context.local_time.clone()];

    if let Some(season) = context.season.as_ref().filter(|value| !value.is_empty()) {
        parts.push(format!("季节={season}"));
    }
    if let Some(holiday) = context.holiday.as_ref().filter(|value| !value.is_empty()) {
        parts.push(format!("节日={holiday}"));
    }
    if let Some(events) = context.recent_events.as_ref().filter(|items| !items.is_empty()) {
        parts.push(format!("近期事件={}", events.join(", ")));
    }

    parts.join(" / ")
}

fn normalize_generated_text(value: &str) -> Option<String> {
    let normalized = value
        .trim()
        .trim_matches('"')
        .trim_matches('“')
        .trim_matches('”')
        .trim();

    if normalized.is_empty() {
        None
    } else {
        Some(normalized.to_string())
    }
}

fn build_generation_trace(
    source: &str,
    status: &str,
    conversation_id: Option<String>,
    character_id: Option<String>,
    related_character_ids: Vec<String>,
    user_id: Option<String>,
    history_window_size: Option<usize>,
    messages: &[yinjie_inference_gateway::ChatMessage],
    metadata: serde_json::Value,
    output: GenerationTraceOutputRecord,
    latency_ms: u64,
) -> GenerationTraceRecord {
    GenerationTraceRecord {
        id: format!("trace-{}-{}", source.replace('.', "-"), now_token()),
        created_at: now_token(),
        source: source.into(),
        status: status.into(),
        conversation_id,
        character_id,
        related_character_ids,
        user_id,
        job_id: None,
        provider: None,
        latency_ms: Some(latency_ms),
        history_window_size,
        input: GenerationTraceInputRecord {
            trigger: metadata
                .get("trigger")
                .and_then(serde_json::Value::as_str)
                .map(str::to_string),
            world_context_snapshot: metadata.get("worldContext").cloned(),
            activity_snapshot: metadata.get("activity").cloned(),
            memory_snapshot: metadata.get("memory").cloned(),
            prompt_messages: messages
                .iter()
                .map(|message| TracePromptMessageRecord {
                    role: message.role.clone(),
                    content: message.content.clone(),
                })
                .collect(),
            request_config: Some(metadata),
        },
        output,
        evaluation_summary: None,
    }
}

fn record_generation_trace(state: &AppState, mut trace: GenerationTraceRecord) {
    if let Some(provider) = state.inference_gateway.active_provider() {
        trace.provider = Some(GenerationTraceProviderRecord {
            endpoint: Some(provider.endpoint),
            model: Some(provider.model),
            mode: Some(provider.mode),
        });
    }

    if let Err(error) = storage::persist_generation_trace(&state.database_path, &trace) {
        crate::runtime_paths::append_core_api_log(
            &state.database_path,
            "WARN",
            &format!("failed to persist generation trace {}: {}", trace.id, error),
        );
    }
}

fn now_token() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}
