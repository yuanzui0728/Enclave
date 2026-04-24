import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CharactersService } from '../characters/characters.service';
import { ChatService } from './chat.service';
import { MockDigitalHumanProviderAdapter } from './digital-human-provider';
import { VoiceCallsService } from './voice-calls.service';

type UploadedAudioFile = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size: number;
};

type DigitalHumanCallMode = 'desktop_video_call' | 'mobile_video_call';
type DigitalHumanSessionStatus = 'ready' | 'playing' | 'ended';
type DigitalHumanRenderStatus = 'queued' | 'rendering' | 'ready' | 'failed';

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
  provider: 'mock_digital_human' | 'external_digital_human';
  presentationMode: 'mock_stage' | 'provider_stream';
  transport: 'audio_poster' | 'player_url' | 'stream_url';
  playerUrl?: string;
  streamUrl?: string;
  posterUrl?: string;
  renderStatus: DigitalHumanRenderStatus;
  status: DigitalHumanSessionStatus;
  createdAt: string;
  updatedAt: string;
  lastTurn?: DigitalHumanTurnResult;
};

@Injectable()
export class DigitalHumanCallsService {
  private readonly sessions = new Map<string, DigitalHumanSessionRecord>();
  private readonly subscribers = new Map<
    string,
    Set<(payload: ReturnType<DigitalHumanCallsService['getSession']>) => void>
  >();

  constructor(
    private readonly chatService: ChatService,
    private readonly voiceCallsService: VoiceCallsService,
    private readonly charactersService: CharactersService,
    private readonly digitalHumanProvider: MockDigitalHumanProviderAdapter,
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
    const sessionId = randomUUID();
    const providerSession = await this.digitalHumanProvider.createSession({
      sessionId,
      conversationId: conversation.id,
      characterId,
      characterName: character.name,
      posterUrl: character.avatar || undefined,
    });
    const session: DigitalHumanSessionRecord = {
      id: sessionId,
      conversationId: conversation.id,
      characterId,
      characterName: character.name,
      characterAvatar: character.avatar || undefined,
      mode: input.mode ?? 'desktop_video_call',
      provider: providerSession.provider,
      presentationMode: providerSession.presentationMode,
      transport: providerSession.transport,
      playerUrl: providerSession.playerUrl,
      streamUrl: providerSession.streamUrl,
      posterUrl: providerSession.posterUrl,
      renderStatus: providerSession.renderStatus,
      status: 'ready',
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(session.id, session);
    this.emitSessionUpdate(session.id);

    return this.serializeSession(session);
  }

  getSession(sessionId: string) {
    return this.serializeSession(this.requireSession(sessionId));
  }

  updateProviderState(
    sessionId: string,
    input: {
      renderStatus: DigitalHumanRenderStatus;
      status?: DigitalHumanSessionStatus;
      playerUrl?: string;
      streamUrl?: string;
      posterUrl?: string;
    },
  ) {
    const session = this.requireSession(sessionId);
    session.renderStatus = input.renderStatus;

    if (input.status) {
      session.status = input.status;
    }

    if (typeof input.posterUrl === 'string') {
      session.posterUrl = input.posterUrl || undefined;
    }

    if (typeof input.playerUrl === 'string') {
      session.playerUrl = input.playerUrl || undefined;
      if (session.playerUrl) {
        session.presentationMode = 'provider_stream';
        session.transport = 'player_url';
      }
    }

    if (typeof input.streamUrl === 'string') {
      session.streamUrl = input.streamUrl || undefined;
      if (session.streamUrl) {
        session.presentationMode = 'provider_stream';
        session.transport = 'stream_url';
      }
    }

    session.updatedAt = new Date().toISOString();
    this.sessions.set(session.id, session);
    this.emitSessionUpdate(session.id);
    return this.serializeSession(session);
  }

  closeSession(sessionId: string) {
    const session = this.requireSession(sessionId);
    session.status = 'ended';
    session.updatedAt = new Date().toISOString();
    this.sessions.set(session.id, session);
    this.emitSessionUpdate(session.id);
    return this.serializeSession(session);
  }

  async createTurn(
    sessionId: string,
    file: UploadedAudioFile,
    input?: { durationMs?: number },
  ) {
    const session = this.requireSession(sessionId);
    if (session.status === 'ended') {
      throw new NotFoundException('当前数字人通话已结束，请重新发起。');
    }

    session.status = 'playing';
    session.renderStatus = 'rendering';
    session.updatedAt = new Date().toISOString();
    this.sessions.set(session.id, session);
    this.emitSessionUpdate(session.id);

    const turn = await this.voiceCallsService.createTurn(file, {
      conversationId: session.conversationId,
      characterId: session.characterId,
      durationMs: input?.durationMs,
    });
    const providerTurn = await this.digitalHumanProvider.prepareTurn({
      sessionId: session.id,
      conversationId: session.conversationId,
      characterId: session.characterId,
      characterName: session.characterName,
      assistantAudioUrl: turn.assistantAudioUrl,
      assistantText: turn.assistantText,
      assistantMessageId: turn.assistantMessageId,
      posterUrl: session.posterUrl,
    });

    session.lastTurn = turn;
    session.status = 'playing';
    session.presentationMode = providerTurn.presentationMode;
    session.transport = providerTurn.transport;
    session.playerUrl = providerTurn.playerUrl;
    session.streamUrl = providerTurn.streamUrl;
    session.posterUrl = providerTurn.posterUrl;
    session.renderStatus = providerTurn.renderStatus;
    session.updatedAt = new Date().toISOString();
    this.sessions.set(session.id, session);
    this.emitSessionUpdate(session.id);

    return {
      session: this.serializeSession(session),
      turn,
      renderStatus: providerTurn.renderStatus satisfies DigitalHumanRenderStatus,
    };
  }

  renderPlayerPage(sessionId: string) {
    const session = this.requireSession(sessionId);
    return this.digitalHumanProvider.renderPlayerPage({
      sessionId: session.id,
      characterName: session.characterName,
      initialSession: this.serializeSession(session),
    });
  }

  subscribeSession(
    sessionId: string,
    listener: (payload: ReturnType<DigitalHumanCallsService['getSession']>) => void,
  ) {
    this.requireSession(sessionId);
    const listeners = this.subscribers.get(sessionId) ?? new Set();
    listeners.add(listener);
    this.subscribers.set(sessionId, listeners);

    return () => {
      const current = this.subscribers.get(sessionId);
      if (!current) {
        return;
      }

      current.delete(listener);
      if (!current.size) {
        this.subscribers.delete(sessionId);
      }
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
      playerUrl: session.playerUrl,
      streamUrl: session.streamUrl,
      posterUrl: session.posterUrl,
      renderStatus: session.renderStatus,
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

  private emitSessionUpdate(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    const listeners = this.subscribers.get(sessionId);
    if (!listeners?.size) {
      return;
    }

    const payload = this.serializeSession(session);
    for (const listener of listeners) {
      listener(payload);
    }
  }
}
