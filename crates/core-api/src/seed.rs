use std::time::{SystemTime, UNIX_EPOCH};

use crate::models::{
  CharacterRecord, PersonalityProfile, PersonalityTraits, SchedulerJobRecord, WorldContextRecord,
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

pub const LEGACY_MIGRATED_MODULES: &[&str] = &["config", "auth", "characters", "world"];

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
    ),
  ]
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
    trigger_scenes: None,
    intimacy_level: 0,
    last_active_at: None,
    ai_relationships: None,
    current_status: None,
    current_activity: None,
  }
}

pub fn seeded_world_context() -> WorldContextRecord {
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
    recent_events: Some(vec![
      "world-context-bootstrap".into(),
      "scheduler-parity-planning".into(),
    ]),
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
