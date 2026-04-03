use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserRecord {
    pub id: String,
    pub username: String,
    pub password_hash: String,
    pub onboarding_completed: bool,
    pub avatar: Option<String>,
    pub signature: Option<String>,
    pub location_lat: Option<f64>,
    pub location_lng: Option<f64>,
    pub location_name: Option<String>,
    pub created_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthSession {
    pub token: String,
    pub user_id: String,
    pub username: String,
    pub onboarding_completed: bool,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterRequest {
    pub username: String,
    pub password: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitUserRequest {
    pub username: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateUserRequest {
    pub username: Option<String>,
    pub avatar: Option<String>,
    pub signature: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct SuccessResponse {
    pub success: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfigStore {
    pub ai_model: String,
}

impl Default for AppConfigStore {
    fn default() -> Self {
        Self {
            ai_model: "deepseek-chat".into(),
        }
    }
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAiModelRequest {
    pub model: String,
}

#[derive(Clone, Serialize)]
pub struct AiModelResponse {
    pub model: String,
}

#[derive(Clone, Serialize)]
pub struct AvailableModelsResponse {
    pub models: Vec<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderTestRequest {
    pub endpoint: String,
    pub model: String,
    pub api_key: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderTestResult {
    pub success: bool,
    pub message: String,
    pub normalized_endpoint: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonalityTraits {
    pub speech_patterns: Vec<String>,
    pub catchphrases: Vec<String>,
    pub topics_of_interest: Vec<String>,
    pub emotional_tone: String,
    pub response_length: String,
    pub emoji_usage: String,
}

impl Default for PersonalityTraits {
    fn default() -> Self {
        Self {
            speech_patterns: Vec::new(),
            catchphrases: Vec::new(),
            topics_of_interest: Vec::new(),
            emotional_tone: "grounded".into(),
            response_length: "medium".into(),
            emoji_usage: "occasional".into(),
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterIdentity {
    pub occupation: String,
    pub background: String,
    pub motivation: String,
    pub worldview: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BehavioralPatterns {
    pub work_style: String,
    pub social_style: String,
    pub taboos: Vec<String>,
    pub quirks: Vec<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CognitiveBoundaries {
    pub expertise_description: String,
    pub knowledge_limits: String,
    pub refusal_style: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReasoningConfig {
    pub enable_co_t: bool,
    pub enable_reflection: bool,
    pub enable_routing: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryLayers {
    pub core_memory: String,
    pub recent_summary: String,
    pub forgetting_curve: u8,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonalityProfile {
    pub character_id: String,
    pub name: String,
    pub relationship: String,
    pub expert_domains: Vec<String>,
    pub base_prompt: Option<String>,
    pub traits: PersonalityTraits,
    pub memory_summary: String,
    pub system_prompt: Option<String>,
    pub identity: Option<CharacterIdentity>,
    pub behavioral_patterns: Option<BehavioralPatterns>,
    pub cognitive_boundaries: Option<CognitiveBoundaries>,
    pub reasoning_config: Option<ReasoningConfig>,
    pub memory: Option<MemoryLayers>,
}

impl PersonalityProfile {
    pub fn bootstrap(
        character_id: &str,
        name: &str,
        relationship: &str,
        expert_domains: &[String],
    ) -> Self {
        Self {
            character_id: character_id.to_string(),
            name: name.to_string(),
            relationship: relationship.to_string(),
            expert_domains: expert_domains.to_vec(),
            base_prompt: None,
            traits: PersonalityTraits::default(),
            memory_summary: String::new(),
            system_prompt: None,
            identity: None,
            behavioral_patterns: None,
            cognitive_boundaries: None,
            reasoning_config: None,
            memory: None,
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterAiRelationship {
    pub character_id: String,
    pub relationship_type: String,
    pub strength: i32,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterRecord {
    pub id: String,
    pub name: String,
    pub avatar: String,
    pub relationship: String,
    pub relationship_type: String,
    pub personality: Option<String>,
    pub bio: String,
    pub is_online: bool,
    pub is_template: bool,
    pub expert_domains: Vec<String>,
    pub profile: PersonalityProfile,
    pub activity_frequency: String,
    pub moments_frequency: i32,
    pub feed_frequency: i32,
    pub active_hours_start: Option<i32>,
    pub active_hours_end: Option<i32>,
    pub trigger_scenes: Option<Vec<String>>,
    pub intimacy_level: i32,
    pub last_active_at: Option<String>,
    pub ai_relationships: Option<Vec<CharacterAiRelationship>>,
    pub current_status: Option<String>,
    pub current_activity: Option<String>,
}

impl CharacterRecord {
    pub fn from_patch(id: String, patch: CharacterPatch) -> Self {
        let name = patch.name.unwrap_or_else(|| "New Character".into());
        let avatar = patch.avatar.unwrap_or_else(|| "avatar".into());
        let relationship = patch.relationship.unwrap_or_else(|| "friend".into());
        let expert_domains = patch.expert_domains.unwrap_or_default();
        let profile = patch.profile.unwrap_or_else(|| {
            PersonalityProfile::bootstrap(&id, &name, &relationship, &expert_domains)
        });

        Self {
            id,
            name,
            avatar,
            relationship,
            relationship_type: patch.relationship_type.unwrap_or_else(|| "custom".into()),
            personality: patch.personality,
            bio: patch.bio.unwrap_or_default(),
            is_online: patch.is_online.unwrap_or(false),
            is_template: patch.is_template.unwrap_or(false),
            expert_domains,
            profile,
            activity_frequency: patch.activity_frequency.unwrap_or_else(|| "normal".into()),
            moments_frequency: patch.moments_frequency.unwrap_or(1),
            feed_frequency: patch.feed_frequency.unwrap_or(1),
            active_hours_start: patch.active_hours_start,
            active_hours_end: patch.active_hours_end,
            trigger_scenes: patch.trigger_scenes,
            intimacy_level: patch.intimacy_level.unwrap_or(0),
            last_active_at: patch.last_active_at,
            ai_relationships: patch.ai_relationships,
            current_status: patch.current_status,
            current_activity: patch.current_activity,
        }
    }

    pub fn apply_patch(&mut self, patch: CharacterPatch) {
        if let Some(name) = patch.name {
            self.name = name;
        }
        if let Some(avatar) = patch.avatar {
            self.avatar = avatar;
        }
        if let Some(relationship) = patch.relationship {
            self.relationship = relationship;
        }
        if let Some(relationship_type) = patch.relationship_type {
            self.relationship_type = relationship_type;
        }
        if let Some(personality) = patch.personality {
            self.personality = Some(personality);
        }
        if let Some(bio) = patch.bio {
            self.bio = bio;
        }
        if let Some(is_online) = patch.is_online {
            self.is_online = is_online;
        }
        if let Some(is_template) = patch.is_template {
            self.is_template = is_template;
        }
        if let Some(expert_domains) = patch.expert_domains {
            self.expert_domains = expert_domains;
        }
        if let Some(profile) = patch.profile {
            self.profile = profile;
        }
        if let Some(activity_frequency) = patch.activity_frequency {
            self.activity_frequency = activity_frequency;
        }
        if let Some(moments_frequency) = patch.moments_frequency {
            self.moments_frequency = moments_frequency;
        }
        if let Some(feed_frequency) = patch.feed_frequency {
            self.feed_frequency = feed_frequency;
        }
        if let Some(active_hours_start) = patch.active_hours_start {
            self.active_hours_start = Some(active_hours_start);
        }
        if let Some(active_hours_end) = patch.active_hours_end {
            self.active_hours_end = Some(active_hours_end);
        }
        if let Some(trigger_scenes) = patch.trigger_scenes {
            self.trigger_scenes = Some(trigger_scenes);
        }
        if let Some(intimacy_level) = patch.intimacy_level {
            self.intimacy_level = intimacy_level;
        }
        if let Some(last_active_at) = patch.last_active_at {
            self.last_active_at = Some(last_active_at);
        }
        if let Some(ai_relationships) = patch.ai_relationships {
            self.ai_relationships = Some(ai_relationships);
        }
        if let Some(current_status) = patch.current_status {
            self.current_status = Some(current_status);
        }
        if let Some(current_activity) = patch.current_activity {
            self.current_activity = Some(current_activity);
        }
    }
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterPatch {
    pub id: Option<String>,
    pub name: Option<String>,
    pub avatar: Option<String>,
    pub relationship: Option<String>,
    pub relationship_type: Option<String>,
    pub personality: Option<String>,
    pub bio: Option<String>,
    pub is_online: Option<bool>,
    pub is_template: Option<bool>,
    pub expert_domains: Option<Vec<String>>,
    pub profile: Option<PersonalityProfile>,
    pub activity_frequency: Option<String>,
    pub moments_frequency: Option<i32>,
    pub feed_frequency: Option<i32>,
    pub active_hours_start: Option<i32>,
    pub active_hours_end: Option<i32>,
    pub trigger_scenes: Option<Vec<String>>,
    pub intimacy_level: Option<i32>,
    pub last_active_at: Option<String>,
    pub ai_relationships: Option<Vec<CharacterAiRelationship>>,
    pub current_status: Option<String>,
    pub current_activity: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldContextRecord {
    pub id: String,
    pub local_time: String,
    pub weather: Option<String>,
    pub location: Option<String>,
    pub season: Option<String>,
    pub holiday: Option<String>,
    pub recent_events: Option<Vec<String>>,
    pub timestamp: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchedulerJobRecord {
    pub id: String,
    pub name: String,
    pub cadence: String,
    pub description: String,
    pub enabled: bool,
    pub next_run_hint: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchedulerStatusRecord {
    pub healthy: bool,
    pub mode: String,
    pub cold_start_enabled: bool,
    pub world_snapshots: usize,
    pub last_world_snapshot_at: Option<String>,
    pub jobs: Vec<SchedulerJobRecord>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FriendRequestRecord {
    pub id: String,
    pub user_id: String,
    pub character_id: String,
    pub character_name: String,
    pub character_avatar: String,
    pub trigger_scene: Option<String>,
    pub greeting: Option<String>,
    pub status: String,
    pub created_at: String,
    pub expires_at: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FriendshipRecord {
    pub id: String,
    pub user_id: String,
    pub character_id: String,
    pub intimacy_level: i32,
    pub status: String,
    pub created_at: String,
    pub last_interacted_at: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FriendListItemRecord {
    pub friendship: FriendshipRecord,
    pub character: CharacterRecord,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserScopedRequest {
    pub user_id: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendFriendRequestPayload {
    pub user_id: String,
    pub character_id: String,
    pub greeting: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TriggerScenePayload {
    pub user_id: String,
    pub scene: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShakePreviewCharacterRecord {
    pub id: String,
    pub name: String,
    pub avatar: String,
    pub relationship: String,
    pub expert_domains: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShakeResultRecord {
    pub character: ShakePreviewCharacterRecord,
    pub greeting: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageRecord {
    pub id: String,
    pub conversation_id: String,
    pub sender_type: String,
    pub sender_id: String,
    pub sender_name: String,
    pub r#type: String,
    pub text: String,
    pub created_at: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationRecord {
    pub id: String,
    pub user_id: String,
    pub r#type: String,
    pub title: String,
    pub participants: Vec<String>,
    pub messages: Vec<MessageRecord>,
    pub created_at: String,
    pub updated_at: String,
    pub last_read_at: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationListItemRecord {
    pub id: String,
    pub user_id: String,
    pub r#type: String,
    pub title: String,
    pub participants: Vec<String>,
    pub messages: Vec<MessageRecord>,
    pub created_at: String,
    pub updated_at: String,
    pub last_read_at: Option<String>,
    pub last_message: Option<MessageRecord>,
    pub unread_count: usize,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetOrCreateConversationPayload {
    pub user_id: String,
    pub character_id: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupRecord {
    pub id: String,
    pub name: String,
    pub avatar: Option<String>,
    pub creator_id: String,
    pub creator_type: String,
    pub created_at: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateGroupPayload {
    pub name: String,
    pub creator_id: String,
    pub creator_type: String,
    pub member_ids: Vec<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupMemberRecord {
    pub id: String,
    pub group_id: String,
    pub member_id: String,
    pub member_type: String,
    pub member_name: Option<String>,
    pub member_avatar: Option<String>,
    pub role: String,
    pub joined_at: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddGroupMemberPayload {
    pub member_id: String,
    pub member_type: String,
    pub member_name: String,
    pub member_avatar: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupMessageRecord {
    pub id: String,
    pub group_id: String,
    pub sender_id: String,
    pub sender_type: String,
    pub sender_name: String,
    pub sender_avatar: Option<String>,
    pub text: String,
    pub r#type: String,
    pub created_at: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendGroupMessagePayload {
    pub sender_id: String,
    pub sender_type: String,
    pub sender_name: String,
    pub sender_avatar: Option<String>,
    pub text: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MomentPostRecord {
    pub id: String,
    pub author_id: String,
    pub author_name: String,
    pub author_avatar: String,
    pub author_type: String,
    pub text: String,
    pub location: Option<String>,
    pub posted_at: String,
    pub like_count: usize,
    pub comment_count: usize,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MomentCommentRecord {
    pub id: String,
    pub post_id: String,
    pub author_id: String,
    pub author_name: String,
    pub author_avatar: String,
    pub author_type: String,
    pub text: String,
    pub created_at: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MomentLikeRecord {
    pub id: String,
    pub post_id: String,
    pub author_id: String,
    pub author_name: String,
    pub author_avatar: String,
    pub author_type: String,
    pub created_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MomentInteractionRecord {
    pub character_id: String,
    pub character_name: String,
    pub r#type: String,
    pub comment_text: Option<String>,
    pub created_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MomentRecord {
    pub id: String,
    pub author_id: String,
    pub author_name: String,
    pub author_avatar: String,
    pub author_type: String,
    pub text: String,
    pub location: Option<String>,
    pub posted_at: String,
    pub like_count: usize,
    pub comment_count: usize,
    pub likes: Vec<MomentLikeRecord>,
    pub comments: Vec<MomentCommentRecord>,
    pub interactions: Vec<MomentInteractionRecord>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUserMomentPayload {
    pub user_id: String,
    pub author_name: String,
    pub author_avatar: String,
    pub text: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMomentCommentPayload {
    pub author_id: String,
    pub author_name: String,
    pub author_avatar: String,
    pub text: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToggleMomentLikePayload {
    pub author_id: String,
    pub author_name: String,
    pub author_avatar: String,
}

#[derive(Clone, Serialize)]
pub struct ToggleMomentLikeResult {
    pub liked: bool,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MomentsQuery {
    pub author_id: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedPostRecord {
    pub id: String,
    pub author_id: String,
    pub author_name: String,
    pub author_avatar: String,
    pub author_type: String,
    pub text: String,
    pub media_url: Option<String>,
    pub media_type: String,
    pub like_count: usize,
    pub comment_count: usize,
    pub ai_reacted: bool,
    pub created_at: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedCommentRecord {
    pub id: String,
    pub post_id: String,
    pub author_id: String,
    pub author_name: String,
    pub author_avatar: String,
    pub author_type: String,
    pub text: String,
    pub created_at: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedInteractionRecord {
    pub id: String,
    pub user_id: String,
    pub post_id: String,
    pub r#type: String,
    pub created_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedPostWithCommentsRecord {
    pub id: String,
    pub author_id: String,
    pub author_name: String,
    pub author_avatar: String,
    pub author_type: String,
    pub text: String,
    pub media_url: Option<String>,
    pub media_type: String,
    pub like_count: usize,
    pub comment_count: usize,
    pub ai_reacted: bool,
    pub created_at: String,
    pub comments: Vec<FeedCommentRecord>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedListResponse {
    pub posts: Vec<FeedPostRecord>,
    pub total: usize,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFeedPostPayload {
    pub author_id: String,
    pub author_name: String,
    pub author_avatar: String,
    pub text: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFeedCommentPayload {
    pub author_id: String,
    pub author_name: String,
    pub author_avatar: String,
    pub text: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LikeFeedPostPayload {
    pub user_id: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedQuery {
    pub page: Option<usize>,
    pub limit: Option<usize>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinConversationSocketPayload {
    pub conversation_id: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageSocketPayload {
    pub conversation_id: String,
    pub character_id: String,
    pub text: String,
    pub user_id: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TypingEventPayload {
    pub character_id: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationUpdatedEventPayload {
    pub id: String,
    pub r#type: String,
    pub title: String,
    pub participants: Vec<String>,
}

#[derive(Clone, Serialize)]
pub struct ErrorEventPayload {
    pub message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RealtimeRoomStatusRecord {
    pub room_id: String,
    pub subscriber_count: usize,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RealtimeStatusRecord {
    pub healthy: bool,
    pub namespace: String,
    pub socket_path: String,
    pub connected_clients: usize,
    pub active_rooms: usize,
    pub event_names: Vec<String>,
    pub rooms: Vec<RealtimeRoomStatusRecord>,
    pub recent_events: Vec<String>,
    pub last_event_at: Option<String>,
    pub last_message_at: Option<String>,
}
