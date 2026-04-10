import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CharactersService } from '../characters/characters.service';
import { ChatService } from './chat.service';
import { VoiceCallsService } from './voice-calls.service';

type UploadedAudioFile = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size: number;
};

type DigitalHumanCallMode = 'desktop_video_call' | 'mobile_video_call';
type DigitalHumanProvider = 'mock_digital_human';
type DigitalHumanPresentationMode = 'mock_stage' | 'provider_stream';
type DigitalHumanCallTransport = 'audio_poster';
type DigitalHumanSessionStatus = 'ready' | 'playing' | 'ended';
type DigitalHumanRenderStatus = 'ready';

type DigitalHumanTurnResult = Awaited<
  ReturnType<VoiceCallsService['createTurn']>
>;

type DigitalHumanSessionRecord = {
  id: string;
  conversationId: string;
  characterId: string;
  characterName: string;
  characterAvatar?: string;
  mode: DigitalHumanCallMode;
  provider: DigitalHumanProvider;
  presentationMode: DigitalHumanPresentationMode;
  transport: DigitalHumanCallTransport;
  streamUrl?: string;
  posterUrl?: string;
  status: DigitalHumanSessionStatus;
  createdAt: string;
  updatedAt: string;
  lastTurn?: DigitalHumanTurnResult;
};

@Injectable()
export class DigitalHumanCallsService {
  private readonly sessions = new Map<string, DigitalHumanSessionRecord>();

  constructor(
    private readonly chatService: ChatService,
    private readonly voiceCallsService: VoiceCallsService,
    private readonly charactersService: CharactersService,
  ) {}

  async createSession(input: {
    conversationId: string;
    characterId?: string;
    mode?: DigitalHumanCallMode;
  }) {
    const conversation = await this.chatService.getConversation(
      input.conversationId,
    );
    if (!conversation) {
      throw new NotFoundException(
        `Conversation ${input.conversationId} not found`,
      );
    }

    if (conversation.type !== 'direct') {
      throw new NotFoundException('当前只支持单聊 AI 数字人视频通话。');
    }

    const characterId = conversation.participants[0];
    if (input.characterId && input.characterId !== characterId) {
      throw new NotFoundException('当前会话与目标角色不匹配。');
    }

    const character = await this.charactersService.findById(characterId);
    if (!character) {
      throw new NotFoundException(`Character ${characterId} not found`);
    }

    const now = new Date().toISOString();
    const session: DigitalHumanSessionRecord = {
      id: randomUUID(),
      conversationId: conversation.id,
      characterId,
      characterName: character.name,
      characterAvatar: character.avatar || undefined,
      mode: input.mode ?? 'desktop_video_call',
      provider: 'mock_digital_human',
      presentationMode: 'mock_stage',
      transport: 'audio_poster',
      streamUrl: undefined,
      posterUrl: character.avatar || undefined,
      status: 'ready',
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(session.id, session);

    return this.serializeSession(session);
  }

  getSession(sessionId: string) {
    return this.serializeSession(this.requireSession(sessionId));
  }

  closeSession(sessionId: string) {
    const session = this.requireSession(sessionId);
    session.status = 'ended';
    session.updatedAt = new Date().toISOString();
    this.sessions.set(session.id, session);
    return this.serializeSession(session);
  }

  async createTurn(sessionId: string, file: UploadedAudioFile) {
    const session = this.requireSession(sessionId);
    if (session.status === 'ended') {
      throw new NotFoundException('当前数字人通话已结束，请重新发起。');
    }

    const turn = await this.voiceCallsService.createTurn(file, {
      conversationId: session.conversationId,
      characterId: session.characterId,
    });

    session.lastTurn = turn;
    session.status = 'playing';
    session.updatedAt = new Date().toISOString();
    this.sessions.set(session.id, session);

    return {
      session: this.serializeSession(session),
      turn,
      renderStatus: 'ready' satisfies DigitalHumanRenderStatus,
    };
  }

  private requireSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(`Digital human session ${sessionId} not found`);
    }

    return session;
  }

  private serializeSession(session: DigitalHumanSessionRecord) {
    return {
      id: session.id,
      conversationId: session.conversationId,
      characterId: session.characterId,
      characterName: session.characterName,
      characterAvatar: session.characterAvatar,
      mode: session.mode,
      provider: session.provider,
      presentationMode: session.presentationMode,
      transport: session.transport,
      streamUrl: session.streamUrl,
      posterUrl: session.posterUrl,
      status: session.status,
      capabilities: {
        supportsRealtimeStream: false,
        supportsInterrupt: false,
        supportsSubtitle: true,
      },
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      lastTurn: session.lastTurn,
    };
  }
}
