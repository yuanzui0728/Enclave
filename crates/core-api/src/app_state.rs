use std::{
  collections::HashMap,
  path::PathBuf,
  sync::{Arc, RwLock},
};

use crate::{
  models::{
    AppConfigStore, CharacterRecord, ConversationRecord, FriendRequestRecord, FriendshipRecord, GroupMemberRecord,
    GroupMessageRecord, GroupRecord, MessageRecord, UserRecord, WorldContextRecord,
  },
  seed::{seeded_characters, seeded_world_context},
};

#[derive(Clone)]
pub struct AppState {
  pub port: u16,
  pub database_path: PathBuf,
  pub runtime: Arc<RwLock<RuntimeState>>,
}

pub struct RuntimeState {
  pub users: HashMap<String, UserRecord>,
  pub characters: HashMap<String, CharacterRecord>,
  pub conversations: HashMap<String, ConversationRecord>,
  pub messages: HashMap<String, Vec<MessageRecord>>,
  pub groups: HashMap<String, GroupRecord>,
  pub group_members: HashMap<String, Vec<GroupMemberRecord>>,
  pub group_messages: HashMap<String, Vec<GroupMessageRecord>>,
  pub friend_requests: HashMap<String, FriendRequestRecord>,
  pub friendships: HashMap<String, FriendshipRecord>,
  pub world_contexts: Vec<WorldContextRecord>,
  pub config: AppConfigStore,
}

impl AppState {
  pub fn new(port: u16, database_path: PathBuf) -> Self {
    Self {
      port,
      database_path,
      runtime: Arc::new(RwLock::new(RuntimeState::seeded())),
    }
  }
}

impl RuntimeState {
  fn seeded() -> Self {
    let characters = seeded_characters()
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
      friend_requests: HashMap::new(),
      friendships: HashMap::new(),
      world_contexts: vec![seeded_world_context()],
      config: AppConfigStore::default(),
    }
  }
}
