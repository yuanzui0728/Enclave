import { Injectable } from '@nestjs/common';
import { sanitizeAiText } from '../ai/ai-text-sanitizer';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { type ChatMessage } from '../ai/ai.types';
import { WorldLanguageService } from '../config/world-language.service';
import {
  buildReplyModalityPromptSections,
  extractRequestedImagePrompt,
  resolveAssistantReplyText,
  shouldCreateVoiceReplyFromText,
  type AssistantReplyModalitiesPlan,
} from './assistant-reply-modalities';
import {
  type GroupReplyCandidate,
  type GroupReplyOrchestratorInput,
} from './group-reply.types';

@Injectable()
export class GroupReplyOrchestratorService {
  private readonly latestTriggerMessageByGroup = new Map<string, string>();

  constructor(
    private readonly ai: AiOrchestratorService,
    private readonly worldLanguage: WorldLanguageService,
  ) {}

  async generateTaskReply(input: {
    actor: GroupReplyCandidate;
    groupId: string;
    groupName?: string;
    conversationHistory: ChatMessage[];
    baseUserPrompt: string;
    userMessageParts: GroupReplyOrchestratorInput['currentUserContext']['parts'];
    followupReplies: Array<{ senderName: string; text: string }>;
    allowMultiModal?: boolean;
  }) {
    const {
      actor,
      groupId,
      groupName,
      conversationHistory,
      baseUserPrompt,
      userMessageParts,
      followupReplies,
      allowMultiModal,
    } = input;
    const rollingHistory = [...conversationHistory];
    const replyModalities = allowMultiModal
      ? await this.planAssistantReplyModalities({
          characterId: actor.character.id,
          promptText: baseUserPrompt,
        })
      : {
          includeVoice: false,
          promptSections: [],
        };
    const extraSystemPromptSections = [...replyModalities.promptSections];

    for (const reply of followupReplies) {
      rollingHistory.push({
        role: 'assistant',
        content: sanitizeAiText(reply.text) || '（无回复）',
        characterId: reply.senderName,
      });
    }

    const result = await this.ai.generateReply({
      profile: actor.profile,
      conversationHistory: rollingHistory,
      userMessage: this.buildTurnUserPrompt(baseUserPrompt, followupReplies),
      userMessageParts,
      isGroupChat: true,
      extraSystemPromptSections,
      emptyTextFallback: '',
      usageContext: {
        surface: 'app',
        scene: 'group_reply',
        scopeType: 'group',
        scopeId: groupId,
        scopeLabel: groupName || groupId,
        characterId: actor.character.id,
        characterName: actor.character.name,
        groupId,
      },
    });
    const language = await this.worldLanguage.getLanguage();

    return {
      text: resolveAssistantReplyText({
        text: result.text,
        promptText: baseUserPrompt,
        plan: replyModalities,
        language,
      }),
      modalities: replyModalities,
    };
  }

  async executeTurn(input: GroupReplyOrchestratorInput): Promise<void> {
    const {
      groupId,
      groupName,
      triggerMessageId,
      selectedActors,
      conversationHistory,
      currentUserContext,
      runtimeRules,
      sendReply,
      onError,
    } = input;

    this.latestTriggerMessageByGroup.set(groupId, triggerMessageId);
    if (!selectedActors.length) {
      return;
    }

    const language = await this.worldLanguage.getLanguage();
    const emittedReplies: Array<{ senderName: string; text: string }> = [];
    const rollingHistory: ChatMessage[] = [...conversationHistory];

    for (const [index, actor] of selectedActors.entries()) {
      if (this.isReplyTurnStale(groupId, triggerMessageId)) {
        return;
      }

      await this.sleep(this.pickReplyDelay(index, runtimeRules));
      if (this.isReplyTurnStale(groupId, triggerMessageId)) {
        return;
      }

      try {
        const reply = await this.ai.generateReply({
          profile: actor.profile,
          conversationHistory: rollingHistory,
          userMessage: this.buildTurnUserPrompt(
            currentUserContext.promptText,
            emittedReplies,
          ),
          userMessageParts: currentUserContext.parts,
          isGroupChat: true,
          emptyTextFallback: '',
          usageContext: {
            surface: 'app',
            scene: 'group_reply',
            scopeType: 'group',
            scopeId: groupId,
            scopeLabel: groupName || groupId,
            characterId: actor.character.id,
            characterName: actor.character.name,
            groupId,
          },
        });
        if (this.isReplyTurnStale(groupId, triggerMessageId)) {
          return;
        }

        const normalizedReplyText = resolveAssistantReplyText({
          text: reply.text,
          promptText: currentUserContext.promptText,
          plan: { includeVoice: false, promptSections: [] },
          language,
        });

        await sendReply(actor, normalizedReplyText);
        emittedReplies.push({
          senderName: actor.character.name,
          text: normalizedReplyText,
        });
        rollingHistory.push(
          this.toEmittedHistoryMessage(actor, normalizedReplyText),
        );
      } catch (error) {
        onError?.(actor, error);
      }
    }
  }

  private toEmittedHistoryMessage(
    actor: GroupReplyCandidate,
    text: string,
  ): ChatMessage {
    return {
      role: 'assistant',
      content: sanitizeAiText(text) || '（无回复）',
      characterId: actor.character.name,
    };
  }

  private async planAssistantReplyModalities(input: {
    characterId: string;
    promptText: string;
  }): Promise<AssistantReplyModalitiesPlan> {
    const wantsVoice = shouldCreateVoiceReplyFromText(input.promptText);
    const requestedImagePrompt = extractRequestedImagePrompt({
      type: 'text',
      text: input.promptText,
    });
    if (!wantsVoice && !requestedImagePrompt) {
      return {
        includeVoice: false,
        promptSections: [],
      };
    }

    const capabilities = await this.ai.resolveRuntimeCapabilityProfile({
      characterId: input.characterId,
    });
    const plan: AssistantReplyModalitiesPlan = {
      includeVoice: wantsVoice && capabilities.supportsSpeechSynthesis,
      imagePrompt:
        requestedImagePrompt && capabilities.supportsImageGeneration
          ? requestedImagePrompt
          : undefined,
      promptSections: [],
    };
    plan.promptSections = buildReplyModalityPromptSections(plan);
    return plan;
  }

  private buildTurnUserPrompt(
    promptText: string,
    emittedReplies: Array<{ senderName: string; text: string }>,
  ) {
    if (!emittedReplies.length) {
      return promptText;
    }

    const replySummary = emittedReplies
      .map(
        (reply) =>
          `- ${reply.senderName}：${sanitizeAiText(reply.text) || '（无回复）'}`,
      )
      .join('\n');

    return `${promptText}\n\n【群里刚刚已经有人回应】\n${replySummary}\n请避免重复上面的内容，直接补充新的信息或自然接话。`;
  }

  pickReplyDelay(
    index: number,
    runtimeRules: GroupReplyOrchestratorInput['runtimeRules'],
  ) {
    const range =
      index === 0
        ? runtimeRules.groupReplyPrimaryDelayMs
        : runtimeRules.groupReplyFollowupDelayMs;
    return range.min + Math.random() * (range.max - range.min);
  }

  private isReplyTurnStale(groupId: string, triggerMessageId: string) {
    return this.latestTriggerMessageByGroup.get(groupId) !== triggerMessageId;
  }

  private sleep(durationMs: number) {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, Math.max(0, Math.round(durationMs)));
    });
  }
}
