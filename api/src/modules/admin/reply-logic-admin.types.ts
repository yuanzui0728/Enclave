import type { CharacterEntity } from '../characters/character.entity';
import type {
  SchedulerCharacterEventValue,
  SchedulerJobStatusValue,
  SchedulerRunRecordValue,
} from '../scheduler/scheduler-telemetry.types';

export type ReplyLogicApiKeySource = 'owner_custom' | 'env_default' | 'missing';
export type ReplyLogicEndpointSource =
  | 'owner_custom_base'
  | 'env_default'
  | 'deepseek_default';
export type ReplyLogicModelSource =
  | 'system_config_ai_model'
  | 'env_ai_model'
  | 'deepseek_default';
export type ReplyLogicStateGateMode =
  | 'immediate'
  | 'sleep_hint_delay'
  | 'busy_hint_delay'
  | 'not_applied';
export type ReplyLogicConversationSource = 'conversation' | 'group';

export interface ReplyLogicPromptSection {
  key:
    | 'identity'
    | 'personality_and_tone'
    | 'behavioral_patterns'
    | 'cognitive_boundaries'
    | 'internal_reasoning'
    | 'collaboration_routing'
    | 'memory'
    | 'current_context'
    | 'group_chat'
    | 'rules';
  label: string;
  content: string;
  active: boolean;
}

export interface ReplyLogicProviderSummary {
  model: string;
  modelSource: ReplyLogicModelSource;
  endpoint: string;
  endpointSource: ReplyLogicEndpointSource;
  apiKeySource: ReplyLogicApiKeySource;
  ownerCustomBase?: string | null;
  configuredProviderEndpoint?: string | null;
  configuredProviderModel?: string | null;
  configuredProviderApiStyle?: string | null;
  notes: string[];
}

export interface ReplyLogicPromptTemplates {
  identityFallback: string;
  chainOfThoughtInstruction: string;
  reflectionInstruction: string;
  collaborationRouting: string;
  emptyMemory: string;
  behavioralGuideline: string;
  groupChatInstruction: string;
  baseRules: string[];
  momentPrompt: string;
  personalityExtractionPrompt: string;
  intentClassificationPrompt: string;
  memoryCompressionPrompt: string;
  groupCoordinatorPrompt: string;
}

export interface ReplyLogicSemanticLabels {
  domainLabels: {
    law: string;
    medicine: string;
    finance: string;
    tech: string;
    psychology: string;
    education: string;
    management: string;
    general: string;
  };
  activityLabels: {
    working: string;
    eating: string;
    sleeping: string;
    commuting: string;
    resting: string;
    free: string;
  };
  weekdayLabels: string[];
  timeOfDayLabels: {
    lateNight: string;
    morning: string;
    forenoon: string;
    noon: string;
    afternoon: string;
    dusk: string;
    evening: string;
  };
}

export interface ReplyLogicActivityScheduleRules {
  sleeping: number[];
  commuting: number[];
  working: number[];
  eating: number[];
}

export interface ReplyLogicObservabilityTemplates {
  stateGateSleeping: string;
  stateGateBusy: string;
  stateGateImmediate: string;
  stateGateNotApplied: string;
  actorNoteApiAvailable: string;
  actorNoteApiUnavailable: string;
  actorNoteGroupContext: string;
  actorNoteDirectContext: string;
}

export interface ReplyLogicWorldContextRules {
  seasonLabels: {
    spring: string;
    summer: string;
    autumn: string;
    winter: string;
  };
  weatherOptions: {
    spring: string[];
    summer: string[];
    autumn: string[];
    winter: string[];
  };
  holidays: Array<{
    month: number;
    day: number;
    label: string;
  }>;
  localTimeTemplate: string;
  contextFieldTemplates: {
    currentTime: string;
    season: string;
    weather: string;
    location: string;
    holiday: string;
  };
  contextSeparator: string;
  promptContextTemplate: string;
}

export interface ReplyLogicInspectorTemplates {
  characterViewIntro: string;
  characterViewHistoryFound: string;
  characterViewHistoryMissing: string;
  historyIncludedNote: string;
  historyExcludedNote: string;
  storedGroupTitle: string;
  storedGroupUpgradedNote: string;
  storedGroupNextReplyNote: string;
  directBranchTitle: string;
  directBranchNextReplyNote: string;
  formalGroupTitle: string;
  formalGroupStateGateNote: string;
  formalGroupReplyRuleNote: string;
  previewCharacterIntro: string;
  previewCharacterWithHistory: string;
  previewCharacterWithoutHistory: string;
  previewStoredGroup: string;
  previewDirectConversation: string;
  previewFormalGroup: string;
  previewDefaultUserMessage: string;
}

export interface ReplyLogicNarrativePresentationTemplates {
  relationshipArcSuffix: string;
  milestoneLabels: {
    connected: string;
    first_breakthrough: string;
    shared_context: string;
    growing_trust: string;
    inner_circle: string;
    story_complete: string;
  };
}

export interface ReplyLogicProviderTemplates {
  endpointPriorityNote: string;
  modelPriorityNote: string;
}

