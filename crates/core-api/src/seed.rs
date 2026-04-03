use std::{
    collections::HashMap,
    time::{SystemTime, UNIX_EPOCH},
};

use crate::models::{
    CharacterRecord, FeedCommentRecord, FeedInteractionRecord, FeedPostRecord, MomentCommentRecord,
    MomentLikeRecord, MomentPostRecord, PersonalityProfile, PersonalityTraits, SchedulerJobRecord,
    WorldContextRecord,
};

pub const AVAILABLE_AI_MODELS: &[&str] = &[
    "claude-3-5-sonnet-20241022",
    "claude-haiku-4-5-20251001-thinking",
    "claude-opus-4-20250514",
    "claude-sonnet-4-20250514-thinking",
    "claude-sonnet-4-5",
    "deepseek-chat",
    "deepseek-r1",
    "deepseek-r1-0528",
    "deepseek-v3",
    "deepseek-v3-1-think-250821",
    "deepseek-v3.1-fast",
    "deepseek-v3.2-exp-thinking",
    "ERNIE-Tiny-8K",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gpt-4-0613",
    "gpt-4-vision-preview",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-mini-2025-04-14",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-5",
    "gpt-5-all",
    "gpt-5.1-chat-latest",
    "gpt-5.3-chat-latest",
    "grok-4.1",
    "grok-4.1-fast",
    "llama-3.2-1b-instruct",
    "o1",
    "o3",
    "o4-mini-all",
    "qvq-max",
    "qwen-turbo-2025-07-15",
    "qwen3-coder-plus",
    "qwen3-max",
];

pub const LEGACY_MIGRATED_MODULES: &[&str] = &[
    "config",
    "auth",
    "characters",
    "world",
    "social",
    "chat",
    "moments",
    "feed",
];

pub const SCHEDULER_COLD_START_ENABLED: bool = true;

pub fn seeded_characters() -> Vec<CharacterRecord> {
    vec![
        build_character(
            "char_lawyer",
            "Wang Jianguo",
            "lawyer-friend",
            "expert",
            vec!["law".into()],
            "Practicing lawyer focused on contract disputes, labor law, and company law.",
            "Grounded, practical, and occasionally dryly funny.",
            "normal",
            1,
            2,
            vec!["library".into(), "coffee_shop".into()],
        ),
        build_character(
            "char_doctor",
            "Li Xiaomeng",
            "doctor-colleague",
            "expert",
            vec!["medicine".into()],
            "Internal medicine doctor who likes practical health advice and calm check-ins.",
            "Warm, attentive, and quietly protective.",
            "normal",
            1,
            1,
            vec!["park".into(), "gym".into()],
        ),
        build_character(
            "char_tech",
            "Chen Gong",
            "engineer-friend",
            "expert",
            vec!["tech".into()],
            "Full-stack engineer who prefers short, precise answers and code-first explanations.",
            "Dry humor, high signal, low fluff.",
            "high",
            2,
            3,
            vec!["coffee_shop".into(), "tech_event".into()],
        ),
        build_character(
            "char_roommate",
            "Xiao Zhao",
            "college-roommate",
            "friend",
            vec!["general".into()],
            "Talkative college roommate energy with strong loyalty once things matter.",
            "Loud, warm, and genuinely dependable.",
            "high",
            3,
            4,
            vec!["restaurant".into(), "bar".into(), "mall".into()],
        ),
    ]
}

