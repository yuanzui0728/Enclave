import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../../common/app-error.exception';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { AiSpeechAssetsService } from '../ai/ai-speech-assets.service';
import { CharactersService } from '../characters/characters.service';
import { ChatService } from './chat.service';
import type {
  CallLogAttachment,
  CallLogEndedReason,
  Message,
  VoiceAttachment,
} from './chat.types';

// i18n-ignore-start: data / seed / preset content — not user-facing UI.
type VoiceCallTranscriptStatus = 'completed' | 'pending' | 'failed' | 'skipped';

const VOICE_CALL_INPUT_ATTACHMENT_MISSING =
  'VOICE_CALL_INPUT_ATTACHMENT_MISSING';
const VOICE_CALL_DIRECT_ONLY =
  '\u5f53\u524d\u53ea\u652f\u6301\u5355\u804a\u8bed\u8a00\u901a\u8bdd\u3002';
const VOICE_CALL_CHARACTER_MISMATCH =
  '\u5f53\u524d\u4f1a\u8bdd\u4e0e\u76ee\u6807\u89d2\u8272\u4e0d\u5339\u914d\u3002';
const VOICE_CALL_INCOMPLETE_TURN =
  '\u672c\u8f6e\u8bed\u8a00\u901a\u8bdd\u672a\u751f\u6210\u5b8c\u6574\u6d88\u606f\u3002';
const VOICE_CALL_CURRENT_CHARACTER = '\u5f53\u524d\u89d2\u8272';
const VOICE_CALL_TTS_INSTRUCTIONS_PREFIX =
  'Keep the delivery natural, conversational, and suitable for a mobile voice call. The speaker is ';
const VOICE_CALL_TTS_INSTRUCTIONS_SUFFIX = '.';

type UploadedAudioFile = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size: number;
};

