use crate::{
    app_state::AppState,
    models::{CharacterRecord, FeedPostRecord, WorldContextRecord},
};

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
