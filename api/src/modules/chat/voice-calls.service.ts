import { Injectable, NotFoundException } from '@nestjs/common';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { AiSpeechAssetsService } from '../ai/ai-speech-assets.service';
import { CharactersService } from '../characters/characters.service';
import { ChatService } from './chat.service';

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
    input: { conversationId: string; characterId?: string },
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
      throw new NotFoundException('当前只支持单聊语言通话。');
    }

    const characterId = conversation.participants[0];
    if (input.characterId && input.characterId !== characterId) {
      throw new NotFoundException('当前会话与目标角色不匹配。');
    }

    const character = await this.characters.findById(characterId);
    if (!character) {
      throw new NotFoundException(`Character ${characterId} not found`);
    }

    const transcription = await this.ai.transcribeAudio(file, {
      conversationId: conversation.id,
      characterId,
      mode: 'voice_call',
    });
    const messages = await this.chatService.sendMessage(conversation.id, {
      type: 'text',
      text: transcription.text,
    });
    const userMessage = messages.find(
      (message) => message.senderType === 'user',
    );
    const assistantMessage = messages.find(
      (message) =>
        message.senderType === 'character' && message.senderId === characterId,
    );

    if (!userMessage || !assistantMessage) {
      throw new NotFoundException('本轮语言通话未生成完整消息。');
    }

    const synthesized = await this.ai.synthesizeSpeech({
      text: assistantMessage.text,
      conversationId: conversation.id,
      characterId,
      instructions: buildSpeechInstructions(character.name),
    });
    const asset = await this.speechAssets.saveGeneratedSpeech(
      synthesized.buffer,
      {
        mimeType: synthesized.mimeType,
        fileExtension: synthesized.fileExtension,
        baseName: `voice-call-${characterId}`,
      },
    );

    return {
      conversationId: conversation.id,
      characterId,
      characterName: character.name,
      userTranscript: transcription.text,
      assistantText: assistantMessage.text,
      assistantAudioUrl: asset.audioUrl,
      assistantAudioFileName: asset.fileName,
      assistantAudioMimeType: asset.mimeType,
      transcriptionDurationMs: transcription.durationMs,
      synthesisDurationMs: synthesized.durationMs,
      totalDurationMs: Date.now() - startedAt,
      provider: synthesized.provider || transcription.provider,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
    };
  }
}

function buildSpeechInstructions(characterName: string) {
  const normalizedName = characterName.trim() || '当前角色';
  return `请用自然、口语化、适合手机语音通话的中文播报，语速平稳，不要读出标点。说话人是${normalizedName}。`;
}