@Injectable()
export class VoiceCallsService {
  private readonly logger = new Logger(VoiceCallsService.name);

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
      throw new AppError('CHAT_CONVERSATION_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { conversationId: input.conversationId },
        legacyMessage: `Conversation ${input.conversationId} not found`,
      });
    }

    if (conversation.type !== 'direct') {
      throw new AppError('CHAT_VOICE_CALL_INVALID_STATE', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: VOICE_CALL_DIRECT_ONLY,
      });
    }

    const characterId = conversation.participants[0];
    if (input.characterId && input.characterId !== characterId) {
      throw new AppError('CHAT_VOICE_CALL_INVALID_STATE', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: VOICE_CALL_CHARACTER_MISMATCH,
      });
    }

    const character = await this.characters.findById(characterId);
    if (!character) {
      throw new AppError('CHARACTER_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { id: characterId },
        legacyMessage: `Character ${characterId} not found`,
      });
    }

    const capabilityProfile = await this.ai.resolveRuntimeCapabilityProfile({
      characterId,
    });
    const attachment = await this.chatService.saveUploadedAttachment(
      file,
      input.durationMs !== undefined ? { durationMs: input.durationMs } : {},
    );
    if (attachment.kind !== 'voice') {
      throw new AppError('CHAT_VOICE_CALL_AUDIO_REQUIRED', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: VOICE_CALL_INPUT_ATTACHMENT_MISSING,
      });
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
      throw new AppError('CHAT_VOICE_CALL_INVALID_STATE', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: VOICE_CALL_INCOMPLETE_TURN,
      });
    }

    let synthesizedProvider: string | undefined;
    let speechFallbackReason: 'tts_unavailable' | undefined;
    let synthesisDurationMs =
      this.getVoiceAttachment(assistantVoiceMessage)?.durationMs ?? 0;
    if (!assistantVoiceMessage) {
      const fallbackVoiceReply = await this.createFallbackVoiceReply({
        conversationId: conversation.id,
        characterId,
        characterName: character.name,
        text: assistantTextMessage.text,
        voicePreset: character.voicePreset ?? null,
      });
      assistantVoiceMessage = fallbackVoiceReply.message ?? undefined;
      synthesisDurationMs = fallbackVoiceReply.synthesisDurationMs;
      synthesizedProvider = fallbackVoiceReply.provider;
      speechFallbackReason = fallbackVoiceReply.failedReason;
    }

    const assistantVoiceAttachment = this.getVoiceAttachment(
      assistantVoiceMessage,
    );

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
      assistantAudioUrl: assistantVoiceAttachment?.url ?? null,
      assistantAudioFileName: assistantVoiceAttachment?.fileName ?? '',
      assistantAudioMimeType: assistantVoiceAttachment?.mimeType ?? '',
      synthesisDurationMs,
      totalDurationMs: Date.now() - startedAt,
      userMessageId: userMessage.id,
      assistantMessageId: assistantTextMessage.id,
      ...(transcriptState.text ? { userTranscript: transcriptState.text } : {}),
      ...(transcriptState.durationMs !== undefined
        ? { transcriptionDurationMs: transcriptState.durationMs }
        : {}),
      ...((synthesizedProvider ?? transcriptState.provider)
        ? { provider: synthesizedProvider ?? transcriptState.provider }
        : {}),
      ...(speechFallbackReason ? { speechFallbackReason } : {}),
    };
  }

  async finalizeCall(input: {
    conversationId: string;
    characterId?: string;
    mode: 'voice' | 'video';
    startedAtIso: string;
    endedReason: CallLogEndedReason;
  }): Promise<{
    messageId: string | null;
    durationSec: number;
    endedReason: CallLogEndedReason;
  }> {
    const startedAt = parseStartedAt(input.startedAtIso);
    const endedAt = new Date();
    const durationSec = Math.max(
      0,
      Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
    );

    const conversation = await this.chatService.getConversation(
      input.conversationId,
    );
    if (!conversation) {
      throw new AppError('CHAT_CONVERSATION_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { conversationId: input.conversationId },
        legacyMessage: `Conversation ${input.conversationId} not found`,
      });
    }
    if (conversation.type !== 'direct') {
      throw new AppError('CHAT_VOICE_CALL_INVALID_STATE', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: VOICE_CALL_DIRECT_ONLY,
      });
    }

    const attachment: CallLogAttachment = {
      kind: 'call_log',
      mode: input.mode,
      thread: 'direct',
      durationSec,
      endedReason: input.endedReason,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      participantCount: 2,
    };

    try {
      const message = await this.chatService.saveSystemAttachmentMessage(
        input.conversationId,
        attachment,
        buildCallLogFallbackText(attachment),
      );
      return {
        messageId: message.id,
        durationSec,
        endedReason: input.endedReason,
      };
    } catch (err) {
      this.logger.warn(
        `finalizeCall failed to persist call_log for ${input.conversationId}: ${
          (err as Error)?.message
        }`,
      );
      return { messageId: null, durationSec, endedReason: input.endedReason };
    }
  }

  private getVoiceAttachment(message?: Message): VoiceAttachment | undefined {
    return message?.attachment?.kind === 'voice'
      ? message.attachment
      : undefined;
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
    voicePreset?: string | null;
  }): Promise<{
    message: Message | null;
    synthesisDurationMs: number;
    provider?: string;
    failedReason?: 'tts_unavailable';
  }> {
    try {
      const synthesized = await this.ai.synthesizeSpeech({
        text: input.text,
        conversationId: input.conversationId,
        characterId: input.characterId,
        voice: input.voicePreset?.trim() || undefined,
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
    } catch (err) {
      // 三级兜底：MiniMax + OpenAI 双 provider 都挂时不要让通话整体 5xx；
      // assistantText 已经入库，前端识别 audioUrl=null 后只显文字气泡，
      // 通话继续。
      this.logger.warn(
        `voice-call TTS unavailable for character ${input.characterId}: ${
          (err as Error)?.message
        }`,
      );
      return {
        message: null,
        synthesisDurationMs: 0,
        failedReason: 'tts_unavailable',
      };
    }
  }
}

function parseStartedAt(iso: string): Date {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }
  return parsed;
}

function buildCallLogFallbackText(attachment: CallLogAttachment): string {
  const duration = formatCallLogDurationLabel(attachment.durationSec);
  const modeLabel = attachment.mode === 'video' ? '视频通话' : '语音通话';
  if (attachment.endedReason === 'timeout') {
    return `${modeLabel} · 已超时 ${duration}`;
  }
  if (attachment.endedReason === 'error') {
    return `${modeLabel} · 连接异常`;
  }
  if (attachment.endedReason === 'no_answer') {
    return `${modeLabel} · 未接通`;
  }
  return `${modeLabel} · 通话时长 ${duration}`;
}

function formatCallLogDurationLabel(durationSec: number): string {
  const safe = Math.max(0, Math.round(durationSec));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

function buildSpeechInstructions(characterName: string) {
  const normalizedName = characterName.trim() || VOICE_CALL_CURRENT_CHARACTER;
  return `${VOICE_CALL_TTS_INSTRUCTIONS_PREFIX}${normalizedName}${VOICE_CALL_TTS_INSTRUCTIONS_SUFFIX}`;
}
// i18n-ignore-end
