import { Injectable, NotFoundException } from '@nestjs/common';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { AiSpeechAssetsService } from '../ai/ai-speech-assets.service';
import { CharactersService } from '../characters/characters.service';
import { ChatService } from './chat.service';
import type { Message, VoiceAttachment } from './chat.types';

type VoiceCallTranscriptStatus =
  | 'completed'
  | 'pending'
  | 'failed'
  | 'skipped';

const VOICE_CALL_INPUT_ATTACHMENT_MISSING =
  'VOICE_CALL_INPUT_ATTACHMENT_MISSING';
const VOICE_CALL_ASSISTANT_VOICE_REPLY_MISSING =
  'VOICE_CALL_ASSISTANT_VOICE_REPLY_MISSING';
const VOICE_CALL_DIRECT_ONLY =
  '\u5f53\u524d\u53ea\u652f\u6301\u5355\u804a\u8bed\u8a00\u901a\u8bdd\u3002';
const VOICE_CALL_CHARACTER_MISMATCH =
  '\u5f53\u524d\u4f1a\u8bdd\u4e0e\u76ee\u6807\u89d2\u8272\u4e0d\u5339\u914d\u3002';
const VOICE_CALL_INCOMPLETE_TURN =
  '\u672c\u8f6e\u8bed\u8a00\u901a\u8bdd\u672a\u751f\u6210\u5b8c\u6574\u6d88\u606f\u3002';
const VOICE_CALL_CURRENT_CHARACTER =
  '\u5f53\u524d\u89d2\u8272';
const VOICE_CALL_TTS_INSTRUCTIONS_PREFIX =
  '\u8bf7\u7528\u81ea\u7136\u3001\u53e3\u8bed\u5316\u3001\u9002\u5408\u624b\u673a\u8bed\u97f3\u901a\u8bdd\u7684\u4e2d\u6587\u64ad\u62a5\uff0c\u8bed\u901f\u5e73\u7a33\uff0c\u4e0d\u8981\u8bfb\u51fa\u6807\u70b9\u3002\u8bf4\u8bdd\u4eba\u662f';
const VOICE_CALL_TTS_INSTRUCTIONS_SUFFIX = '\u3002';

type UploadedAudioFile = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size: number;
};

@Injectable()
export class VoiceCallsService {
  constructor(
    private readonly ai: AiOrchestratorService,
    private readonly speechAssets: AiSpeechAssetsService,
    private readonly chatService: ChatService,
    private readonly characters: CharactersService,
  ) {}

  async createTurn(
    file: UploadedAudioFile,
    input: {
      conversationId: string;
      characterId?: string;
      durationMs?: number;
    },
  ) {
    const startedAt = Date.now();
    const conversation = await this.chatService.getConversation(
      input.conversationId,
    );
    if (!conversation) {
      throw new NotFoundException(
        `Conversation ${input.conversationId} not found`,
      );
    }

    if (conversation.type !== 'direct') {
      throw new NotFoundException(VOICE_CALL_DIRECT_ONLY);
    }

    const characterId = conversation.participants[0];
    if (input.characterId && input.characterId !== characterId) {
      throw new NotFoundException(VOICE_CALL_CHARACTER_MISMATCH);
    }

    const character = await this.characters.findById(characterId);
    if (!character) {
      throw new NotFoundException(`Character ${characterId} not found`);
    }

    const capabilityProfile = await this.ai.resolveRuntimeCapabilityProfile({
      characterId,
    });
    const attachment = await this.chatService.saveUploadedAttachment(
      file,
      input.durationMs !== undefined ? { durationMs: input.durationMs } : {},
    );
    if (attachment.kind !== 'voice') {
      throw new NotFoundException(VOICE_CALL_INPUT_ATTACHMENT_MISSING);
    }

    const messageResult = await this.chatService.sendMessageDetailed(
      conversation.id,
      {
        type: 'voice',
        attachment,
      },
    );
    if (messageResult.scheduledReplyArtifactJobIds?.length) {
      await this.chatService.activateReplyArtifactJobs(
        messageResult.scheduledReplyArtifactJobIds,
      );
    }

    const userMessage = messageResult.messages.find(
      (message) => message.senderType === 'user',
    );
    const assistantTextMessage = messageResult.messages.find(
      (message) =>
        message.senderType === 'character' &&
        message.senderId === characterId &&
        message.type === 'text',
    );
    let assistantVoiceMessage = messageResult.messages.find(
      (message) =>
        message.senderType === 'character' &&
        message.senderId === characterId &&
        message.type === 'voice',
    );

    if (!userMessage || !assistantTextMessage) {
      throw new NotFoundException(VOICE_CALL_INCOMPLETE_TURN);
    }

    let synthesizedProvider: string | undefined;
    let synthesisDurationMs =
      this.getVoiceAttachment(assistantVoiceMessage)?.durationMs ?? 0;
    if (!assistantVoiceMessage) {
      const fallbackVoiceReply = await this.createFallbackVoiceReply({
        conversationId: conversation.id,
        characterId,
        characterName: character.name,
        text: assistantTextMessage.text,
      });
      assistantVoiceMessage = fallbackVoiceReply.message;
      synthesisDurationMs = fallbackVoiceReply.synthesisDurationMs;
      synthesizedProvider = fallbackVoiceReply.provider;
    }

    const assistantVoiceAttachment = this.getVoiceAttachment(assistantVoiceMessage);
    if (!assistantVoiceAttachment) {
      throw new NotFoundException(VOICE_CALL_ASSISTANT_VOICE_REPLY_MISSING);
    }

    const transcriptState = this.resolveTranscriptState(
      this.getVoiceAttachment(userMessage),
      capabilityProfile.supportsTranscription,
    );

    return {
      conversationId: conversation.id,
      characterId,
      characterName: character.name,
      transcriptStatus: transcriptState.status,
      assistantText: assistantTextMessage.text,
      assistantAudioUrl: assistantVoiceAttachment.url,
      assistantAudioFileName: assistantVoiceAttachment.fileName,
      assistantAudioMimeType: assistantVoiceAttachment.mimeType,
      synthesisDurationMs,
      totalDurationMs: Date.now() - startedAt,
      userMessageId: userMessage.id,
      assistantMessageId: assistantTextMessage.id,
      ...(transcriptState.text ? { userTranscript: transcriptState.text } : {}),
      ...(transcriptState.durationMs !== undefined
        ? { transcriptionDurationMs: transcriptState.durationMs }
        : {}),
      ...(synthesizedProvider ?? transcriptState.provider
        ? { provider: synthesizedProvider ?? transcriptState.provider }
        : {}),
    };
  }