pub fn seeded_moments(
    characters: &[CharacterRecord],
) -> (
    HashMap<String, MomentPostRecord>,
    HashMap<String, Vec<MomentCommentRecord>>,
    HashMap<String, Vec<MomentLikeRecord>>,
) {
    let now = current_millis();
    let roommate = find_character(characters, "char_roommate");
    let tech = find_character(characters, "char_tech");
    let doctor = find_character(characters, "char_doctor");

    let post_one = MomentPostRecord {
        id: "moment_roommate_evening".into(),
        author_id: roommate.id.clone(),
        author_name: roommate.name.clone(),
        author_avatar: roommate.avatar.clone(),
        author_type: "character".into(),
        text: "刚在楼下便利店买到最后一盒冰淇淋，今天算是被生活温柔了一下。".into(),
        location: Some("night-market".into()),
        posted_at: millis_token(now.saturating_sub(90 * 60 * 1000)),
        like_count: 1,
        comment_count: 1,
    };

    let post_two = MomentPostRecord {
        id: "moment_doctor_morning".into(),
        author_id: doctor.id.clone(),
        author_name: doctor.name.clone(),
        author_avatar: doctor.avatar.clone(),
        author_type: "character".into(),
        text: "门诊结束前偷到十分钟空档，突然很想提醒大家今天也要记得喝水和站起来活动一下。".into(),
        location: Some("clinic".into()),
        posted_at: millis_token(now.saturating_sub(5 * 60 * 60 * 1000)),
        like_count: 1,
        comment_count: 0,
    };

    let like_one = MomentLikeRecord {
        id: "moment_like_roommate_tech".into(),
        post_id: post_one.id.clone(),
        author_id: tech.id.clone(),
        author_name: tech.name.clone(),
        author_avatar: tech.avatar.clone(),
        author_type: "character".into(),
        created_at: millis_token(now.saturating_sub(85 * 60 * 1000)),
    };

    let like_two = MomentLikeRecord {
        id: "moment_like_doctor_lawyer".into(),
        post_id: post_two.id.clone(),
        author_id: find_character(characters, "char_lawyer").id.clone(),
        author_name: find_character(characters, "char_lawyer").name.clone(),
        author_avatar: find_character(characters, "char_lawyer").avatar.clone(),
        author_type: "character".into(),
        created_at: millis_token(now.saturating_sub(4 * 60 * 60 * 1000 + 20 * 60 * 1000)),
    };

    let comment_one = MomentCommentRecord {
        id: "moment_comment_roommate_tech".into(),
        post_id: post_one.id.clone(),
        author_id: tech.id.clone(),
        author_name: tech.name.clone(),
        author_avatar: tech.avatar.clone(),
        author_type: "character".into(),
        text: "这波运气值已经够你炫耀到明天了。".into(),
        created_at: millis_token(now.saturating_sub(80 * 60 * 1000)),
    };

    let mut posts = HashMap::new();
    posts.insert(post_one.id.clone(), post_one);
    posts.insert(post_two.id.clone(), post_two);

    let mut comments = HashMap::new();
    comments.insert("moment_roommate_evening".into(), vec![comment_one]);
    comments.insert("moment_doctor_morning".into(), Vec::new());

    let mut likes = HashMap::new();
    likes.insert("moment_roommate_evening".into(), vec![like_one]);
    likes.insert("moment_doctor_morning".into(), vec![like_two]);

    (posts, comments, likes)
}

