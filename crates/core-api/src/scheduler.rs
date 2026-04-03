use std::{
    future::Future,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use tokio::{spawn, time::interval};
use tracing::{info, warn};

use crate::{
    app_state::{AppState, RealtimeCommand, SchedulerJobRuntimeState},
    generation,
    models::{FeedCommentRecord, FriendRequestRecord, MessageRecord, MomentPostRecord},
    runtime_paths,
    seed::{build_world_context_snapshot, SCHEDULER_COLD_START_ENABLED},
};

const JOB_UPDATE_WORLD_CONTEXT: &str = "update-world-context";
const JOB_EXPIRE_FRIEND_REQUESTS: &str = "expire-friend-requests";
const JOB_UPDATE_AI_ACTIVE_STATUS: &str = "update-ai-active-status";
const JOB_CHECK_MOMENT_SCHEDULE: &str = "check-moment-schedule";
const JOB_TRIGGER_SCENE_FRIEND_REQUESTS: &str = "trigger-scene-friend-requests";
const JOB_PROCESS_PENDING_FEED_REACTIONS: &str = "process-pending-feed-reactions";
const JOB_UPDATE_CHARACTER_STATUS: &str = "update-character-status";
const JOB_TRIGGER_MEMORY_PROACTIVE_MESSAGES: &str = "trigger-memory-proactive-messages";

pub fn install(state: AppState) {
    {
        let mut scheduler = state.scheduler.write().expect("scheduler lock poisoned");
        scheduler.mode = "parity".into();
        scheduler.started_at = Some(now_token());
    }
    state.request_persist("scheduler-install");

    spawn_recurring_job(
        state.clone(),
        JOB_UPDATE_WORLD_CONTEXT,
        Duration::from_secs(30 * 60),
        SCHEDULER_COLD_START_ENABLED,
        update_world_context_job,
    );
    spawn_recurring_job(
        state.clone(),
        JOB_EXPIRE_FRIEND_REQUESTS,
        Duration::from_secs(60 * 60),
        false,
        expire_friend_requests_job,
    );
    spawn_recurring_job(
        state.clone(),
        JOB_UPDATE_AI_ACTIVE_STATUS,
        Duration::from_secs(10 * 60),
        SCHEDULER_COLD_START_ENABLED,
        update_ai_active_status_job,
    );
    spawn_recurring_job(
        state.clone(),
        JOB_CHECK_MOMENT_SCHEDULE,
        Duration::from_secs(15 * 60),
        false,
        check_moment_schedule_job,
    );
    spawn_recurring_job(
        state.clone(),
        JOB_TRIGGER_SCENE_FRIEND_REQUESTS,
        Duration::from_secs(4 * 60 * 60),
        false,
        trigger_scene_friend_requests_job,
    );
    spawn_recurring_job(
        state.clone(),
        JOB_PROCESS_PENDING_FEED_REACTIONS,
        Duration::from_secs(5 * 60),
        false,
        process_pending_feed_reactions_job,
    );
    spawn_recurring_job(
        state.clone(),
        JOB_UPDATE_CHARACTER_STATUS,
        Duration::from_secs(2 * 60 * 60),
        SCHEDULER_COLD_START_ENABLED,
        update_character_status_job,
    );
    spawn_recurring_job(
        state,
        JOB_TRIGGER_MEMORY_PROACTIVE_MESSAGES,
        Duration::from_secs(24 * 60 * 60),
        false,
        trigger_memory_proactive_messages_job,
    );
}

pub async fn run_job_now(state: AppState, job_id: &str) -> Result<String, String> {
    match job_id {
        JOB_UPDATE_WORLD_CONTEXT => {
            execute_job(state, JOB_UPDATE_WORLD_CONTEXT, update_world_context_job).await
        }
        JOB_EXPIRE_FRIEND_REQUESTS => {
            execute_job(
                state,
                JOB_EXPIRE_FRIEND_REQUESTS,
                expire_friend_requests_job,
            )
            .await
        }
        JOB_UPDATE_AI_ACTIVE_STATUS => {
            execute_job(
                state,
                JOB_UPDATE_AI_ACTIVE_STATUS,
                update_ai_active_status_job,
            )
            .await
        }
        JOB_CHECK_MOMENT_SCHEDULE => {
            execute_job(state, JOB_CHECK_MOMENT_SCHEDULE, check_moment_schedule_job).await
        }
        JOB_TRIGGER_SCENE_FRIEND_REQUESTS => {
            execute_job(
                state,
                JOB_TRIGGER_SCENE_FRIEND_REQUESTS,
                trigger_scene_friend_requests_job,
            )
            .await
        }
        JOB_PROCESS_PENDING_FEED_REACTIONS => {
            execute_job(
                state,
                JOB_PROCESS_PENDING_FEED_REACTIONS,
                process_pending_feed_reactions_job,
            )
            .await
        }
        JOB_UPDATE_CHARACTER_STATUS => {
            execute_job(
                state,
                JOB_UPDATE_CHARACTER_STATUS,
                update_character_status_job,
            )
            .await
        }
        JOB_TRIGGER_MEMORY_PROACTIVE_MESSAGES => {
            execute_job(
                state,
                JOB_TRIGGER_MEMORY_PROACTIVE_MESSAGES,
                trigger_memory_proactive_messages_job,
            )
            .await
        }
        _ => Err(format!("Unknown scheduler job: {job_id}")),
    }
}

fn spawn_recurring_job<F, Fut>(
    state: AppState,
    job_id: &'static str,
    cadence: Duration,
    run_on_start: bool,
    job: F,
) where
    F: Fn(AppState) -> Fut + Send + Sync + Copy + 'static,
    Fut: Future<Output = Result<String, String>> + Send + 'static,
{
    spawn(async move {
        if run_on_start {
            let _ = execute_job(state.clone(), job_id, job).await;
        }

        let mut ticker = interval(cadence);
        ticker.tick().await;

        loop {
            ticker.tick().await;
            let _ = execute_job(state.clone(), job_id, job).await;
        }
    });
}

async fn execute_job<F, Fut>(
    state: AppState,
    job_id: &'static str,
    job: F,
) -> Result<String, String>
where
    F: Fn(AppState) -> Fut + Send + Sync + Copy + 'static,
    Fut: Future<Output = Result<String, String>> + Send + 'static,
{
    {
        let mut scheduler = state.scheduler.write().expect("scheduler lock poisoned");
        let job_state = scheduler.jobs.entry(job_id.into()).or_default();

        if job_state.running {
            return Err(format!("Job {job_id} is already running"));
        }

        job_state.running = true;
    }

    let started_at = now_token();
    let timer = Instant::now();
    let result = job(state.clone()).await;
    let duration_ms = timer.elapsed().as_millis() as u64;
    let last_result = result
        .clone()
        .unwrap_or_else(|message| format!("error: {message}"));

    {
        let mut scheduler = state.scheduler.write().expect("scheduler lock poisoned");

        {
            let job_state = scheduler
                .jobs
                .entry(job_id.into())
                .or_insert_with(SchedulerJobRuntimeState::default);
            job_state.running = false;
            job_state.run_count += 1;
            job_state.last_run_at = Some(started_at.clone());
            job_state.last_duration_ms = Some(duration_ms);
            job_state.last_result = Some(last_result.clone());
        }

        scheduler
            .recent_runs
            .push(format!("{}:{}:{}", started_at, job_id, last_result));

        if scheduler.recent_runs.len() > 20 {
            let overflow = scheduler.recent_runs.len() - 20;
            scheduler.recent_runs.drain(0..overflow);
        }
    }

    match &result {
        Ok(message) => info!("scheduler job {} completed: {}", job_id, message),
        Err(message) => warn!("scheduler job {} failed: {}", job_id, message),
    }
    runtime_paths::append_core_api_log(
        &state.database_path,
        if result.is_ok() { "INFO" } else { "WARN" },
        &format!("scheduler job {} => {}", job_id, last_result),
    );
    state.request_persist(format!("scheduler-job:{job_id}"));

    result
}

async fn update_world_context_job(state: AppState) -> Result<String, String> {
    let (online_count, moment_posts, pending_requests) = {
        let runtime = state.runtime.read().expect("runtime lock poisoned");
        (
            runtime
                .characters
                .values()
                .filter(|character| character.is_online)
                .count(),
            runtime.moment_posts.len(),
            runtime
                .friend_requests
                .values()
                .filter(|request| request.status == "pending")
                .count(),
        )
    };

    let snapshot = build_world_context_snapshot(vec![
        "scheduler-world-update".into(),
        format!("online-count:{online_count}"),
        format!("moment-posts:{moment_posts}"),
        format!("pending-friend-requests:{pending_requests}"),
    ]);
    let snapshot_id = snapshot.id.clone();

    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    runtime.world_contexts.push(snapshot);

    if runtime.world_contexts.len() > 96 {
        let overflow = runtime.world_contexts.len() - 96;
        runtime.world_contexts.drain(0..overflow);
    }

    Ok(format!("world snapshot stored: {snapshot_id}"))
}

async fn expire_friend_requests_job(state: AppState) -> Result<String, String> {
    let now = current_millis();
    let mut expired = 0_usize;
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");

    for request in runtime.friend_requests.values_mut() {
        if request.status == "pending"
            && request
                .expires_at
                .as_ref()
                .map(|value| parse_timestamp(value) < now)
                .unwrap_or(false)
        {
            request.status = "expired".into();
            expired += 1;
        }
    }

    Ok(format!("expired {expired} friend requests"))
}

async fn update_ai_active_status_job(state: AppState) -> Result<String, String> {
    let hour = current_hour();
    let timestamp = now_token();
    let mut changed = 0_usize;
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");

    for character in runtime.characters.values_mut() {
        let start = character.active_hours_start.unwrap_or(8);
        let end = character.active_hours_end.unwrap_or(23);
        let should_be_online = hour >= start && hour <= end;

        if character.is_online != should_be_online {
            character.is_online = should_be_online;
            changed += 1;
        }

        if should_be_online {
            character.last_active_at = Some(timestamp.clone());
        }
    }

    Ok(format!("updated online flags for {changed} characters"))
}

async fn update_character_status_job(state: AppState) -> Result<String, String> {
    let hour = current_hour();
    let timestamp = now_token();
    let mut changed = 0_usize;
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    let base_activity = base_activity_for_hour(hour);
    let variants = [
        "working",
        "eating",
        "resting",
        "commuting",
        "free",
        "sleeping",
    ];

    for character in runtime.characters.values_mut() {
        let activity = if !character.is_online {
            "sleeping".to_string()
        } else if pseudo_percent(&format!("{}:{timestamp}", character.id)) < 80 {
            base_activity.to_string()
        } else {
            variants[pseudo_percent(&character.name).rem_euclid(variants.len() as u64) as usize]
                .to_string()
        };

        if character.current_activity.as_deref() != Some(activity.as_str()) {
            character.current_activity = Some(activity.clone());
            character.current_status = Some(activity);
            changed += 1;
        }
    }

    Ok(format!("updated activities for {changed} characters"))
}

async fn check_moment_schedule_job(state: AppState) -> Result<String, String> {
    let now = current_millis();
    let day_start = start_of_day_millis(now);
    let hour = current_hour();
    let candidates = {
        let runtime = state.runtime.read().expect("runtime lock poisoned");
        runtime
            .characters
            .values()
            .filter(|character| {
                if character.moments_frequency < 1 || !character.is_online {
                    return false;
                }

                let start = character.active_hours_start.unwrap_or(8);
                let end = character.active_hours_end.unwrap_or(22);
                if hour < start || hour > end {
                    return false;
                }

                let today_count = runtime
                    .moment_posts
                    .values()
                    .filter(|post| {
                        post.author_id == character.id
                            && parse_timestamp(&post.posted_at) >= day_start
                    })
                    .count();

                if today_count >= character.moments_frequency as usize {
                    return false;
                }

                pseudo_percent(&format!("{}:{}:moments", character.id, now)) < 15
            })
            .cloned()
            .collect::<Vec<_>>()
    };
    let mut generated_posts = Vec::with_capacity(candidates.len());

    for character in candidates {
        let post_id = format!("moment_auto_{}_{}", character.id, now_token());
        let text = generation::generate_moment_text(&state, &character).await;
        generated_posts.push(MomentPostRecord {
            id: post_id.clone(),
            author_id: character.id.clone(),
            author_name: character.name.clone(),
            author_avatar: character.avatar.clone(),
            author_type: "character".into(),
            text,
            location: character
                .trigger_scenes
                .clone()
                .and_then(|scenes| scenes.first().cloned()),
            posted_at: now_token(),
            like_count: 0,
            comment_count: 0,
        });
    }

    let created = generated_posts.len();
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");

    for post in generated_posts {
        runtime.moment_posts.insert(post.id.clone(), post.clone());
        runtime.moment_comments.entry(post.id.clone()).or_default();
        runtime.moment_likes.entry(post.id).or_default();
    }

    Ok(format!("created {created} scheduled moments"))
}

async fn trigger_scene_friend_requests_job(state: AppState) -> Result<String, String> {
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    let user_ids = runtime.users.keys().cloned().collect::<Vec<_>>();

    if user_ids.is_empty() {
        return Ok("no registered users available for scene triggers".into());
    }

    if pseudo_percent(&format!("scene:{}:{}", now_token(), user_ids.len())) >= 40 {
        return Ok("scene trigger skipped by probability gate".into());
    }

    let scenes = [
        "coffee_shop",
        "gym",
        "library",
        "bookstore",
        "park",
        "restaurant",
        "cafe",
    ];
    let scene = scenes[pseudo_percent(&now_token()).rem_euclid(scenes.len() as u64) as usize];
    let mut created = 0_usize;

    for user_id in user_ids.into_iter().take(2) {
        let existing_friend_ids = runtime
            .friendships
            .values()
            .filter(|friendship| friendship.user_id == user_id)
            .map(|friendship| friendship.character_id.clone())
            .collect::<Vec<_>>();
        let pending_ids = runtime
            .friend_requests
            .values()
            .filter(|request| request.user_id == user_id && request.status == "pending")
            .map(|request| request.character_id.clone())
            .collect::<Vec<_>>();

        let Some(character) = runtime
            .characters
            .values()
            .find(|character| {
                character
                    .trigger_scenes
                    .as_ref()
                    .map(|items| items.iter().any(|item| item == scene))
                    .unwrap_or(false)
                    && !existing_friend_ids.contains(&character.id)
                    && !pending_ids.contains(&character.id)
            })
            .cloned()
        else {
            continue;
        };

        let request_id = format!("friend_request_{}", now_token());
        runtime.friend_requests.insert(
            request_id.clone(),
            FriendRequestRecord {
                id: request_id,
                user_id: user_id.clone(),
                character_id: character.id.clone(),
                character_name: character.name.clone(),
                character_avatar: character.avatar.clone(),
                trigger_scene: Some(scene.into()),
                greeting: Some(format!(
                    "Hi, I'm {}. We just crossed paths in {} and I wanted to say hello.",
                    character.name, scene
                )),
                status: "pending".into(),
                created_at: now_token(),
                expires_at: Some(tomorrow_end_millis_token()),
            },
        );
        created += 1;
    }

    Ok(format!("created {created} scene-based friend requests"))
}

async fn process_pending_feed_reactions_job(state: AppState) -> Result<String, String> {
    let now = current_millis();
    let since = now.saturating_sub(30 * 60 * 1000);
    let pending_posts = {
        let runtime = state.runtime.read().expect("runtime lock poisoned");
        runtime
            .feed_posts
            .values()
            .filter(|post| {
                !post.ai_reacted
                    && post.author_type == "user"
                    && parse_timestamp(&post.created_at) >= since
            })
            .cloned()
            .collect::<Vec<_>>()
    };
    let mut comment_plans = Vec::with_capacity(pending_posts.len());

    {
        let runtime = state.runtime.read().expect("runtime lock poisoned");
        for post in pending_posts {
            let selected = runtime
                .characters
                .values()
                .filter(|character| character.id != post.author_id)
                .take(2)
                .cloned()
                .collect::<Vec<_>>();
            comment_plans.push((post, selected));
        }
    }

    let mut generated = Vec::with_capacity(comment_plans.len());

    for (post, characters) in comment_plans {
        let mut comments = Vec::with_capacity(characters.len());
        for character in characters {
            let text = generation::generate_feed_comment_text(&state, &character, &post).await;
            comments.push(FeedCommentRecord {
                id: format!("feed_comment_auto_{}_{}", character.id, now_token()),
                post_id: post.id.clone(),
                author_id: character.id.clone(),
                author_name: character.name.clone(),
                author_avatar: character.avatar.clone(),
                author_type: "character".into(),
                text,
                created_at: now_token(),
            });
        }
        generated.push((post.id, comments));
    }

    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    let mut reacted = 0_usize;

    for (post_id, comments) in generated {
        let added = comments.len();
        if added > 0 {
            runtime
                .feed_comments
                .entry(post_id.clone())
                .or_default()
                .extend(comments);
        }

        if let Some(post) = runtime.feed_posts.get_mut(&post_id) {
            post.comment_count += added;
            post.ai_reacted = true;
        }
        reacted += 1;
    }

    Ok(format!("processed {reacted} pending feed posts"))
}

async fn trigger_memory_proactive_messages_job(state: AppState) -> Result<String, String> {
    let mut runtime = state.runtime.write().expect("runtime lock poisoned");
    let conversations = runtime.conversations.values().cloned().collect::<Vec<_>>();
    let mut sent = 0_usize;
    let today_start = start_of_day_millis(current_millis());
    let mut outbound_messages = Vec::new();

    for conversation in conversations {
        if conversation.r#type != "direct" {
            continue;
        }

        let Some(character_id) = conversation.participants.first().cloned() else {
            continue;
        };

        let Some(character) = runtime.characters.get(&character_id).cloned() else {
            continue;
        };

        if character.profile.memory_summary.trim().is_empty() {
            continue;
        }

        let already_sent_today = runtime
            .messages
            .get(&conversation.id)
            .map(|messages| {
                messages.iter().rev().any(|message| {
                    message.sender_type == "character"
                        && message.id.contains("proactive")
                        && parse_timestamp(&message.created_at) >= today_start
                })
            })
            .unwrap_or(false);

        if already_sent_today {
            continue;
        }

        let proactive_message = MessageRecord {
            id: format!("msg_{}_proactive_{}", now_token(), character.id),
            conversation_id: conversation.id.clone(),
            sender_type: "character".into(),
            sender_id: character.id.clone(),
            sender_name: character.name.clone(),
            r#type: "text".into(),
            text: format!(
                "{} remembered something you mentioned earlier and wanted to check in.",
                character.name
            ),
            created_at: now_token(),
        };

        runtime
            .messages
            .entry(conversation.id.clone())
            .or_default()
            .push(proactive_message.clone());
        outbound_messages.push((conversation.id.clone(), proactive_message));
        sent += 1;
    }

    drop(runtime);

    for (conversation_id, message) in outbound_messages {
        let _ = state
            .realtime_events
            .send(RealtimeCommand::EmitConversationMessage {
                conversation_id,
                message,
                source: "scheduler-proactive-message".into(),
            });
    }

    Ok(format!("sent {sent} proactive messages"))
}

