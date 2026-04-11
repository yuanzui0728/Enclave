import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import OpenAI, { toFile } from 'openai';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { UserEntity } from '../auth/user.entity';
import { CharacterEntity } from '../characters/character.entity';
import { NarrativeArcEntity } from '../narrative/narrative-arc.entity';
import { AIBehaviorLogEntity } from '../analytics/ai-behavior-log.entity';
import { SystemConfigService } from '../config/config.service';
import { resolveDatabasePath, resolveRepoPath } from '../../database/database-path';
import { SchedulerService } from '../scheduler/scheduler.service';
import { SchedulerTelemetryService } from '../scheduler/scheduler-telemetry.service';

type ProviderPayload = {
  endpoint: string;
  model: string;
  apiKey?: string;
  mode?: string;
  apiStyle?: string;
  transcriptionEndpoint?: string;
  transcriptionModel?: string;
  transcriptionApiKey?: string;
};

type DigitalHumanProviderMode =
  | 'mock_stage'
  | 'mock_iframe'
  | 'external_iframe';

const DEFAULT_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe';

function normalizeProviderEndpoint(value: string) {
  const normalized = value.trim().replace(/\/+$/, '');
  if (normalized.endsWith('/chat/completions')) {
    return normalized.slice(0, -'/chat/completions'.length);
  }
  if (normalized.endsWith('/responses')) {
    return normalized.slice(0, -'/responses'.length);
  }

  return normalized;
}

function extractErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Provider connection failed.';
}

function resolveAppMode() {
  return process.env.NODE_ENV === 'production' ? 'production' : 'development';
}

function normalizeDigitalHumanMode(value?: string | null): DigitalHumanProviderMode {
  if (value === 'mock_stage') {
    return 'mock_stage';
  }

  if (value === 'external_iframe') {
    return 'external_iframe';
  }

  return 'mock_iframe';
}

function createSpeechProbeAudioBuffer() {
  const sampleRate = 16000;
  const durationSeconds = 0.4;
  const frameCount = Math.floor(sampleRate * durationSeconds);
  const channelCount = 1;
  const bitsPerSample = 16;
  const blockAlign = (channelCount * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = frameCount * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channelCount, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < frameCount; index += 1) {
    const time = index / sampleRate;
    const envelope = Math.min(1, index / 800, (frameCount - index) / 800);
    const sample = Math.round(
      Math.sin(2 * Math.PI * 440 * time) * 0.25 * envelope * 32767,
    );
    buffer.writeInt16LE(sample, 44 + index * 2);
  }

  return buffer;
}

@Injectable()
export class SystemService {
  constructor(
    private readonly config: ConfigService,
    private readonly systemConfig: SystemConfigService,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(NarrativeArcEntity)
    private readonly narrativeArcRepo: Repository<NarrativeArcEntity>,
    @InjectRepository(AIBehaviorLogEntity)
    private readonly behaviorLogRepo: Repository<AIBehaviorLogEntity>,
    private readonly schedulerService: SchedulerService,
    private readonly schedulerTelemetry: SchedulerTelemetryService,
  ) {}

  private resolveDatabasePath() {
    return resolveDatabasePath(this.config.get<string>('DATABASE_PATH'));
  }

  private async resolveProviderConfig() {
    const endpoint =
      (await this.systemConfig.getConfig('provider_endpoint')) ??
      this.config.get<string>('OPENAI_BASE_URL') ??
      'https://api.deepseek.com';
    const model =
      (await this.systemConfig.getConfig('provider_model')) ??
      this.config.get<string>('AI_MODEL') ??
      'deepseek-chat';
    const apiKey =
      (await this.systemConfig.getConfig('provider_api_key')) ??
      this.config.get<string>('DEEPSEEK_API_KEY') ??
      '';
    const mode = (await this.systemConfig.getConfig('provider_mode')) ?? 'cloud';
    const apiStyle =
      (await this.systemConfig.getConfig('provider_api_style')) ?? 'openai-chat-completions';
    const transcriptionEndpoint =
      (await this.systemConfig.getConfig('provider_transcription_endpoint')) ?? '';
    const transcriptionModel =
      (await this.systemConfig.getConfig('provider_transcription_model')) ?? '';
    const transcriptionApiKey =
      (await this.systemConfig.getConfig('provider_transcription_api_key')) ?? '';

    return {
      endpoint: normalizeProviderEndpoint(endpoint),
      model,
      apiKey,
      mode,
      apiStyle,
      transcriptionEndpoint: transcriptionEndpoint
        ? normalizeProviderEndpoint(transcriptionEndpoint)
        : undefined,
      transcriptionModel: transcriptionModel || undefined,
      transcriptionApiKey: transcriptionApiKey || undefined,
    };
  }

