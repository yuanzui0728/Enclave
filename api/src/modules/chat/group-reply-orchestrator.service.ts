import { Injectable } from '@nestjs/common';
import { sanitizeAiText } from '../ai/ai-text-sanitizer';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { type ChatMessage } from '../ai/ai.types';
import {
  type GroupReplyCandidate,
  type GroupReplyOrchestratorInput,
} from './group-reply.types';

@Injectable()
export class GroupReplyOrchestratorService {
  private readonly latestTriggerMessageByGroup = new Map<string, string>();

  constructor(private readonly ai: AiOrchestratorService) {}

  async generateTaskReply(input: {
    actor: GroupReplyCandidate;
    conversationHistory: ChatMessage[];
    baseUserPrompt: string;
    userMessageParts: GroupReplyOrchestratorInput['currentUserContext']['parts'];
    followupReplies: Array<{ senderName: string; text: string }>;
  }) {
    const {
      actor,
      conversationHistory,
      baseUserPrompt,
      userMessageParts,
      followupReplies,
    } = input;
    const rollingHistory = [...conversationHistory];

    for (const reply of followupReplies) {
      rollingHistory.push({
        role: 'assistant',
        content: sanitizeAiText(reply.text) || '（无回复）',
        characterId: reply.senderName,
      });
    }

    return this.ai.generateReply({
      profile: actor.profile,
      conversationHistory: rollingHistory,
      userMessage: this.buildTurnUserPrompt(baseUserPrompt, followupReplies),
      userMessageParts,
      isGroupChat: true,
    });
  }

  async executeTurn(input: GroupReplyOrchestratorInput): Promise<void> {
    const {
      groupId,
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
        });
        if (this.isReplyTurnStale(groupId, triggerMessageId)) {
          return;
        }

        await sendReply(actor, reply.text);
        emittedReplies.push({
          senderName: actor.character.name,
          text: reply.text,
        });
        rollingHistory.push(this.toEmittedHistoryMessage(actor, reply.text));
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

  private buildTurnUserPrompt(
    promptText: string,
    emittedReplies: Array<{ senderName: string; text: string }>,
  ) {
    if (!emittedReplies.length) {
      return promptText;
    }

    const replySummary = emittedReplies
      .map(
        (reply) => `- ${reply.senderName}：${sanitizeAiText(reply.text) || '（无回复）'}`,
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
