import { Injectable } from '@nestjs/common';
import {
  buildMockDigitalHumanPlayerPage,
  type DigitalHumanPlayerPageSessionSnapshot,
} from './digital-human-player-page';

type MockDigitalHumanProviderMode = 'mock_stage' | 'mock_iframe';

type ProviderSessionInput = {
  sessionId: string;
  posterUrl?: string;
};

type ProviderTurnInput = {
  sessionId: string;
  assistantAudioUrl: string;
  assistantText: string;
  assistantMessageId: string;
  posterUrl?: string;
};

type ProviderSessionPayload = {
  provider: 'mock_digital_human';
  presentationMode: 'mock_stage' | 'provider_stream';
  transport: 'audio_poster' | 'player_url';
  playerUrl?: string;
  streamUrl?: string;
  posterUrl?: string;
  renderStatus: 'queued' | 'ready';
  capabilities: {
    supportsRealtimeStream: false;
    supportsInterrupt: false;
    supportsSubtitle: true;
  };
};

type ProviderTurnPayload = {
  renderStatus: 'ready';
} & ProviderSessionPayload;

export interface DigitalHumanProviderAdapter {
  createSession(input: ProviderSessionInput): ProviderSessionPayload;
  prepareTurn(input: ProviderTurnInput): ProviderTurnPayload;
  renderPlayerPage(input: {
    sessionId: string;
    characterName: string;
    initialSession?: DigitalHumanPlayerPageSessionSnapshot;
  }): string;
}

@Injectable()
export class MockDigitalHumanProviderAdapter
  implements DigitalHumanProviderAdapter
{
  private readonly mode: MockDigitalHumanProviderMode =
    process.env.DIGITAL_HUMAN_PROVIDER_MODE?.trim() === 'mock_stage'
      ? 'mock_stage'
      : 'mock_iframe';

  createSession(input: ProviderSessionInput): ProviderSessionPayload {
    if (this.mode === 'mock_stage') {
      return {
        provider: 'mock_digital_human',
        presentationMode: 'mock_stage',
        transport: 'audio_poster',
        playerUrl: undefined,
        streamUrl: undefined,
        posterUrl: input.posterUrl,
        renderStatus: 'queued',
        capabilities: {
          supportsRealtimeStream: false,
          supportsInterrupt: false,
          supportsSubtitle: true,
        },
      };
    }

    return {
      provider: 'mock_digital_human',
      presentationMode: 'provider_stream',
      transport: 'player_url',
      playerUrl: this.buildPlayerUrl(input.sessionId),
      streamUrl: undefined,
      posterUrl: input.posterUrl,
      renderStatus: 'queued',
      capabilities: {
        supportsRealtimeStream: false,
        supportsInterrupt: false,
        supportsSubtitle: true,
      },
    };
  }

  prepareTurn(input: ProviderTurnInput): ProviderTurnPayload {
    return {
      ...this.createSession({
        sessionId: input.sessionId,
        posterUrl: input.posterUrl,
      }),
      renderStatus: 'ready',
    };
  }

  renderPlayerPage(input: {
    sessionId: string;
    characterName: string;
    initialSession?: DigitalHumanPlayerPageSessionSnapshot;
  }) {
    return buildMockDigitalHumanPlayerPage({
      characterName: input.characterName,
      initialSession: input.initialSession,
    });
  }

  private buildPlayerUrl(sessionId: string) {
    return `${this.resolvePublicApiBaseUrl()}/api/chat/digital-human-calls/sessions/${sessionId}/player`;
  }

  private resolvePublicApiBaseUrl() {
    return (
      process.env.PUBLIC_API_BASE_URL?.trim() ||
      `http://localhost:${process.env.PORT ?? '3000'}`
    );
  }
}