  private createProviderClient(payload: ProviderPayload) {
    return new OpenAI({
      apiKey: payload.apiKey,
      baseURL: normalizeProviderEndpoint(payload.endpoint),
    });
  }

  private async resolveDigitalHumanConfig() {
    const mode = normalizeDigitalHumanMode(
      (await this.systemConfig.getConfig('digital_human_provider_mode')) ??
        this.config.get<string>('DIGITAL_HUMAN_PROVIDER_MODE'),
    );
    const playerUrlTemplate =
      (
        await this.systemConfig.getConfig('digital_human_player_url_template')
      )?.trim() ||
      this.config.get<string>('DIGITAL_HUMAN_PLAYER_URL_TEMPLATE')?.trim() ||
      '';
    const callbackToken =
      (
        await this.systemConfig.getConfig(
          'digital_human_provider_callback_token',
        )
      )?.trim() ||
      this.config.get<string>('DIGITAL_HUMAN_PROVIDER_CALLBACK_TOKEN')?.trim() ||
      '';
    const rawParams =
      (await this.systemConfig.getConfig('digital_human_provider_params'))?.trim() ||
      '';

    let paramsValid = true;
    let paramsKeys: string[] = [];
    if (rawParams) {
      try {
        const parsed = JSON.parse(rawParams) as Record<string, unknown>;
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
          paramsValid = false;
        } else {
          paramsKeys = Object.keys(parsed);
        }
      } catch {
        paramsValid = false;
      }
    }

    const playerTemplateConfigured = Boolean(playerUrlTemplate);
    const ready =
      mode === 'external_iframe'
        ? playerTemplateConfigured && paramsValid
        : true;

