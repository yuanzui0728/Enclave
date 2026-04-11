import { Injectable } from '@nestjs/common';
import {
  buildMockDigitalHumanPlayerPage,
  type DigitalHumanPlayerPageSessionSnapshot,
} from './digital-human-player-page';

type MockDigitalHumanProviderMode = 'mock_stage' | 'mock_iframe';
type DigitalHumanProviderMode =
  | MockDigitalHumanProviderMode
  | 'external_iframe';

type ProviderSessionInput = {
  sessionId: string;
  conversationId?: string;
  characterId?: string;
  characterName?: string;
  posterUrl?: string;
};

type ProviderTurnInput = {
  sessionId: string;
  conversationId?: string;
  characterId?: string;
  characterName?: string;
  assistantAudioUrl: string;
  assistantText: string;
  assistantMessageId: string;
  posterUrl?: string;
};

type ProviderSessionPayload = {
  provider: 'mock_digital_human' | 'external_digital_human';
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
  private readonly mode: DigitalHumanProviderMode = this.resolveMode();

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

    if (this.mode === 'external_iframe') {
      return {
        provider: 'external_digital_human',
        presentationMode: 'provider_stream',
        transport: 'player_url',
        playerUrl: this.buildExternalPlayerUrl(input),
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
        conversationId: input.conversationId,
        characterId: input.characterId,
        characterName: input.characterName,
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

  private buildExternalPlayerUrl(input: ProviderSessionInput) {
    const template = process.env.DIGITAL_HUMAN_PLAYER_URL_TEMPLATE?.trim();
    if (!template) {
      return this.buildPlayerUrl(input.sessionId);
    }

    const callbackToken = this.resolveProviderCallbackToken();
    return template
      .replaceAll('{sessionId}', encodeURIComponent(input.sessionId))
      .replaceAll(
        '{conversationId}',
        encodeURIComponent(input.conversationId ?? ''),
      )
      .replaceAll('{characterId}', encodeURIComponent(input.characterId ?? ''))
      .replaceAll(
        '{characterName}',
        encodeURIComponent(input.characterName ?? ''),
      )
      .replaceAll(
        '{callbackUrl}',
        encodeURIComponent(this.buildProviderCallbackUrl(input.sessionId)),
      )
      .replaceAll(
        '{callbackToken}',
        encodeURIComponent(callbackToken ?? ''),
      );
  }

  private resolveMode(): DigitalHumanProviderMode {
    const mode = process.env.DIGITAL_HUMAN_PROVIDER_MODE?.trim();
    if (mode === 'mock_stage') {
      return 'mock_stage';
    }

    if (mode === 'external_iframe') {
      return 'external_iframe';
    }

    return 'mock_iframe';
  }

  private resolvePublicApiBaseUrl() {
    return (
      process.env.PUBLIC_API_BASE_URL?.trim() ||
      `http://localhost:${process.env.PORT ?? '3000'}`
    );
  }

  private buildProviderCallbackUrl(sessionId: string) {
    const url = new URL(
      `/api/chat/digital-human-calls/sessions/${sessionId}/provider-state`,
      this.resolvePublicApiBaseUrl(),
    );
    const callbackToken = this.resolveProviderCallbackToken();
    if (callbackToken) {
      url.searchParams.set('token', callbackToken);
    }

    return url.toString();
  }

  private resolveProviderCallbackToken() {
    return process.env.DIGITAL_HUMAN_PROVIDER_CALLBACK_TOKEN?.trim() || null;
  }
}
