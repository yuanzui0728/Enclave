import type { CharacterEntity } from '../characters/character.entity';

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
  lastChatAt?: string | null;
  forgettingCurve: number;
  historyWindow: number;
  visibleHistoryCount: number;
  windowMessages: ReplyLogicHistoryItem[];
  promptSections: ReplyLogicPromptSection[];
  effectivePrompt: string;
  worldContextText?: string | null;
  notes: string[];
}

export interface ReplyLogicCharacterSnapshot {
  provider: ReplyLogicProviderSummary;
  worldContext?: ReplyLogicWorldContextSummary | null;
  character: ReplyLogicCharacterContract;
  actor: ReplyLogicActorSnapshot;
  narrativeArc?: ReplyLogicNarrativeArcSummary | null;
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
};