export interface ReplyLogicRuntimeNoteTemplates {
  manualOnlineMode: string;
  manualActivityMode: string;
  zeroMomentFrequency: string;
  zeroChannelFrequency: string;
  missingTriggerScenes: string;
  missingMemorySeed: string;
  memoryProactiveEnabled: string;
  memoryProactiveDisabled: string;
}

export interface ReplyLogicSchedulerDescriptions {
  world_context_snapshot: string;
  expire_friend_requests: string;
  update_ai_active_status: string;
  check_moment_schedule: string;
  trigger_scene_friend_requests: string;
  process_pending_feed_reactions: string;
  check_channels_schedule: string;
  update_character_status: string;
  trigger_memory_proactive_messages: string;
}

export interface ReplyLogicSchedulerTextTemplates {
  eventTitleOnlineStatusChanged: string;
  eventTitleActivityChanged: string;
  eventTitleMomentPosted: string;
  eventTitleSceneFriendRequest: string;
  eventTitleChannelPosted: string;
  eventTitleProactiveMessage: string;
  eventTitleRelationshipUpdated: string;
  eventSummaryDefaultOnlineKept: string;
  eventSummaryDefaultActivityReset: string;
  eventSummaryOnlineWindowEntered: string;
  eventSummaryOnlineWindowExited: string;
  eventSummaryMomentPosted: string;
  eventSummarySceneFriendRequest: string;
  eventSummaryChannelPosted: string;
  eventSummaryActivityChanged: string;
  eventSummaryProactiveMessage: string;
  eventSummaryRelationshipUpdated: string;
  jobSummaryWorldContextUpdated: string;
  jobSummaryExpiredFriendRequests: string;
  jobSummaryUpdateAiActiveStatus: string;
  jobSummaryNoFriendCharactersForMoments: string;
  jobSummaryCheckMomentSchedule: string;
  jobSummarySceneRequestSkipped: string;
  jobSummarySceneRequestNoMatch: string;
  jobSummarySceneRequestTriggered: string;
  jobSummaryProcessPendingFeedReactions: string;
  jobSummaryCheckChannelsSchedule: string;
  jobSummaryUpdateCharacterStatus: string;
  jobSummaryProactiveReminderSkipped: string;
  jobSummaryTriggerMemoryProactiveMessages: string;
  proactiveReminderCheckPrompt: string;
  proactiveReminderNoActionToken: string;
}

export interface ReplyLogicSchedulerNames {
  world_context_snapshot: string;
  expire_friend_requests: string;
  update_ai_active_status: string;
  check_moment_schedule: string;
  trigger_scene_friend_requests: string;
  process_pending_feed_reactions: string;
  check_channels_schedule: string;
  update_character_status: string;
  trigger_memory_proactive_messages: string;
}

export interface ReplyLogicSchedulerNextRunHints {
  world_context_snapshot: string;
  expire_friend_requests: string;
  update_ai_active_status: string;
  check_moment_schedule: string;
  trigger_scene_friend_requests: string;
  process_pending_feed_reactions: string;
  check_channels_schedule: string;
  update_character_status: string;
  trigger_memory_proactive_messages: string;
}

export interface ReplyLogicOverviewCharacterItem {
  id: string;
  name: string;
  relationship: string;
  isOnline: boolean;
  currentActivity?: string | null;
  expertDomains: string[];
}

export interface ReplyLogicOverviewConversationItem {
  id: string;
  title: string;
  type: 'direct' | 'group';
  source: ReplyLogicConversationSource;
  participantIds: string[];
  participantNames: string[];
  lastActivityAt?: string | null;
}

export interface ReplyLogicWorldContextSummary {
  id: string;
  text: string;
  timestamp: string;
}

export interface ReplyLogicOverview {
  provider: ReplyLogicProviderSummary;
  constants: {
    sleepHintMessages: string[];
    busyHintMessages: Record<string, string[]>;
    sleepDelayMs: { min: number; max: number };
    busyDelayMs: { min: number; max: number };
    groupReplyChance: { high: number; normal: number; low: number };
    groupReplyDelayMs: { min: number; max: number };
    memoryCompressionEveryMessages: number;
    momentGenerateChance: number;
    channelGenerateChance: number;
    sceneFriendRequestChance: number;
    sceneFriendRequestScenes: string[];
    relationshipInitialType: string;
    relationshipInitialStrength: number;
    relationshipUpdateChance: number;
    relationshipUpdateStep: number;
    relationshipStrengthMax: number;
    activityScheduleHours: ReplyLogicActivityScheduleRules;
    activityBaseWeight: number;
    proactiveReminderHour: number;
    relationshipInitialBackstory: string;
    historyWindow: {
      base: number;
      range: number;
      min: number;
      max: number;
    };
    narrativeMilestones: Array<{
      threshold: number;
      label: string;
      progress: number;
    }>;
    promptTemplates: ReplyLogicPromptTemplates;
    semanticLabels: ReplyLogicSemanticLabels;
    observabilityTemplates: ReplyLogicObservabilityTemplates;
    worldContextRules: ReplyLogicWorldContextRules;
    inspectorTemplates: ReplyLogicInspectorTemplates;
    narrativePresentationTemplates: ReplyLogicNarrativePresentationTemplates;
    providerTemplates: ReplyLogicProviderTemplates;
    runtimeNoteTemplates: ReplyLogicRuntimeNoteTemplates;
    schedulerDescriptions: ReplyLogicSchedulerDescriptions;
    schedulerNames: ReplyLogicSchedulerNames;
    schedulerNextRunHints: ReplyLogicSchedulerNextRunHints;
    schedulerTextTemplates: ReplyLogicSchedulerTextTemplates;
  };
  worldContext?: ReplyLogicWorldContextSummary | null;
  characters: ReplyLogicOverviewCharacterItem[];
  conversations: ReplyLogicOverviewConversationItem[];
}