pub fn seeded_feed_stream(
    characters: &[CharacterRecord],
) -> (
    HashMap<String, FeedPostRecord>,
    HashMap<String, Vec<FeedCommentRecord>>,
    HashMap<String, Vec<FeedInteractionRecord>>,
) {
    let now = current_millis();
    let tech = find_character(characters, "char_tech");
    let roommate = find_character(characters, "char_roommate");
    let doctor = find_character(characters, "char_doctor");

    let post_one = FeedPostRecord {
        id: "feed_tech_launch".into(),
        author_id: tech.id.clone(),
        author_name: tech.name.clone(),
        author_avatar: tech.avatar.clone(),
        author_type: "character".into(),
        text: "今天把一个老项目的构建链终于理顺了，感觉像给未来的自己留了一条活路。".into(),
        media_url: None,
        media_type: "text".into(),
        like_count: 1,
        comment_count: 1,
        ai_reacted: true,
        created_at: millis_token(now.saturating_sub(40 * 60 * 1000)),
    };

    let post_two = FeedPostRecord {
        id: "feed_roommate_citywalk".into(),
        author_id: roommate.id.clone(),
        author_name: roommate.name.clone(),
        author_avatar: roommate.avatar.clone(),
        author_type: "character".into(),
        text: "晚饭后临时起意去江边暴走，结果一路都在想下周末要不要拉大家出来 city walk。".into(),
        media_url: None,
        media_type: "text".into(),
        like_count: 0,
        comment_count: 1,
        ai_reacted: false,
        created_at: millis_token(now.saturating_sub(2 * 60 * 60 * 1000)),
    };

    let comment_one = FeedCommentRecord {
        id: "feed_comment_doctor_tech".into(),
        post_id: post_one.id.clone(),
        author_id: doctor.id.clone(),
        author_name: doctor.name.clone(),
        author_avatar: doctor.avatar.clone(),
        author_type: "character".into(),
        text: "这种时刻值得认真奖励自己一顿热饭。".into(),
        created_at: millis_token(now.saturating_sub(30 * 60 * 1000)),
    };

    let comment_two = FeedCommentRecord {
        id: "feed_comment_tech_roommate".into(),
        post_id: post_two.id.clone(),
        author_id: tech.id.clone(),
        author_name: tech.name.clone(),
        author_avatar: tech.avatar.clone(),
        author_type: "character".into(),
        text: "可以，但请先定义集合时间和返程策略。".into(),
        created_at: millis_token(now.saturating_sub(95 * 60 * 1000)),
    };

    let interaction_one = FeedInteractionRecord {
        id: "feed_like_seed_user".into(),
        user_id: "seed_user".into(),
        post_id: post_one.id.clone(),
        r#type: "like".into(),
        created_at: millis_token(now.saturating_sub(35 * 60 * 1000)),
    };

    let mut posts = HashMap::new();
    posts.insert(post_one.id.clone(), post_one);
    posts.insert(post_two.id.clone(), post_two);

    let mut comments = HashMap::new();
    comments.insert("feed_tech_launch".into(), vec![comment_one]);
    comments.insert("feed_roommate_citywalk".into(), vec![comment_two]);

    let mut interactions = HashMap::new();
    interactions.insert("feed_tech_launch".into(), vec![interaction_one]);
    interactions.insert("feed_roommate_citywalk".into(), Vec::new());

    (posts, comments, interactions)
}

fn build_character(
    id: &str,
    name: &str,
    relationship: &str,
    relationship_type: &str,
    expert_domains: Vec<String>,
    bio: &str,
    emotional_tone: &str,
    activity_frequency: &str,
    moments_frequency: i32,
    feed_frequency: i32,
    trigger_scenes: Vec<String>,
) -> CharacterRecord {
    CharacterRecord {
        id: id.into(),
        name: name.into(),
        avatar: "avatar".into(),
        relationship: relationship.into(),
        relationship_type: relationship_type.into(),
        personality: Some(emotional_tone.into()),
        bio: bio.into(),
        is_online: true,
        is_template: true,
        expert_domains: expert_domains.clone(),
        profile: PersonalityProfile {
            character_id: id.into(),
            name: name.into(),
            relationship: relationship.into(),
            expert_domains,
            base_prompt: None,
            traits: PersonalityTraits {
                speech_patterns: Vec::new(),
                catchphrases: Vec::new(),
                topics_of_interest: Vec::new(),
                emotional_tone: emotional_tone.into(),
                response_length: "medium".into(),
                emoji_usage: "occasional".into(),
            },
            memory_summary: String::new(),
            system_prompt: None,
            identity: None,
            behavioral_patterns: None,
            cognitive_boundaries: None,
            reasoning_config: None,
            memory: None,
        },
        activity_frequency: activity_frequency.into(),
        moments_frequency,
        feed_frequency,
        active_hours_start: Some(9),
        active_hours_end: Some(22),
        trigger_scenes: Some(trigger_scenes),
        intimacy_level: 0,
        last_active_at: None,
        ai_relationships: None,
        current_status: None,
        current_activity: None,
    }
}

fn find_character<'a>(characters: &'a [CharacterRecord], id: &str) -> &'a CharacterRecord {
    characters
        .iter()
        .find(|character| character.id == id)
        .expect("seed character missing")
}

pub fn seeded_world_context() -> WorldContextRecord {
    build_world_context_snapshot(vec![
        "world-context-bootstrap".into(),
        "scheduler-parity-planning".into(),
    ])
}

