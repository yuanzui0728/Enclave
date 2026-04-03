use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, RwLock},
};

use crate::{
    models::{
        AppConfigStore, CharacterRecord, ConversationRecord, FeedCommentRecord,
        FeedInteractionRecord, FeedPostRecord, FriendRequestRecord, FriendshipRecord,
        GroupMemberRecord, GroupMessageRecord, GroupRecord, MessageRecord, MomentCommentRecord,
        MomentLikeRecord, MomentPostRecord, UserRecord, WorldContextRecord,
    },
    seed::{seeded_characters, seeded_feed_stream, seeded_moments, seeded_world_context},
};

#[derive(Clone)]
pub struct AppState {
    pub port: u16,
    pub database_path: PathBuf,
    pub runtime: Arc<RwLock<RuntimeState>>,
    pub realtime: Arc<RwLock<RealtimeState>>,
    pub scheduler: Arc<RwLock<SchedulerState>>,
}

pub struct RuntimeState {
    pub users: HashMap<String, UserRecord>,
    pub characters: HashMap<String, CharacterRecord>,
    pub conversations: HashMap<String, ConversationRecord>,
    pub messages: HashMap<String, Vec<MessageRecord>>,
    pub groups: HashMap<String, GroupRecord>,
    pub group_members: HashMap<String, Vec<GroupMemberRecord>>,
    pub group_messages: HashMap<String, Vec<GroupMessageRecord>>,
    pub moment_posts: HashMap<String, MomentPostRecord>,
    pub moment_comments: HashMap<String, Vec<MomentCommentRecord>>,
    pub moment_likes: HashMap<String, Vec<MomentLikeRecord>>,
    pub feed_posts: HashMap<String, FeedPostRecord>,
    pub feed_comments: HashMap<String, Vec<FeedCommentRecord>>,
    pub feed_interactions: HashMap<String, Vec<FeedInteractionRecord>>,
    pub friend_requests: HashMap<String, FriendRequestRecord>,
    pub friendships: HashMap<String, FriendshipRecord>,
    pub world_contexts: Vec<WorldContextRecord>,
    pub config: AppConfigStore,
}

#[derive(Default)]
pub struct RealtimeState {
    pub connected_clients: usize,
    pub room_subscribers: HashMap<String, usize>,
    pub recent_events: Vec<String>,
    pub last_event_at: Option<String>,
    pub last_message_at: Option<String>,
}

#[derive(Default)]
pub struct SchedulerJobRuntimeState {
    pub run_count: usize,
    pub running: bool,
    pub last_run_at: Option<String>,
    pub last_duration_ms: Option<u64>,
    pub last_result: Option<String>,
}

#[derive(Default)]
pub struct SchedulerState {
    pub mode: String,
    pub started_at: Option<String>,
    pub recent_runs: Vec<String>,
    pub jobs: HashMap<String, SchedulerJobRuntimeState>,
}

impl AppState {
    pub fn new(port: u16, database_path: PathBuf) -> Self {
        Self {
            port,
            database_path,
            runtime: Arc::new(RwLock::new(RuntimeState::seeded())),
            realtime: Arc::new(RwLock::new(RealtimeState::default())),
            scheduler: Arc::new(RwLock::new(SchedulerState {
                mode: "scaffolded".into(),
                ..SchedulerState::default()
            })),
        }
    }
}

impl RuntimeState {
    fn seeded() -> Self {
        let seeded_characters = seeded_characters();
        let (moment_posts, moment_comments, moment_likes) = seeded_moments(&seeded_characters);
        let (feed_posts, feed_comments, feed_interactions) = seeded_feed_stream(&seeded_characters);

        let characters = seeded_characters
            .into_iter()
            .map(|character| (character.id.clone(), character))
            .collect();

        Self {
            users: HashMap::new(),
            characters,
            conversations: HashMap::new(),
            messages: HashMap::new(),
            groups: HashMap::new(),
            group_members: HashMap::new(),
            group_messages: HashMap::new(),
            moment_posts,
            moment_comments,
            moment_likes,
            feed_posts,
            feed_comments,
            feed_interactions,
            friend_requests: HashMap::new(),
            friendships: HashMap::new(),
            world_contexts: vec![seeded_world_context()],
            config: AppConfigStore::default(),
        }
    }
}
