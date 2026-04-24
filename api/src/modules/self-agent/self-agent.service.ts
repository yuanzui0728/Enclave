import { Injectable } from '@nestjs/common';
import { ActionRuntimeService } from '../action-runtime/action-runtime.service';
import { CharacterEntity } from '../characters/character.entity';
import { SELF_CHARACTER_ID } from '../characters/default-characters';
import { ReminderRuntimeService } from '../reminder-runtime/reminder-runtime.service';
import { SelfAgentWorkspaceService } from './self-agent-workspace.service';

type SelfAgentHandlingResult = {
  handled: boolean;
  responseText?: string;
  handledBy?: 'action_runtime' | 'reminder_runtime';
};

@Injectable()
export class SelfAgentService {
  constructor(
    private readonly actionRuntime: ActionRuntimeService,
    private readonly reminderRuntime: ReminderRuntimeService,
    private readonly workspace: SelfAgentWorkspaceService,
  ) {}

  async handleConversationTurn(input: {
    conversationId: string;
    ownerId: string;
    character: CharacterEntity;
    userMessage: string;
    sourceMessageId: string;
  }): Promise<SelfAgentHandlingResult> {
    if (!this.isSelfCharacter(input.character)) {
      return { handled: false };
    }

    const actionResult = await this.actionRuntime.handleConversationTurn({
      conversationId: input.conversationId,
      ownerId: input.ownerId,
      character: input.character,
      userMessage: input.userMessage,
      delegatedBy: 'self_agent',
    });
    if (actionResult.handled) {
      return {
        handled: true,
        responseText: actionResult.responseText,
        handledBy: 'action_runtime',
      };
    }

    const reminderResult = await this.reminderRuntime.handleConversationTurn({
      conversationId: input.conversationId,
      userMessage: input.userMessage,
      sourceMessageId: input.sourceMessageId,
    });
    if (reminderResult.handled) {
      return {
        handled: true,
        responseText: reminderResult.responseText,
        handledBy: 'reminder_runtime',
      };
    }

    return { handled: false };
  }

  async buildChatPromptSections(input: { character: CharacterEntity }) {
    if (!this.isSelfCharacter(input.character)) {
      return [];
    }

    return this.workspace.buildChatPromptSections(input);
  }

  private isSelfCharacter(character: CharacterEntity) {
    return (
      character.id === SELF_CHARACTER_ID ||
      character.relationshipType === 'self' ||
      character.sourceKey?.trim() === 'self'
    );
  }
}