export interface ReplyLogicHistoryItem {
  id: string;
  senderType: 'user' | 'character' | 'system';
  senderId: string;
  senderName: string;
  type: string;
  text: string;
  attachmentKind?: string | null;
  createdAt: string;
  includedInWindow: boolean;
  note: string;
}

export interface ReplyLogicRequestMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ReplyLogicNarrativeArcSummary {
  id: string;
  title: string;
  status: string;
  progress: number;
  createdAt: string;
  completedAt?: string | null;
  milestones: Array<{
    label: string;
    completedAt?: string | null;
  }>;
}

export interface ReplyLogicStateGateSummary {
  mode: ReplyLogicStateGateMode;
  activity?: string | null;
  reason: string;
  delayMs?: { min: number; max: number };
  hintMessages: string[];
}

export interface ReplyLogicActorSnapshot {
  character: ReplyLogicCharacterContract;
  isGroupChat: boolean;
  stateGate: ReplyLogicStateGateSummary;
  model: string;
  apiAvailable: boolean;
  lastChatAt?: string | null;
  forgettingCurve: number;
  historyWindow: number;
  visibleHistoryCount: number;
  windowMessages: ReplyLogicHistoryItem[];
  requestMessages: ReplyLogicRequestMessage[];
  promptSections: ReplyLogicPromptSection[];
  effectivePrompt: string;
  worldContextText?: string | null;
  notes: string[];
}

export interface ReplyLogicCharacterObservability {
  activeWindow: {
    startHour: number;
    endHour: number;
    currentHour: number;
    label: string;
    isWithinWindow: boolean;
  };
  contentCadence: {
    todayMoments: number;
    momentsTarget: number;
    weeklyChannels: number;
    channelsTarget: number;
  };
  triggerScenes: string[];
  memoryProactive: {
    enabled: boolean;
    reason: string;
  };
  relevantJobs: SchedulerJobStatusValue[];
  recentRuns: SchedulerRunRecordValue[];
  lifeEvents: SchedulerCharacterEventValue[];
  notes: string[];
}

export interface ReplyLogicCharacterSnapshot {
  provider: ReplyLogicProviderSummary;
  worldContext?: ReplyLogicWorldContextSummary | null;
  character: ReplyLogicCharacterContract;
  actor: ReplyLogicActorSnapshot;
  narrativeArc?: ReplyLogicNarrativeArcSummary | null;
  observability: ReplyLogicCharacterObservability;
  relatedConversationIds: string[];
  notes: string[];
}

export interface ReplyLogicConversationSnapshot {
  provider: ReplyLogicProviderSummary;
  worldContext?: ReplyLogicWorldContextSummary | null;
  conversation: ReplyLogicOverviewConversationItem;
  visibleMessages: ReplyLogicHistoryItem[];
  actors: ReplyLogicActorSnapshot[];
  narrativeArcs: ReplyLogicNarrativeArcSummary[];
  branchSummary: {
    kind: 'direct' | 'stored_group' | 'formal_group';
    title: string;
    notes: string[];
  };
}

export interface ReplyLogicPreviewResult {
  scope: 'character' | 'conversation';
  targetId: string;
  actorCharacterId: string;
  userMessage: string;
  actor: ReplyLogicActorSnapshot;
  notes: string[];
}

export type ReplyLogicCharacterContract = {
  id: string;
  name: string;
  avatar: string;
  relationship: string;
  relationshipType:
    | 'family'
    | 'friend'
    | 'expert'
    | 'mentor'
    | 'custom'
    | 'self';
  personality?: string;
  bio: string;
  isOnline: boolean;
  onlineMode?: 'auto' | 'manual' | null;
  isTemplate: boolean;
  expertDomains: string[];
  profile: CharacterEntity['profile'];
  activityFrequency: string;
  momentsFrequency: number;
  feedFrequency: number;
  activeHoursStart?: number | null;
  activeHoursEnd?: number | null;
  triggerScenes?: string[] | null;
  intimacyLevel: number;
  lastActiveAt?: string | null;
  aiRelationships?: CharacterEntity['aiRelationships'] | null;
  currentStatus?: string | null;
  currentActivity?: string | null;
  activityMode?: 'auto' | 'manual' | null;
};
