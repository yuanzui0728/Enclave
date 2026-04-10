import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import OpenAI from 'openai';
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
};

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

function resolveAppMode() {
  return process.env.NODE_ENV === 'production' ? 'production' : 'development';
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

    return {
      endpoint: normalizeProviderEndpoint(endpoint),
      model,
      apiKey,
      mode,
      apiStyle,
    };
  }

  private createProviderClient(payload: ProviderPayload) {
    return new OpenAI({
      apiKey: payload.apiKey,
      baseURL: normalizeProviderEndpoint(payload.endpoint),
    });
  }

  async getStatus() {
    const [ownerCount, charactersCount, narrativeArcsCount, behaviorLogsCount, providerConfig] =
      await Promise.all([
        this.userRepo.count(),
        this.characterRepo.count(),
        this.narrativeArcRepo.count(),
        this.behaviorLogRepo.count(),
        this.resolveProviderConfig(),
      ]);

    const databasePath = this.resolveDatabasePath();
    const publicBaseUrl = this.config.get<string>('PUBLIC_API_BASE_URL')?.trim();

    const scheduler = this.getSchedulerPayload();

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
        queueDepth: 0,
        maxConcurrency: 1,
        inFlightRequests: 0,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
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

  private getSchedulerPayload() {
    return {
      healthy: true,
      mode: 'production' as const,
      coldStartEnabled: false,
      worldSnapshots: this.schedulerTelemetry.getWorldSnapshotCount(),
      lastWorldSnapshotAt: this.schedulerTelemetry.getLastWorldSnapshotAt(),
      jobs: this.schedulerTelemetry.listJobs(),
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
    };
  }

  async setProviderConfig(payload: ProviderPayload) {
    const nextConfig = {
      endpoint: normalizeProviderEndpoint(payload.endpoint),
      model: payload.model.trim(),
      apiKey: payload.apiKey?.trim() ?? '',
      mode: payload.mode === 'local-compatible' ? 'local-compatible' : 'cloud',
      apiStyle: payload.apiStyle === 'openai-responses' ? 'openai-responses' : 'openai-chat-completions',
    };

    await Promise.all([
      this.systemConfig.setConfig('provider_endpoint', nextConfig.endpoint),
      this.systemConfig.setConfig('provider_model', nextConfig.model),
      this.systemConfig.setConfig('provider_api_key', nextConfig.apiKey),
      this.systemConfig.setConfig('provider_mode', nextConfig.mode),
      this.systemConfig.setConfig('provider_api_style', nextConfig.apiStyle),
      this.systemConfig.setAiModel(nextConfig.model),
    ]);

    return {
      endpoint: nextConfig.endpoint,
      model: nextConfig.model,
      apiKey: nextConfig.apiKey || undefined,
      mode: nextConfig.mode,
      apiStyle: nextConfig.apiStyle,
    };
  }

  async testProviderConnection(payload: ProviderPayload) {
    const normalizedEndpoint = normalizeProviderEndpoint(payload.endpoint);
    try {
      const client = this.createProviderClient({
        ...payload,
        endpoint: normalizedEndpoint,
      });

      await client.chat.completions.create({
        model: payload.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        temperature: 0,
      });

      return {
        success: true,
        message: 'Provider connection succeeded.',
        normalizedEndpoint,
        statusCode: 200,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Provider connection failed.';
      return {
        success: false,
        message,
        normalizedEndpoint,
      };
    }
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