fn base_activity_for_hour(hour: i32) -> &'static str {
    match hour {
        0..=6 => "sleeping",
        7 | 8 | 18 | 19 => "commuting",
        9..=11 | 14..=17 => "working",
        12 | 13 | 20 => "eating",
        _ => "free",
    }
}

fn current_hour() -> i32 {
    ((current_millis() / 1000 / 3600) % 24) as i32
}

fn current_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn start_of_day_millis(value: u128) -> u128 {
    let day_ms = 24_u128 * 60 * 60 * 1000;
    value - (value % day_ms)
}

fn tomorrow_end_millis_token() -> String {
    let day_ms = 24_u128 * 60 * 60 * 1000;
    let tomorrow_start = start_of_day_millis(current_millis()).saturating_add(day_ms);
    (tomorrow_start + day_ms - 1).to_string()
}

fn pseudo_percent(seed: &str) -> u64 {
    hash_str(seed) % 100
}

fn hash_str(value: &str) -> u64 {
    value.bytes().fold(0_u64, |acc, byte| {
        acc.wrapping_mul(16777619).wrapping_add(byte as u64)
    })
}

fn parse_timestamp(value: &str) -> u128 {
    value.parse::<u128>().unwrap_or_default()
}

fn now_token() -> String {
    current_millis().to_string()
}
