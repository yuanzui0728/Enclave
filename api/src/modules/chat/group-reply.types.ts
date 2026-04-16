import type {
  AiMessagePart,
  ChatMessage,
  PersonalityProfile,
} from '../ai/ai.types';
import type { ReplyLogicRuntimeRules } from '../ai/reply-logic.constants';
import type { CharacterEntity } from '../characters/character.entity';
import type { GroupMemberEntity } from './group-member.entity';
import type { GroupMessageEntity } from './group-message.entity';
import type { ChatReplyMetadata } from './chat-text.utils';

export type GroupReplyCandidate = {
  character: CharacterEntity;
  profile: PersonalityProfile;
  score: number;
  randomPassed: boolean;
  isExplicitTarget: boolean;
  isReplyTarget: boolean;
  recentSpeakerIndex: number;
};

export type GroupReplySelectionDisposition =
  | 'selected_targeted'
  | 'selected_fallback'
  | 'selected_followup'
  | 'skipped_not_targeted'
  | 'skipped_random_gate'
  | 'skipped_without_explicit_interest'
  | 'skipped_max_speakers';

export type GroupReplyPlannerCandidateDiagnostic = {
  characterId: string;
  characterName: string;
  score: number;
  randomPassed: boolean;
  isExplicitTarget: boolean;
  isReplyTarget: boolean;
  recentSpeakerIndex: number;
  selectionDisposition: GroupReplySelectionDisposition;
};

export type GroupReplyPlannerDecision = {
  selectedActors: GroupReplyCandidate[];
  candidateDiagnostics: GroupReplyPlannerCandidateDiagnostic[];
  maxSpeakers: number;
  explicitInterest: boolean;
  hasMentionAll: boolean;
  mentionTargets: string[];
  replyTargetCharacterId?: string;
};

export type GroupUserMessageContext = {
  promptText: string;
  parts: AiMessagePart[];
  mentions: string[];
  hasMentionAll: boolean;
  replyMetadata?: ChatReplyMetadata;
  replyTargetMessage?: GroupMessageEntity | null;
};

export type GroupReplyPlannerInput = {
  members: GroupMemberEntity[];
  history: GroupMessageEntity[];
  currentUserContext: GroupUserMessageContext;
  runtimeRules: Pick<
    ReplyLogicRuntimeRules,
    | 'groupReplyChance'
    | 'groupReplyMaxSpeakers'
    | 'groupReplyMaxSpeakersMentionAll'
    | 'groupReplyRecentSpeakerWindow'
  >;
};

export type GroupReplyOrchestratorInput = {
  groupId: string;
  groupName?: string;
  triggerMessageId: string;
  selectedActors: GroupReplyCandidate[];
  conversationHistory: ChatMessage[];
  currentUserContext: GroupUserMessageContext;
  runtimeRules: Pick<
    ReplyLogicRuntimeRules,
    'groupReplyPrimaryDelayMs' | 'groupReplyFollowupDelayMs'
  >;
  sendReply: (candidate: GroupReplyCandidate, text: string) => Promise<void>;
  onError?: (candidate: GroupReplyCandidate, error: unknown) => void;
};