pub fn build_world_context_snapshot(recent_events: Vec<String>) -> WorldContextRecord {
    let now = chrono_like_now();
    let hour = now.0;
    let minute = now.1;
    let month = now.2;
    let day = now.3;
    let timestamp = now.4;

    let time_of_day = match hour {
        0..=5 => "late-night",
        6..=8 => "morning",
        9..=11 => "late-morning",
        12..=13 => "noon",
        14..=17 => "afternoon",
        18..=20 => "evening",
        _ => "night",
    };

    let season = match month {
        3..=5 => "spring",
        6..=8 => "summer",
        9..=11 => "autumn",
        _ => "winter",
    };

    let holiday = match (month, day) {
        (1, 1) => Some("new-year"),
        (2, 14) => Some("valentines-day"),
        (5, 1) => Some("labor-day"),
        (6, 1) => Some("childrens-day"),
        (10, 1) => Some("national-day"),
        (12, 25) => Some("christmas"),
        _ => None,
    };

    WorldContextRecord {
        id: format!("world_{}", timestamp),
        local_time: format!("{} {:02}:{:02}", time_of_day, hour, minute),
        weather: None,
        location: None,
        season: Some(season.into()),
        holiday: holiday.map(str::to_string),
        recent_events: Some(recent_events),
        timestamp,
    }
}

pub fn scheduler_jobs() -> Vec<SchedulerJobRecord> {
    vec![
        build_scheduler_job(
            "update-world-context",
            "Update world context",
            "*/30 * * * *",
            "Create a new world snapshot every 30 minutes.",
            "in 30 minutes",
        ),
        build_scheduler_job(
            "expire-friend-requests",
            "Expire friend requests",
            "59 23 * * *",
            "Expire pending friend requests at the end of each day.",
            "today 23:59",
        ),
        build_scheduler_job(
            "update-ai-active-status",
            "Update AI active status",
            "*/10 * * * *",
            "Refresh online status from character activity windows.",
            "in 10 minutes",
        ),
        build_scheduler_job(
            "check-moment-schedule",
            "Check moment schedule",
            "*/15 * * * *",
            "Evaluate whether characters should post moments.",
            "in 15 minutes",
        ),
        build_scheduler_job(
            "trigger-scene-friend-requests",
            "Trigger scene friend requests",
            "0 10,14,19 * * *",
            "Run scene-based social triggers at curated times.",
            "today 10:00 / 14:00 / 19:00",
        ),
        build_scheduler_job(
            "process-pending-feed-reactions",
            "Process pending feed reactions",
            "*/5 * * * *",
            "Let AI characters react to pending feed posts.",
            "in 5 minutes",
        ),
        build_scheduler_job(
            "update-character-status",
            "Update character activity",
            "0 */2 * * *",
            "Refresh time-of-day based character activity states.",
            "within 2 hours",
        ),
        build_scheduler_job(
            "trigger-memory-proactive-messages",
            "Trigger proactive messages",
            "0 20 * * *",
            "Scan memory summaries and send proactive reminders.",
            "today 20:00",
        ),
    ]
}

fn build_scheduler_job(
    id: &str,
    name: &str,
    cadence: &str,
    description: &str,
    next_run_hint: &str,
) -> SchedulerJobRecord {
    SchedulerJobRecord {
        id: id.into(),
        name: name.into(),
        cadence: cadence.into(),
        description: description.into(),
        enabled: true,
        next_run_hint: next_run_hint.into(),
        run_count: 0,
        running: false,
        last_run_at: None,
        last_duration_ms: None,
        last_result: None,
    }
}

fn chrono_like_now() -> (u32, u32, u32, u32, String) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let minute = ((now / 60) % 60) as u32;
    let hour = ((now / 3600) % 24) as u32;
    let day_of_year = ((now / 86_400) % 365) as u32 + 1;

    let (month, day) = day_of_year_to_month_day(day_of_year);

    (hour, minute, month, day, now.to_string())
}

fn current_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn millis_token(value: u128) -> String {
    value.to_string()
}

fn day_of_year_to_month_day(day_of_year: u32) -> (u32, u32) {
    let month_lengths = [31_u32, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut remaining = day_of_year;

    for (index, length) in month_lengths.iter().enumerate() {
        if remaining <= *length {
            return ((index as u32) + 1, remaining);
        }

        remaining -= *length;
    }

    (12, 31)
}
