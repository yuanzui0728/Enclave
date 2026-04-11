import { Injectable } from '@nestjs/common';
import { SystemConfigService } from '../config/config.service';
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
  createSession(input: ProviderSessionInput): Promise<ProviderSessionPayload>;
  prepareTurn(input: ProviderTurnInput): Promise<ProviderTurnPayload>;
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
  constructor(private readonly systemConfigService: SystemConfigService) {}

  async createSession(
    input: ProviderSessionInput,
  ): Promise<ProviderSessionPayload> {
    const mode = await this.resolveMode();
    if (mode === 'mock_stage') {
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

    if (mode === 'external_iframe') {
      return {
        provider: 'external_digital_human',
        presentationMode: 'provider_stream',
        transport: 'player_url',
        playerUrl: await this.buildExternalPlayerUrl(input),
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

  async prepareTurn(input: ProviderTurnInput): Promise<ProviderTurnPayload> {
    return {
      ...(await this.createSession({
        sessionId: input.sessionId,
        conversationId: input.conversationId,
        characterId: input.characterId,
        characterName: input.characterName,
        posterUrl: input.posterUrl,
      })),
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

  private async buildExternalPlayerUrl(input: ProviderSessionInput) {
    const template = await this.resolvePlayerUrlTemplate();
    if (!template) {
      return this.buildPlayerUrl(input.sessionId);
    }

    const callbackToken = await this.resolveProviderCallbackToken();
    const replacements = {
      sessionId: input.sessionId,
      conversationId: input.conversationId ?? '',
      characterId: input.characterId ?? '',
      characterName: input.characterName ?? '',
      callbackUrl: await this.buildProviderCallbackUrl(input.sessionId),
      callbackToken: callbackToken ?? '',
      ...(await this.resolveTemplateParams()),
    } satisfies Record<string, string>;

    let resolved = template;
    for (const [key, value] of Object.entries(replacements)) {
      resolved = resolved.replaceAll(
        `{${key}}`,
        encodeURIComponent(value ?? ''),
      );
    }

    return resolved;
  }

  private async resolveMode(): Promise<DigitalHumanProviderMode> {
    const mode = (
      (await this.systemConfigService.getConfig('digital_human_provider_mode')) ??
      process.env.DIGITAL_HUMAN_PROVIDER_MODE
    )?.trim();
    if (mode === 'mock_stage') {
      return 'mock_stage';
    }

    if (mode === 'external_iframe') {
      return 'external_iframe';
    }

    return 'mock_iframe';
  }

  private async resolvePlayerUrlTemplate() {
    return (
      (await this.systemConfigService.getConfig(
        'digital_human_player_url_template',
      )) ??
      process.env.DIGITAL_HUMAN_PLAYER_URL_TEMPLATE
    )?.trim();
  }

  private async resolveTemplateParams() {
    const rawValue = await this.systemConfigService.getConfig(
      'digital_human_provider_params',
    );
    if (!rawValue?.trim()) {
      return {};
    }

    try {
      const parsed = JSON.parse(rawValue) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(parsed)
          .filter(([key]) => key.trim().length > 0)
          .map(([key, value]) => [key, value == null ? '' : String(value)]),
      );
    } catch {
      return {};
    }
  }

  private resolvePublicApiBaseUrl() {
    return (
      process.env.PUBLIC_API_BASE_URL?.trim() ||
      `http://localhost:${process.env.PORT ?? '3000'}`
    );
  }

  private async buildProviderCallbackUrl(sessionId: string) {
    const url = new URL(
      `/api/chat/digital-human-calls/sessions/${sessionId}/provider-state`,
      this.resolvePublicApiBaseUrl(),
    );
    const callbackToken = await this.resolveProviderCallbackToken();
    if (callbackToken) {
      url.searchParams.set('token', callbackToken);
    }

    return url.toString();
  }

  private async resolveProviderCallbackToken() {
    return (
      (await this.systemConfigService.getConfig(
        'digital_human_provider_callback_token',
      )) ??
      process.env.DIGITAL_HUMAN_PROVIDER_CALLBACK_TOKEN
    )?.trim() || null;
  }
}
