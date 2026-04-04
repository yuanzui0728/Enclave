use crate::{
    app_state::AppState,
    models::{
        CharacterRecord, ConversationRecord, FeedPostRecord, MessageRecord, WorldContextRecord,
    },
};

pub async fn generate_chat_reply_text(
    state: &AppState,
    character: &CharacterRecord,
    conversation: &ConversationRecord,
    conversation_history: &[MessageRecord],
) -> Option<String> {
    if state.inference_gateway.active_provider().is_none() {
        return None;
    }

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
        return None;
    }

    let request = yinjie_inference_gateway::ChatCompletionRequest {
        messages,
        model: None,
        temperature: Some(if is_group { 0.8 } else { 0.85 }),
        max_tokens: Some(if is_group { 180 } else { 220 }),
    };

    match state.inference_gateway.chat_completion(request).await {
        Ok(response) => normalize_generated_text(&response.content),
        Err(_) => None,
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