  private getVoiceAttachment(message?: Message): VoiceAttachment | undefined {
    return message?.attachment?.kind === 'voice' ? message.attachment : undefined;
  }

  private resolveTranscriptState(
    attachment: VoiceAttachment | undefined,
    transcriptionConfigured: boolean,
  ): {
    text?: string;
    status: VoiceCallTranscriptStatus;
    durationMs?: number;
    provider?: string;
  } {
    const transcriptText = attachment?.transcriptText?.trim();
    const provider = attachment?.insight?.provider;
    if (transcriptText) {
      return {
        text: transcriptText,
        status: 'completed',
        ...(provider ? { provider } : {}),
      };
    }

    const insightStatus = attachment?.insight?.status;
    if (insightStatus === 'pending' || insightStatus === 'processing') {
      return {
        status: transcriptionConfigured ? 'pending' : 'skipped',
        ...(provider ? { provider } : {}),
      };
    }

    if (insightStatus === 'failed' || insightStatus === 'cancelled') {
      return {
        status: transcriptionConfigured ? 'failed' : 'skipped',
        ...(provider ? { provider } : {}),
      };
    }

    return {
      status: transcriptionConfigured ? 'pending' : 'skipped',
      ...(provider ? { provider } : {}),
    };
  }

  private async createFallbackVoiceReply(input: {
    conversationId: string;
    characterId: string;
    characterName: string;
    text: string;
  }) {
    const synthesized = await this.ai.synthesizeSpeech({
      text: input.text,
      conversationId: input.conversationId,
      characterId: input.characterId,
      instructions: buildSpeechInstructions(input.characterName),
    });
    const asset = await this.speechAssets.saveGeneratedSpeech(
      synthesized.buffer,
      {
        mimeType: synthesized.mimeType,
        fileExtension: synthesized.fileExtension,
        baseName: `voice-call-${input.characterId}`,
      },
    );
    const attachment: VoiceAttachment = {
      kind: 'voice',
      url: asset.audioUrl,
      mimeType: asset.mimeType,
      fileName: asset.fileName,
      size: synthesized.buffer.length,
      durationMs: synthesized.durationMs,
      transcriptText: input.text,
    };
    const message = await this.chatService.saveProactiveAttachmentMessage(
      input.conversationId,
      input.characterId,
      input.characterName,
      attachment,
      input.text,
    );

    return {
      message,
      synthesisDurationMs: synthesized.durationMs,
      provider: synthesized.provider,
    };
  }
}

function buildSpeechInstructions(characterName: string) {
  const normalizedName = characterName.trim() || VOICE_CALL_CURRENT_CHARACTER;
  return `${VOICE_CALL_TTS_INSTRUCTIONS_PREFIX}${normalizedName}${VOICE_CALL_TTS_INSTRUCTIONS_SUFFIX}`;
}