    return {
      mode,
      provider:
        mode === 'external_iframe'
          ? ('external_digital_human' as const)
          : ('mock_digital_human' as const),
      ready,
      playerTemplateConfigured,
      callbackTokenConfigured: Boolean(callbackToken),
      paramsValid,
      paramsCount: paramsKeys.length,
      paramsKeys,
      message: !playerTemplateConfigured && mode === 'external_iframe'
        ? '当前已切到外部 iframe 模式，但播放器模板还未配置。'
        : !paramsValid
          ? '数字人扩展参数 JSON 不合法。'
          : mode === 'external_iframe'
            ? '数字人 provider 已具备外部 iframe 联调条件。'
            : mode === 'mock_stage'
              ? '当前仍使用内置数字人舞台。'
              : '当前使用内置数字人 iframe 播放页。',
    };
  }

  private async testChatProviderConnection(payload: ProviderPayload) {
    const client = this.createProviderClient(payload);
    await client.chat.completions.create({
      model: payload.model,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
      temperature: 0,
    });
  }

  private async testTranscriptionProviderConnection(payload: {
    endpoint: string;
    apiKey: string;
    model: string;
  }) {
    const client = this.createProviderClient({
      endpoint: payload.endpoint,
      model: payload.model,
      apiKey: payload.apiKey,
    });
    await client.audio.transcriptions.create({
      file: await toFile(createSpeechProbeAudioBuffer(), 'speech-probe.wav', {
        type: 'audio/wav',
      }),
      model: payload.model,
      language: 'zh',
      prompt: '这是一段用于连通性探测的短音频。',
    });
  }

  async getStatus() {
    const [ownerCount, charactersCount, narrativeArcsCount, behaviorLogsCount, providerConfig, digitalHumanConfig] =
      await Promise.all([
        this.userRepo.count(),
        this.characterRepo.count(),
        this.narrativeArcRepo.count(),
        this.behaviorLogRepo.count(),
        this.resolveProviderConfig(),
        this.resolveDigitalHumanConfig(),
      ]);

    const databasePath = this.resolveDatabasePath();
    const publicBaseUrl = this.config.get<string>('PUBLIC_API_BASE_URL')?.trim();

    const scheduler = await this.getSchedulerPayload();
    const hasDedicatedTranscriptionProvider = Boolean(
      providerConfig.transcriptionEndpoint ||
        providerConfig.transcriptionModel ||
        providerConfig.transcriptionApiKey,
    );
    const activeTranscriptionProvider =
      providerConfig.transcriptionModel || DEFAULT_TRANSCRIPTION_MODEL;
    const speechReady = Boolean(
      providerConfig.transcriptionApiKey || providerConfig.apiKey,
    );

    return {
      coreApi: {
        name: 'core-api',
        healthy: true,
        version: process.env.npm_package_version ?? '0.0.0',
        message: publicBaseUrl
          ? `Serving remote clients from ${publicBaseUrl}`
          : 'Serving remote clients from the configured host.',
      },
      desktopShell: {
        name: 'desktop-shell',
        healthy: true,
        version: 'remote-connected',
        message: 'Desktop clients connect to this Core API remotely.',
      },
      database: {
        path: databasePath,
        walEnabled: false,
        connected: true,
      },
      inferenceGateway: {
        healthy: Boolean(providerConfig.model),
        activeProvider: providerConfig.model || undefined,
        activeTranscriptionProvider,
        transcriptionMode: hasDedicatedTranscriptionProvider
          ? 'dedicated'
          : 'fallback',
        speechReady,
        speechMessage: speechReady
          ? hasDedicatedTranscriptionProvider
            ? '语音转写走独立网关。'
            : '语音转写跟随主推理服务。'
          : '当前缺少可用语音转写密钥。',
        queueDepth: 0,
        maxConcurrency: 1,
        inFlightRequests: 0,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
      },
      digitalHumanGateway: {
        healthy: digitalHumanConfig.ready,
        mode: digitalHumanConfig.mode,
        provider: digitalHumanConfig.provider,
        ready: digitalHumanConfig.ready,
        playerTemplateConfigured: digitalHumanConfig.playerTemplateConfigured,
        callbackTokenConfigured: digitalHumanConfig.callbackTokenConfigured,
        paramsValid: digitalHumanConfig.paramsValid,
        paramsCount: digitalHumanConfig.paramsCount,
        paramsKeys: digitalHumanConfig.paramsKeys,
        message: digitalHumanConfig.message,
      },
      worldSurface: {
        apiPrefix: '/api',
        migratedModules: ['config', 'characters', 'world', 'social', 'chat', 'moments', 'feed'],
        ownerCount,
        charactersCount,
        narrativeArcsCount,
        behaviorLogsCount,
      },
      scheduler,
      appMode: resolveAppMode(),
    };
  }

  async getSchedulerStatus() {
    return this.getSchedulerPayload();
  }

  async runSchedulerJob(id: string) {
    return this.schedulerService.runJobNow(id);
  }

  private async getSchedulerPayload() {
    return {
      healthy: true,
      mode: 'production' as const,
      coldStartEnabled: false,
      worldSnapshots: this.schedulerTelemetry.getWorldSnapshotCount(),
      lastWorldSnapshotAt: this.schedulerTelemetry.getLastWorldSnapshotAt(),
      jobs: await this.schedulerTelemetry.listJobs(),
      startedAt: this.schedulerTelemetry.getStartedAt(),
      recentRuns: this.schedulerTelemetry.listRecentRuns({ limit: 12 }),
    };
  }

  getRealtimeStatus() {
    return {
      healthy: true,
      namespace: '/chat',
      socketPath: '/socket.io',
      connectedClients: 0,
      activeRooms: 0,
      eventNames: ['join_conversation', 'send_message', 'new_message', 'typing_start', 'typing_stop'],
      rooms: [],
      recentEvents: [],
    };
  }

  async getProviderConfig() {
    const provider = await this.resolveProviderConfig();
    return {
      endpoint: provider.endpoint,
      model: provider.model,
      apiKey: provider.apiKey || undefined,
      mode: provider.mode,
      apiStyle: provider.apiStyle,
      transcriptionEndpoint: provider.transcriptionEndpoint,
      transcriptionModel: provider.transcriptionModel,
      transcriptionApiKey: provider.transcriptionApiKey,
    };
  }

  async setProviderConfig(payload: ProviderPayload) {
    const nextConfig = {
      endpoint: normalizeProviderEndpoint(payload.endpoint),
      model: payload.model.trim(),
      apiKey: payload.apiKey?.trim() ?? '',
      mode: payload.mode === 'local-compatible' ? 'local-compatible' : 'cloud',
      apiStyle: payload.apiStyle === 'openai-responses' ? 'openai-responses' : 'openai-chat-completions',
      transcriptionEndpoint: payload.transcriptionEndpoint?.trim()
        ? normalizeProviderEndpoint(payload.transcriptionEndpoint)
        : '',
      transcriptionModel: payload.transcriptionModel?.trim() ?? '',
      transcriptionApiKey: payload.transcriptionApiKey?.trim() ?? '',
    };

    await Promise.all([
      this.systemConfig.setConfig('provider_endpoint', nextConfig.endpoint),
      this.systemConfig.setConfig('provider_model', nextConfig.model),
      this.systemConfig.setConfig('provider_api_key', nextConfig.apiKey),
      this.systemConfig.setConfig('provider_mode', nextConfig.mode),
      this.systemConfig.setConfig('provider_api_style', nextConfig.apiStyle),
      this.systemConfig.setConfig(
        'provider_transcription_endpoint',
        nextConfig.transcriptionEndpoint,
      ),
      this.systemConfig.setConfig(
        'provider_transcription_model',
        nextConfig.transcriptionModel,
      ),
      this.systemConfig.setConfig(
        'provider_transcription_api_key',
        nextConfig.transcriptionApiKey,
      ),
      this.systemConfig.setAiModel(nextConfig.model),
    ]);

    return {
      endpoint: nextConfig.endpoint,
      model: nextConfig.model,
      apiKey: nextConfig.apiKey || undefined,
      mode: nextConfig.mode,
      apiStyle: nextConfig.apiStyle,
      transcriptionEndpoint: nextConfig.transcriptionEndpoint || undefined,
      transcriptionModel: nextConfig.transcriptionModel || undefined,
      transcriptionApiKey: nextConfig.transcriptionApiKey || undefined,
    };
  }

  async testProviderConnection(payload: ProviderPayload) {
    const normalizedEndpoint = normalizeProviderEndpoint(payload.endpoint);
    const normalizedTranscriptionEndpoint = payload.transcriptionEndpoint?.trim()
      ? normalizeProviderEndpoint(payload.transcriptionEndpoint)
      : undefined;
    const transcriptionApiKey =
      payload.transcriptionApiKey?.trim() || payload.apiKey?.trim() || '';

    try {
      await this.testChatProviderConnection({
        ...payload,
        endpoint: normalizedEndpoint,
      });
    } catch (error) {
      return {
        success: false,
        message: `主推理服务连接失败：${extractErrorMessage(error)}`,
        normalizedEndpoint,
        normalizedTranscriptionEndpoint,
      };
    }

    if (normalizedTranscriptionEndpoint) {
      try {
        await this.testTranscriptionProviderConnection({
          endpoint: normalizedTranscriptionEndpoint,
          apiKey: transcriptionApiKey,
          model: payload.transcriptionModel?.trim() || DEFAULT_TRANSCRIPTION_MODEL,
        });
      } catch (error) {
        return {
          success: false,
          message: `独立语音转写网关连接失败：${extractErrorMessage(error)}`,
          normalizedEndpoint,
          normalizedTranscriptionEndpoint,
        };
      }
    }

    return {
      success: true,
      message: normalizedTranscriptionEndpoint
        ? '主推理服务与独立语音转写网关均可连通。'
        : '主推理服务连通成功。',
      normalizedEndpoint,
      normalizedTranscriptionEndpoint,
      statusCode: 200,
    };
  }

  async runInferencePreview(payload: { prompt: string; model?: string; systemPrompt?: string }) {
    const providerConfig = await this.resolveProviderConfig();
    const client = this.createProviderClient(providerConfig);

    try {
      const response = await client.chat.completions.create({
        model: payload.model?.trim() || providerConfig.model,
        messages: [
          ...(payload.systemPrompt?.trim()
            ? [{ role: 'system' as const, content: payload.systemPrompt.trim() }]
            : []),
          { role: 'user' as const, content: payload.prompt.trim() },
        ],
        max_tokens: 256,
        temperature: 0.2,
      });

      return {
        success: true,
        output: response.choices[0]?.message?.content ?? '',
        model: response.model,
        finishReason: response.choices[0]?.finish_reason ?? undefined,
        usage: {
          promptTokens: response.usage?.prompt_tokens,
          completionTokens: response.usage?.completion_tokens,
          totalTokens: response.usage?.total_tokens,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Inference preview failed.',
      };
    }
  }

  getSystemLogs() {
    return [] as string[];
  }

  getEvalOverview() {
    return {
      datasetCount: 0,
      runCount: 0,
      traceCount: 0,
      fallbackTraceCount: 0,
      failedRunCount: 0,
    };
  }

  async exportDiagnostics() {
    const databasePath = this.resolveDatabasePath();
    return {
      success: true,
      message: `Diagnostics export is scaffolded. Database path: ${databasePath}`,
    };
  }

  async createBackup() {
    const sourcePath = this.resolveDatabasePath();
    const backupDir = resolveRepoPath('runtime-data', 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `backup-${Date.now()}.sqlite`);

    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, backupPath);
      return { success: true, message: `Backup created at ${backupPath}` };
    }

    return { success: true, message: 'Database file does not exist yet, so no backup was created.' };
  }

  async restoreBackup() {
    return {
      success: true,
      message: 'Backup restore is not implemented yet in this remote-first build.',
    };
  }
}
