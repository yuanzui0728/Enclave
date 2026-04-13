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
  runtimeRules: Pick<ReplyLogicRuntimeRules, 'groupReplyChance'>;
};

export type GroupReplyOrchestratorInput = {
  groupId: string;
  triggerMessageId: string;
  selectedActors: GroupReplyCandidate[];
  conversationHistory: ChatMessage[];
  currentUserContext: GroupUserMessageContext;
  sendReply: (candidate: GroupReplyCandidate, text: string) => Promise<void>;
  onError?: (candidate: GroupReplyCandidate, error: unknown) => void;
};
