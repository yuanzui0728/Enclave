import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { ConfigService } from '@nestjs/config';
import OpenAI, { toFile } from 'openai';
import {
  AiMessagePart,
  AiUsageBillingSource,
  AiUsageContext,
  AiUsageMetrics,
  GenerateReplyOptions,
  GenerateReplyResult,
  GenerateMomentOptions,
  ChatMessage,
  PersonalityProfile,
  AiKeyOverride,
  AiProviderAuthError,
} from './ai.types';
import { PromptBuilderService } from './prompt-builder.service';
import { sanitizeAiText } from './ai-text-sanitizer';
import { validateGeneratedSceneOutput } from './moment-output-validator';
import { MomentGenerationContextService } from './moment-generation-context.service';
import { SystemConfigService } from '../config/config.service';
import { WorldService } from '../world/world.service';
import { ReplyLogicRulesService } from './reply-logic-rules.service';
import { AiUsageLedgerService } from '../analytics/ai-usage-ledger.service';
import { resolveReadableChatAttachmentPath } from '../chat/chat-attachment-storage';
import { resolveReadableMomentMediaPath } from '../moments/moment-media.storage';

const DEFAULT_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe';
const DEFAULT_TTS_MODEL = 'gpt-4o-mini-tts';
const DEFAULT_TTS_VOICE = 'alloy';
const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_AUDIO_MIME_TYPES = new Set([
  'audio/mp4',
  'audio/x-m4a',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

type UploadedAudioFile = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size: number;
};

type LoadedAsset = {
  buffer: Buffer;
  mimeType?: string;
  fileName?: string;
};

type ResolvedProviderConfig = {
  endpoint: string;
  model: string;
  apiKey: string;
  transcriptionEndpoint: string;
  transcriptionApiKey: string;
  transcriptionModel: string;
  ttsModel: string;
  ttsVoice: string;
  apiStyle: 'openai-chat-completions' | 'openai-responses';
  mode: 'cloud' | 'local-compatible';
};

type SpeechSynthesisOptions = {
  text: string;
  voice?: string;
  conversationId?: string;
  characterId?: string;
  instructions?: string;
};

type SpeechSynthesisResult = {
  buffer: Buffer;
  mimeType: string;
  fileExtension: string;
  durationMs: number;
  provider: string;
  voice: string;
};

type PreparedReplyRequest = {
  systemPrompt: string;
  conversationHistory: ChatMessage[];
  currentUserMessage: ChatMessage;
  isGroupChat?: boolean;
};

type BudgetAwareProviderResult = {
  provider: ResolvedProviderConfig;
  usageAudit?: {
    errorCode: string;
    errorMessage: string;
    audit?: {
      budgetAction: 'downgrade' | 'block';
      requestedModel?: string | null;
      appliedModel?: string | null;
      budgetScope?: 'overall' | 'character';
      budgetPeriod?: 'daily' | 'monthly';
      budgetMetric?: 'tokens' | 'cost';
      budgetUsed?: number;
      budgetLimit?: number;
    };
  };
};

@Injectable()
export class AiOrchestratorService {
  private readonly logger = new Logger(AiOrchestratorService.name);
  private readonly client: OpenAI;

  constructor(
    private readonly config: ConfigService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly configService: SystemConfigService,
    private readonly worldService: WorldService,
    private readonly replyLogicRules: ReplyLogicRulesService,
    private readonly usageLedger: AiUsageLedgerService,
    private readonly momentGenerationContext: MomentGenerationContextService,
  ) {
    this.client = new OpenAI({
      apiKey: this.config.get<string>('DEEPSEEK_API_KEY'),
      baseURL:
        this.config.get<string>('OPENAI_BASE_URL') ??
        'https://api.deepseek.com',
    });
  }

  private normalizeProviderEndpoint(value: string) {
    const normalized = value.trim().replace(/\/+$/, '');
    if (normalized.endsWith('/chat/completions')) {
      return normalized.slice(0, -'/chat/completions'.length);
    }
    if (normalized.endsWith('/responses')) {
      return normalized.slice(0, -'/responses'.length);
    }

    return normalized;
  }

  private async resolveProviderConfig(): Promise<ResolvedProviderConfig> {
    const endpoint =
      (await this.configService.getConfig('provider_endpoint')) ??
      this.config.get<string>('OPENAI_BASE_URL') ??
      'https://api.deepseek.com';
    const model =
      (await this.configService.getConfig('provider_model')) ??
      this.config.get<string>('AI_MODEL') ??
      'deepseek-chat';
    const apiKey =
      (await this.configService.getConfig('provider_api_key')) ??
      this.config.get<string>('DEEPSEEK_API_KEY') ??
      '';
    const transcriptionModel =
      (await this.configService.getConfig('provider_transcription_model')) ??
      DEFAULT_TRANSCRIPTION_MODEL;
    const transcriptionEndpoint =
      (await this.configService.getConfig('provider_transcription_endpoint')) ??
      endpoint;
    const transcriptionApiKey =
      (await this.configService.getConfig('provider_transcription_api_key')) ??
      apiKey;
    const ttsModel =
      (await this.configService.getConfig('provider_tts_model')) ??
      DEFAULT_TTS_MODEL;
    const ttsVoice =
      (await this.configService.getConfig('provider_tts_voice')) ??
      DEFAULT_TTS_VOICE;
    const apiStyle =
      (await this.configService.getConfig('provider_api_style')) ??
      'openai-chat-completions';
    const mode =
      (await this.configService.getConfig('provider_mode')) ?? 'cloud';

    return {
      endpoint: this.normalizeProviderEndpoint(endpoint),
      model,
      apiKey: apiKey.trim(),
      transcriptionEndpoint: this.normalizeProviderEndpoint(
        (transcriptionEndpoint || endpoint).trim(),
      ),
      transcriptionApiKey: (transcriptionApiKey || apiKey).trim(),
      transcriptionModel,
      ttsModel,
      ttsVoice,
      apiStyle:
        apiStyle === 'openai-responses'
          ? 'openai-responses'
          : 'openai-chat-completions',
      mode: mode === 'local-compatible' ? 'local-compatible' : 'cloud',
    };
  }

  private async resolveRuntimeProvider(
    override?: AiKeyOverride,
  ): Promise<ResolvedProviderConfig> {
    const provider = await this.resolveProviderConfig();

    return {
      ...provider,
      endpoint: override?.apiBase
        ? this.normalizeProviderEndpoint(override.apiBase)
        : provider.endpoint,
      apiKey: override?.apiKey?.trim() || provider.apiKey,
      model: provider.model,
      transcriptionEndpoint: provider.transcriptionEndpoint,
      transcriptionApiKey: provider.transcriptionApiKey,
      transcriptionModel: provider.transcriptionModel,
      ttsModel: provider.ttsModel,
      ttsVoice: provider.ttsVoice,
      apiStyle: provider.apiStyle,
      mode: provider.mode,
    };
  }

  private createProviderClient(provider: ResolvedProviderConfig) {
    return new OpenAI({
      apiKey: provider.apiKey,
      baseURL: provider.endpoint,
    });
  }

  private modelSupportsImageInput(model: string) {
    const normalized = model.toLowerCase();
    return /(vision|gpt-4o|gpt-4\.1|gpt-5|gemini|claude|vl|multimodal)/.test(
      normalized,
    );
  }

  private isPrivateHostname(hostname: string) {
    const normalized = hostname.trim().toLowerCase();
    if (
      normalized === 'localhost' ||
      normalized === '::1' ||
      normalized.endsWith('.localhost')
    ) {
      return true;
    }

    if (
      normalized.startsWith('127.') ||
      normalized.startsWith('10.') ||
      normalized.startsWith('192.168.')
    ) {
      return true;
    }

    const match = normalized.match(/^172\.(\d{1,2})\./);
    if (match) {
      const secondOctet = Number(match[1]);
      return secondOctet >= 16 && secondOctet <= 31;
    }

    return false;
  }

  private isReachableImageUrl(url: string, provider: ResolvedProviderConfig) {
    if (url.startsWith('data:')) {
      return true;
    }

    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return false;
      }

      if (provider.mode === 'local-compatible') {
        return true;
      }

      return !this.isPrivateHostname(parsed.hostname);
    } catch {
      return false;
    }
  }

  private normalizeMediaMimeType(value?: string | null) {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }

    if (normalized === 'audio/mp3') {
      return 'audio/mpeg';
    }

    if (normalized === 'audio/m4a') {
      return 'audio/x-m4a';
    }

    return normalized;
  }

  private inferMimeTypeFromFileName(fileName?: string | null) {
    const ext = path
      .extname(fileName ?? '')
      .trim()
      .toLowerCase();
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.webp':
        return 'image/webp';
      case '.gif':
        return 'image/gif';
      case '.svg':
        return 'image/svg+xml';
      case '.mp3':
        return 'audio/mpeg';
      case '.m4a':
        return 'audio/x-m4a';
      case '.wav':
        return 'audio/wav';
      case '.ogg':
        return 'audio/ogg';
      case '.webm':
        return 'video/webm';
      case '.mp4':
        return 'video/mp4';
      case '.mov':
        return 'video/quicktime';
      default:
        return undefined;
    }
  }

  private resolveLocalAssetPath(url: string) {
    try {
      const parsed = new URL(url);
      const normalizedPath = parsed.pathname.replace(/\/+$/, '');
      const fileName = decodeURIComponent(
        path.basename(normalizedPath.split('/').pop() ?? ''),
      );

      if (!fileName) {
        return null;
      }

      if (normalizedPath.startsWith('/api/chat/attachments/')) {
        return resolveReadableChatAttachmentPath(fileName);
      }

      if (normalizedPath.startsWith('/api/moments/media/')) {
        return resolveReadableMomentMediaPath(fileName);
      }

      return null;
    } catch {
      return null;
    }
  }

  private async loadAssetFromUrl(
    url: string,
    maxBytes?: number,
  ): Promise<LoadedAsset | null> {
    if (!url.trim() || url.startsWith('data:')) {
      return null;
    }

    const localPath = this.resolveLocalAssetPath(url);
    if (localPath) {
      try {
        if (maxBytes) {
          const fileStat = await stat(localPath);
          if (fileStat.size > maxBytes) {
            return null;
          }
        }

        const buffer = await readFile(localPath);
        return {
          buffer,
          mimeType: this.inferMimeTypeFromFileName(localPath),
          fileName: path.basename(localPath),
        };
      } catch {
        return null;
      }
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }
      const contentLength = Number(response.headers.get('content-length') ?? 0);
      if (
        maxBytes &&
        Number.isFinite(contentLength) &&
        contentLength > maxBytes
      ) {
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      if (maxBytes && arrayBuffer.byteLength > maxBytes) {
        return null;
      }
      return {
        buffer: Buffer.from(arrayBuffer),
        mimeType: this.normalizeMediaMimeType(
          response.headers.get('content-type'),
        ),
        fileName: path.basename(new URL(url).pathname),
      };
    } catch {
      return null;
    }
  }

  private async resolveImageInputUrl(
    part: Extract<AiMessagePart, { type: 'image' }>,
    provider: ResolvedProviderConfig,
  ) {
    if (this.isReachableImageUrl(part.imageUrl, provider)) {
      return part.imageUrl;
    }

    const loadedAsset = await this.loadAssetFromUrl(
      part.imageUrl,
      MAX_INLINE_IMAGE_BYTES,
    );
    if (!loadedAsset?.buffer.length) {
      return null;
    }

    const mimeType =
      this.normalizeMediaMimeType(part.mimeType) ??
      this.normalizeMediaMimeType(loadedAsset.mimeType) ??
      'image/jpeg';
    if (!mimeType.startsWith('image/')) {
      return null;
    }

    return `data:${mimeType};base64,${loadedAsset.buffer.toString('base64')}`;
  }

  private extractErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    return '';
  }

  private extractErrorStatus(error: unknown) {
    if (typeof error !== 'object' || !error || !('status' in error)) {
      return undefined;
    }

    const status = (error as { status?: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }

  private isAuthenticationFailure(error: unknown) {
    const message = this.extractErrorMessage(error);
    const status = this.extractErrorStatus(error);
    if (status === 401 || status === 403) {
      return true;
    }

    return /invalid token|api key|authentication|unauthorized|incorrect api key|invalid api key/i.test(
      message,
    );
  }

  private isTransientSpeechFailure(error: unknown) {
    const message = this.extractErrorMessage(error);
    const status = this.extractErrorStatus(error);

    if (
      status === 408 ||
      status === 409 ||
      status === 425 ||
      status === 429 ||
      status === 500 ||
      status === 502 ||
      status === 503 ||
      status === 504
    ) {
      return true;
    }

    return /rate limit|too many requests|overloaded|temporarily unavailable|timeout|timed out|负载已饱和|稍后再试|服务繁忙/i.test(
      message,
    );
  }

  private async retrySpeechRequest<T>(
    label: 'speech transcription' | 'speech synthesis',
    request: () => Promise<T>,
  ) {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await request();
      } catch (error) {
        if (attempt >= maxAttempts || !this.isTransientSpeechFailure(error)) {
          throw error;
        }

        this.logger.warn(`${label} retry scheduled`, {
          attempt,
          maxAttempts,
          errorMessage: this.extractErrorMessage(error),
        });
        await new Promise((resolve) => {
          setTimeout(resolve, 600 * attempt);
        });
      }
    }

    throw new BadGatewayException('语音请求重试失败。');
  }

  private buildProviderKey(provider: ResolvedProviderConfig) {
    return `${provider.mode}:${provider.endpoint}`;
  }

  private normalizeUsageMetrics(
    usage:
      | {
          prompt_tokens?: number;
          completion_tokens?: number;
          input_tokens?: number;
          output_tokens?: number;
          total_tokens?: number;
        }
      | null
      | undefined,
  ): AiUsageMetrics {
    const promptTokens = usage?.prompt_tokens ?? usage?.input_tokens;
    const completionTokens = usage?.completion_tokens ?? usage?.output_tokens;
    const totalTokens =
      usage?.total_tokens ??
      ((promptTokens ?? 0) || (completionTokens ?? 0)
        ? (promptTokens ?? 0) + (completionTokens ?? 0)
        : undefined);

    return {
      promptTokens,
      completionTokens,
      totalTokens,
      raw: usage ? ({ ...usage } as Record<string, unknown>) : null,
    };
  }

  private resolveReplyUsageContext(
    profile: PersonalityProfile,
    options: GenerateReplyOptions,
  ): AiUsageContext {
    return {
      surface: options.usageContext?.surface ?? 'app',
      scene:
        options.usageContext?.scene ??
        (options.isGroupChat ? 'group_reply' : 'chat_reply'),
      scopeType:
        options.usageContext?.scopeType ??
        (options.isGroupChat ? 'group' : 'character'),
      scopeId: options.usageContext?.scopeId ?? profile.characterId,
      scopeLabel: options.usageContext?.scopeLabel ?? profile.name,
      ownerId: options.usageContext?.ownerId,
      characterId: options.usageContext?.characterId ?? profile.characterId,
      characterName: options.usageContext?.characterName ?? profile.name,
      conversationId: options.usageContext?.conversationId,
      groupId: options.usageContext?.groupId,
    };
  }

  private async safeRecordUsage(
    input: Parameters<AiUsageLedgerService['record']>[0],
  ) {
    try {
      await this.usageLedger.record(input);
    } catch (error) {
      this.logger.warn('Failed to write AI usage ledger record', {
        scene: input.scene,
        scopeType: input.scopeType,
        errorMessage: this.extractErrorMessage(error),
      });
    }
  }

  private async recordSuccessfulUsage(
    provider: ResolvedProviderConfig,
    billingSource: AiUsageBillingSource,
    usageContext: AiUsageContext,
    result: GenerateReplyResult | { usage?: AiUsageMetrics; model?: string },
    usageAudit?: {
      errorCode?: string | null;
      errorMessage?: string | null;
      audit?: {
        budgetAction: 'downgrade' | 'block';
        requestedModel?: string | null;
        appliedModel?: string | null;
        budgetScope?: 'overall' | 'character';
        budgetPeriod?: 'daily' | 'monthly';
        budgetMetric?: 'tokens' | 'cost';
        budgetUsed?: number;
        budgetLimit?: number;
      };
    },
  ) {
    await this.safeRecordUsage({
      status: 'success',
      surface: usageContext.surface,
      scene: usageContext.scene,
      scopeType: usageContext.scopeType,
      scopeId: usageContext.scopeId,
      scopeLabel: usageContext.scopeLabel,
      ownerId: usageContext.ownerId,
      characterId: usageContext.characterId,
      characterName: usageContext.characterName,
      conversationId: usageContext.conversationId,
      groupId: usageContext.groupId,
      providerKey: this.buildProviderKey(provider),
      providerMode: provider.mode,
      model: result.model ?? provider.model,
      apiStyle: provider.apiStyle,
      billingSource,
      usage: result.usage,
      audit: usageAudit?.audit,
      errorCode: usageAudit?.errorCode ?? null,
      errorMessage: usageAudit?.errorMessage ?? null,
    });
  }

  private async recordFailedUsage(
    provider: ResolvedProviderConfig,
    billingSource: AiUsageBillingSource,
    usageContext: AiUsageContext,
    error: unknown,
  ) {
    const errorStatus = this.extractErrorStatus(error);
    await this.safeRecordUsage({
      status: 'failed',
      surface: usageContext.surface,
      scene: usageContext.scene,
      scopeType: usageContext.scopeType,
      scopeId: usageContext.scopeId,
      scopeLabel: usageContext.scopeLabel,
      ownerId: usageContext.ownerId,
      characterId: usageContext.characterId,
      characterName: usageContext.characterName,
      conversationId: usageContext.conversationId,
      groupId: usageContext.groupId,
      providerKey: this.buildProviderKey(provider),
      providerMode: provider.mode,
      model: provider.model,
      apiStyle: provider.apiStyle,
      billingSource,
      errorCode:
        errorStatus != null
          ? `HTTP_${errorStatus}`
          : this.isAuthenticationFailure(error)
            ? 'AUTH_FAILURE'
            : 'REQUEST_FAILED',
      errorMessage: this.extractErrorMessage(error) || 'Unknown provider error',
    });
  }

  private async prepareBudgetAwareProvider(
    provider: ResolvedProviderConfig,
    billingSource: AiUsageBillingSource,
    usageContext: AiUsageContext,
  ): Promise<BudgetAwareProviderResult> {
    const decision = await this.usageLedger.getBudgetExecutionDecision({
      characterId: usageContext.characterId,
      characterName:
        usageContext.characterName ?? usageContext.scopeLabel ?? undefined,
      currentModel: provider.model,
    });
    if (!decision) {
      return { provider };
    }

    if (decision.action === 'downgrade' && decision.downgradeModel) {
      const downgradedProvider = {
        ...provider,
        model: decision.downgradeModel,
      };
      this.logger.warn('AI budget exceeded, downgrading model', {
        scene: usageContext.scene,
        scope: decision.scope,
        period: decision.period,
        fromModel: provider.model,
        toModel: decision.downgradeModel,
        characterId: usageContext.characterId ?? null,
      });
      return {
        provider: downgradedProvider,
        usageAudit: {
          errorCode: 'BUDGET_DOWNGRADED',
          errorMessage: decision.message,
          audit: {
            budgetAction: 'downgrade',
            requestedModel: provider.model,
            appliedModel: decision.downgradeModel,
            budgetScope: decision.scope,
            budgetPeriod: decision.period,
            budgetMetric: decision.metric,
            budgetUsed: decision.used,
            budgetLimit: decision.limit,
          },
        },
      };
    }

    await this.safeRecordUsage({
      status: 'failed',
      surface: usageContext.surface,
      scene: usageContext.scene,
      scopeType: usageContext.scopeType,
      scopeId: usageContext.scopeId,
      scopeLabel: usageContext.scopeLabel,
      ownerId: usageContext.ownerId,
      characterId: usageContext.characterId,
      characterName: usageContext.characterName,
      conversationId: usageContext.conversationId,
      groupId: usageContext.groupId,
      providerKey: this.buildProviderKey(provider),
      providerMode: provider.mode,
      model: provider.model,
      apiStyle: provider.apiStyle,
      billingSource,
      audit: {
        budgetAction: 'block',
        requestedModel: provider.model,
        appliedModel: provider.model,
        budgetScope: decision.scope,
        budgetPeriod: decision.period,
        budgetMetric: decision.metric,
        budgetUsed: decision.used,
        budgetLimit: decision.limit,
      },
      errorCode: 'BUDGET_BLOCKED',
      errorMessage: decision.message,
    });
    throw new HttpException(decision.message, HttpStatus.TOO_MANY_REQUESTS);
  }

  private async requestReplyFromProvider(
    provider: ResolvedProviderConfig,
    request: PreparedReplyRequest,
  ): Promise<GenerateReplyResult> {
    const client = this.createProviderClient(provider);
    const {
      systemPrompt,
      conversationHistory,
      currentUserMessage,
      isGroupChat,
    } = request;
    const hasImageInput = this.requestContainsImageInput(request);

    const execute = async (
      allowImageInput: boolean,
    ): Promise<GenerateReplyResult> => {
      if (provider.apiStyle === 'openai-responses') {
        const historyMessages = await Promise.all(
          conversationHistory.map((message) =>
            this.buildResponsesMessage(
              message,
              provider,
              isGroupChat,
              allowImageInput,
            ),
          ),
        );
        const currentMessage = await this.buildResponsesMessage(
          currentUserMessage,
          provider,
          isGroupChat,
          allowImageInput,
        );
        const response = await client.responses.create({
          model: provider.model,
          instructions: systemPrompt,
          input: [...historyMessages, currentMessage],
          max_output_tokens: 500,
          temperature: 0.85,
        });

        const rawText = response.output_text ?? '（无回复）';
        const text = sanitizeAiText(rawText) || '（无回复）';
        const usage = this.normalizeUsageMetrics(response.usage);
        return {
          text,
          tokensUsed: usage.totalTokens ?? 0,
          usage,
          model: response.model ?? provider.model,
        };
      }

      const historyMessages = await Promise.all(
        conversationHistory.map((message) =>
          this.buildChatCompletionMessage(
            message,
            provider,
            isGroupChat,
            allowImageInput,
          ),
        ),
      );
      const currentMessage = await this.buildChatCompletionMessage(
        currentUserMessage,
        provider,
        isGroupChat,
        allowImageInput,
      );
      const response = await client.chat.completions.create({
        model: provider.model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...historyMessages,
          currentMessage,
        ],
        max_tokens: 500,
        temperature: 0.85,
      });

      const rawText = response.choices[0]?.message?.content ?? '（无回复）';
      const text = sanitizeAiText(rawText) || '（无回复）';
      const usage = this.normalizeUsageMetrics(response.usage);

      return {
        text,
        tokensUsed: usage.totalTokens ?? 0,
        usage,
        model: response.model ?? provider.model,
      };
    };

    try {
      return await execute(true);
    } catch (error) {
      if (hasImageInput && this.isUnsupportedImageInputError(error)) {
        this.logger.warn(
          'Provider rejected image input, retrying with text-only fallback',
          {
            model: provider.model,
            errorMessage: this.extractErrorMessage(error),
          },
        );
        return execute(false);
      }

      throw error;
    }
  }

  private canRetryWithDefaultProvider(
    currentProvider: ResolvedProviderConfig,
    defaultProvider: ResolvedProviderConfig,
  ) {
    return (
      Boolean(defaultProvider.apiKey) &&
      (defaultProvider.apiKey !== currentProvider.apiKey ||
        defaultProvider.endpoint !== currentProvider.endpoint)
    );
  }

  private buildMessageText(
    message: Pick<ChatMessage, 'content' | 'characterId'>,
    isGroupChat?: boolean,
  ) {
    return isGroupChat && message.characterId
      ? `[${message.characterId}]: ${message.content}`
      : message.content;
  }

  private async collectUsableImageParts(
    parts: AiMessagePart[] | undefined,
    provider: ResolvedProviderConfig,
  ) {
    if (!parts?.length) {
      return [];
    }

    const imageParts = parts.filter(
      (part): part is Extract<AiMessagePart, { type: 'image' }> =>
        part.type === 'image',
    );
    const resolvedParts = await Promise.all(
      imageParts.map(async (part) => {
        const inputUrl = await this.resolveImageInputUrl(part, provider);
        if (!inputUrl) {
          return null;
        }

        return {
          ...part,
          imageUrl: inputUrl,
        };
      }),
    );

    return resolvedParts.filter(
      (part): part is Extract<AiMessagePart, { type: 'image' }> =>
        Boolean(part),
    );
  }

  private async buildChatCompletionMessage(
    message: ChatMessage,
    provider: ResolvedProviderConfig,
    isGroupChat?: boolean,
    allowImageInput = true,
  ): Promise<OpenAI.Chat.ChatCompletionMessageParam> {
    const textContent = this.buildMessageText(message, isGroupChat);
    const imageParts = allowImageInput
      ? await this.collectUsableImageParts(message.parts, provider)
      : [];
    if (!imageParts.length || message.role !== 'user') {
      return {
        role: message.role,
        content: textContent,
      };
    }

    const contentParts: Array<
      | OpenAI.Chat.ChatCompletionContentPartText
      | OpenAI.Chat.ChatCompletionContentPartImage
    > = [];
    if (textContent.trim()) {
      contentParts.push({ type: 'text', text: textContent });
    }

    imageParts.forEach((part) => {
      contentParts.push({
        type: 'image_url',
        image_url: {
          url: part.imageUrl,
          detail: part.detail ?? 'auto',
        },
      });
    });

    return {
      role: 'user',
      content: contentParts,
    };
  }

  private async buildResponsesMessage(
    message: ChatMessage,
    provider: ResolvedProviderConfig,
    isGroupChat?: boolean,
    allowImageInput = true,
  ): Promise<OpenAI.Responses.EasyInputMessage> {
    const textContent = this.buildMessageText(message, isGroupChat);
    const imageParts = allowImageInput
      ? await this.collectUsableImageParts(message.parts, provider)
      : [];
    if (!imageParts.length) {
      return {
        role: message.role as 'user' | 'assistant' | 'system' | 'developer',
        content: textContent,
      };
    }

    const contentParts: OpenAI.Responses.ResponseInputMessageContentList = [];
    if (textContent.trim()) {
      contentParts.push({ type: 'input_text', text: textContent });
    }

    imageParts.forEach((part) => {
      contentParts.push({
        type: 'input_image',
        image_url: part.imageUrl,
        detail: part.detail ?? 'auto',
      });
    });

    return {
      role: message.role as 'user' | 'assistant' | 'system' | 'developer',
      content: contentParts,
    };
  }

  private requestContainsImageInput(request: PreparedReplyRequest) {
    return [...request.conversationHistory, request.currentUserMessage].some(
      (message) => message.parts?.some((part) => part.type === 'image'),
    );
  }

  private isUnsupportedImageInputError(error: unknown) {
    const status = this.extractErrorStatus(error);
    const message = this.extractErrorMessage(error);
    if (
      status !== undefined &&
      status !== 400 &&
      status !== 415 &&
      status !== 422
    ) {
      return false;
    }

    return /image|input_image|image_url|vision|multimodal|does not support images|unsupported image|content part/i.test(
      message,
    );
  }

  private buildUnavailableReply(
    profile: PersonalityProfile,
  ): GenerateReplyResult {
    return {
      text: `${profile.name}看到了你的消息，但这个世界还没有配置可用的 AI Key。先去“我 > 设置”里补上 API Key，我就能继续回复你。`,
      tokensUsed: 0,
    };
  }

  async inspectReplyPreparation(options: GenerateReplyOptions): Promise<{
    model: string;
    systemPrompt: string;
    worldContextText?: string;
    historyWindow: number;
    includedHistory: ChatMessage[];
    requestMessages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }>;
    apiAvailable: boolean;
  }> {
    const {
      profile,
      conversationHistory,
      userMessage,
      isGroupChat,
      chatContext,
      aiKeyOverride,
    } = options;
    const provider = await this.resolveRuntimeProvider(aiKeyOverride);
    const systemPrompt = await this.buildSystemPrompt(
      profile,
      isGroupChat,
      chatContext,
      this.resolveSceneKey(options.usageContext?.scene),
    );
    const historyWindow = await this.replyLogicRules.calculateHistoryWindow(
      profile.memory?.forgettingCurve,
    );
    const includedHistory = conversationHistory.slice(-historyWindow);
    const requestMessages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }> = [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...includedHistory.map((message) => ({
        role:
          message.role === 'assistant'
            ? ('assistant' as const)
            : ('user' as const),
        content: message.characterId
          ? `[${message.characterId}]: ${message.content}`
          : message.content,
      })),
      {
        role: 'user',
        content: userMessage,
      },
    ];
    const worldCtx = await this.worldService.getLatest();
    const worldContextText =
      await this.worldService.buildContextString(worldCtx);

    return {
      model: provider.model,
      systemPrompt,
      worldContextText: worldContextText || undefined,
      historyWindow,
      includedHistory,
      requestMessages,
      apiAvailable: Boolean(provider.apiKey),
    };
  }

  async tryTranscribeMediaFromUrl(input: {
    url: string;
    mimeType?: string | null;
    fileName?: string | null;
    conversationId?: string;
    mode?: string;
  }) {
    const normalizedMimeType =
      this.normalizeMediaMimeType(input.mimeType) ??
      this.inferMimeTypeFromFileName(input.fileName);
    if (
      !normalizedMimeType ||
      (!normalizedMimeType.startsWith('audio/') &&
        !normalizedMimeType.startsWith('video/'))
    ) {
      return null;
    }

    const asset = await this.loadAssetFromUrl(input.url, 10 * 1024 * 1024);
    if (!asset?.buffer.length) {
      return null;
    }

    try {
      return await this.transcribeAudio(
        {
          buffer: asset.buffer,
          mimetype:
            this.normalizeMediaMimeType(asset.mimeType) ?? normalizedMimeType,
          originalname: input.fileName ?? asset.fileName ?? 'media-input',
          size: asset.buffer.length,
        },
        {
          conversationId: input.conversationId,
          mode: input.mode,
        },
      );
    } catch (error) {
      this.logger.warn('media transcription skipped', {
        url: input.url,
        mimeType: normalizedMimeType,
        errorMessage: this.extractErrorMessage(error),
      });
      return null;
    }
  }

  private async buildSystemPrompt(
    profile: PersonalityProfile,
    isGroupChat?: boolean,
    chatContext?: GenerateReplyOptions['chatContext'],
    sceneKey?: import('./ai.types').SceneKey,
  ) {
    let systemPrompt: string;
    if (sceneKey && sceneKey !== 'chat') {
      // 非聊天场景（评论、问候、主动提醒等）走场景化构建
      systemPrompt = await this.promptBuilder.buildSceneSystemPrompt(
        profile,
        sceneKey,
        chatContext,
      );
    } else {
      systemPrompt = await this.promptBuilder.buildChatSystemPrompt(
        profile,
        isGroupChat,
        chatContext,
      );
    }

    try {
      const worldCtx = await this.worldService.getLatest();
      const ctxStr = await this.worldService.buildContextString(worldCtx);
      if (ctxStr) {
        const replacementPattern =
          await this.worldService.getCurrentTimeReplacementPattern();
        if (replacementPattern) {
          systemPrompt = systemPrompt.replace(replacementPattern, ctxStr);
        }
        if (!systemPrompt.includes(ctxStr)) {
          const contextBlock =
            await this.worldService.buildPromptContextBlock(worldCtx);
          systemPrompt += `\n\n${contextBlock}`;
        }
      }
    } catch {
      // ignore world context errors
    }

    return systemPrompt;
  }

  /** usageContext.scene → SceneKey 映射，用于场景化提示词路由 */
  private resolveSceneKey(
    scene?: string,
  ): import('./ai.types').SceneKey | undefined {
    const map: Record<string, import('./ai.types').SceneKey> = {
      chat_reply: 'chat',
      moment_post_generate: 'moments_post',
      feed_post_generate: 'feed_post',
      channel_post_generate: 'channel_post',
      moment_comment_generate: 'moments_comment',
      feed_comment_generate: 'feed_comment',
      social_greeting_generate: 'greeting',
      proactive: 'proactive',
    };
    return scene ? map[scene] : undefined;
  }

  async generateReply(
    options: GenerateReplyOptions,
  ): Promise<GenerateReplyResult> {
    const {
      profile,
      conversationHistory,
      userMessage,
      userMessageParts,
      isGroupChat,
      chatContext,
      aiKeyOverride,
    } = options;
    const usageContext = this.resolveReplyUsageContext(profile, options);
    const runtimeProvider = await this.resolveRuntimeProvider(aiKeyOverride);
    if (!runtimeProvider.apiKey) {
      return this.buildUnavailableReply(profile);
    }

    const systemPrompt = await this.buildSystemPrompt(
      profile,
      isGroupChat,
      chatContext,
      this.resolveSceneKey(usageContext.scene),
    );
    const historyWindow = await this.replyLogicRules.calculateHistoryWindow(
      profile.memory?.forgettingCurve,
    );
    const sanitizedHistory = conversationHistory
      .slice(-historyWindow)
      .map((m) => ({
        ...m,
        content: m.role === 'assistant' ? sanitizeAiText(m.content) : m.content,
      }));
    const currentUserMessage: ChatMessage = {
      role: 'user',
      content: userMessage,
      parts: userMessageParts,
    };
    const request: PreparedReplyRequest = {
      systemPrompt,
      conversationHistory: sanitizedHistory,
      currentUserMessage,
      isGroupChat,
    };
    const billingSource: AiUsageBillingSource = aiKeyOverride
      ? 'owner_custom'
      : 'instance_default';
    const budgetedProvider = await this.prepareBudgetAwareProvider(
      runtimeProvider,
      billingSource,
      usageContext,
    );
    const provider = budgetedProvider.provider;

    try {
      const result = await this.requestReplyFromProvider(provider, request);
      await this.recordSuccessfulUsage(
        provider,
        billingSource,
        usageContext,
        result,
        budgetedProvider.usageAudit,
      );
      return {
        ...result,
        billingSource,
      };
    } catch (err) {
      if (aiKeyOverride && this.isAuthenticationFailure(err)) {
        await this.recordFailedUsage(
          provider,
          'owner_custom',
          usageContext,
          err,
        );
        const defaultProvider = await this.resolveProviderConfig();
        if (this.canRetryWithDefaultProvider(provider, defaultProvider)) {
          this.logger.warn(
            `Owner-level AI key failed authentication for ${profile.characterId}; retrying with instance provider.`,
          );
          let fallbackProvider = defaultProvider;
          try {
            const budgetedDefaultProvider =
              await this.prepareBudgetAwareProvider(
                defaultProvider,
                'instance_default',
                usageContext,
              );
            fallbackProvider = budgetedDefaultProvider.provider;
            const fallbackResult = await this.requestReplyFromProvider(
              fallbackProvider,
              request,
            );
            await this.recordSuccessfulUsage(
              fallbackProvider,
              'instance_default',
              usageContext,
              fallbackResult,
              budgetedDefaultProvider.usageAudit,
            );
            return {
              ...fallbackResult,
              billingSource: 'instance_default',
            };
          } catch (fallbackError) {
            await this.recordFailedUsage(
              fallbackProvider,
              'instance_default',
              usageContext,
              fallbackError,
            );
            this.logger.error('AI provider fallback error', fallbackError);
            if (this.isAuthenticationFailure(fallbackError)) {
              throw new AiProviderAuthError('instance_default');
            }
            throw fallbackError;
          }
        }

        throw new AiProviderAuthError('owner_custom');
      }

      if (this.isAuthenticationFailure(err)) {
        await this.recordFailedUsage(
          provider,
          'instance_default',
          usageContext,
          err,
        );
        throw new AiProviderAuthError('instance_default');
      }

      await this.recordFailedUsage(
        provider,
        aiKeyOverride ? 'owner_custom' : 'instance_default',
        usageContext,
        err,
      );
      this.logger.error('AI provider error', err);
      throw err;
    }
  }

  async generateMoment(options: GenerateMomentOptions): Promise<string> {
    const {
      profile,
      currentTime,
      recentTopics,
      generationContext,
      usageContext,
    } = options;
    const sceneKey =
      this.resolveSceneKey(usageContext?.scene) ?? 'moments_post';
    const resolvedUsageContext: AiUsageContext = {
      surface: usageContext?.surface ?? 'app',
      scene: usageContext?.scene ?? 'moment_post_generate',
      scopeType: usageContext?.scopeType ?? 'character',
      scopeId: usageContext?.scopeId ?? profile.characterId,
      scopeLabel: usageContext?.scopeLabel ?? profile.name,
      ownerId: usageContext?.ownerId,
      characterId: usageContext?.characterId ?? profile.characterId,
      characterName: usageContext?.characterName ?? profile.name,
      conversationId: usageContext?.conversationId,
      groupId: usageContext?.groupId,
    };
    const runtimeProvider = await this.resolveRuntimeProvider();
    const budgetedProvider = await this.prepareBudgetAwareProvider(
      runtimeProvider,
      'instance_default',
      resolvedUsageContext,
    );
    const provider = budgetedProvider.provider;
    const client = this.createProviderClient(provider);

    try {
      if (sceneKey !== 'moments_post') {
        const systemPrompt = await this.buildSystemPrompt(
          profile,
          false,
          undefined,
          sceneKey,
        );
        const taskPrompts = [
          this.promptBuilder.buildSceneGenerationTaskPrompt(sceneKey, false),
          this.promptBuilder.buildSceneGenerationTaskPrompt(sceneKey, true),
        ];

        for (let attempt = 0; attempt < taskPrompts.length; attempt += 1) {
          const response = await client.chat.completions.create({
            model: provider.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: taskPrompts[attempt] },
            ],
            max_tokens: sceneKey === 'channel_post' ? 220 : 170,
            temperature: attempt === 0 ? 0.9 : 0.72,
          });

          const usage = this.normalizeUsageMetrics(response.usage);
          await this.recordSuccessfulUsage(
            provider,
            'instance_default',
            resolvedUsageContext,
            {
              usage,
              model: response.model ?? provider.model,
            },
            budgetedProvider.usageAudit,
          );

          const text = sanitizeAiText(
            response.choices[0]?.message?.content ?? '',
          );
          const validation = validateGeneratedSceneOutput({
            text,
            profile,
            sceneKey,
          });
          if (validation.valid) {
            return validation.normalizedText;
          }

          this.logger.warn(
            `Discarded low-quality ${sceneKey} output for ${resolvedUsageContext.characterName ?? profile.name} (attempt ${attempt + 1}): ${validation.reasons.join('；') || '未通过校验'}`,
          );
        }

        this.logger.warn(
          `Skipped ${sceneKey} generation for ${resolvedUsageContext.characterName ?? profile.name} after validation.`,
        );
        return '';
      }

      const resolvedGenerationContext =
        generationContext ??
        (await this.momentGenerationContext.buildContext({
          currentTime,
          recentTopics,
          usageContext: resolvedUsageContext,
        }));
      const promptRequest = await this.promptBuilder.buildMomentRequest(
        profile,
        currentTime,
        resolvedGenerationContext,
        sceneKey,
      );
      const userPrompts = [
        promptRequest.userPrompt,
        promptRequest.retryUserPrompt,
      ];

      for (let attempt = 0; attempt < userPrompts.length; attempt += 1) {
        const response = await client.chat.completions.create({
          model: provider.model,
          messages: [
            { role: 'system', content: promptRequest.systemPrompt },
            { role: 'user', content: userPrompts[attempt] },
          ],
          max_tokens: 180,
          temperature: attempt === 0 ? 0.9 : 0.75,
        });

        const usage = this.normalizeUsageMetrics(response.usage);
        await this.recordSuccessfulUsage(
          provider,
          'instance_default',
          resolvedUsageContext,
          {
            usage,
            model: response.model ?? provider.model,
          },
          budgetedProvider.usageAudit,
        );

        const text = sanitizeAiText(
          response.choices[0]?.message?.content ?? '',
        );
        const validation = validateGeneratedSceneOutput({
          text,
          context: resolvedGenerationContext,
          profile,
          sceneKey,
        });
        if (validation.valid) {
          return validation.normalizedText;
        }

        this.logger.warn(
          `Discarded low-quality moment for ${resolvedUsageContext.characterName ?? profile.name} (attempt ${attempt + 1}): ${validation.reasons.join('；') || '未通过校验'}`,
        );
      }

      this.logger.warn(
        `Skipped moment generation for ${resolvedUsageContext.characterName ?? profile.name} after validation.`,
      );
      return '';
    } catch (error) {
      await this.recordFailedUsage(
        provider,
        'instance_default',
        resolvedUsageContext,
        error,
      );
      throw error;
    }
  }

  async extractPersonality(
    chatSample: string,
    personName: string,
    usageContext?: AiUsageContext,
  ): Promise<Record<string, unknown>> {
    const prompt = await this.promptBuilder.buildPersonalityExtractionPrompt(
      chatSample,
      personName,
    );

    const runtimeProvider = await this.resolveRuntimeProvider();
    const resolvedUsageContext: AiUsageContext = {
      surface: usageContext?.surface ?? 'admin',
      scene: usageContext?.scene ?? 'character_factory_extract',
      scopeType: usageContext?.scopeType ?? 'admin_task',
      scopeId: usageContext?.scopeId,
      scopeLabel: usageContext?.scopeLabel ?? personName,
      ownerId: usageContext?.ownerId,
      characterId: usageContext?.characterId,
      characterName: usageContext?.characterName,
      conversationId: usageContext?.conversationId,
      groupId: usageContext?.groupId,
    };
    const budgetedProvider = await this.prepareBudgetAwareProvider(
      runtimeProvider,
      'instance_default',
      resolvedUsageContext,
    );
    const provider = budgetedProvider.provider;
    const client = this.createProviderClient(provider);

    try {
      const response = await client.chat.completions.create({
        model: provider.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const usage = this.normalizeUsageMetrics(response.usage);
      await this.recordSuccessfulUsage(
        provider,
        'instance_default',
        resolvedUsageContext,
        {
          usage,
          model: response.model ?? provider.model,
        },
        budgetedProvider.usageAudit,
      );

      const raw = response.choices[0]?.message?.content ?? '{}';
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        this.logger.error('Failed to parse personality JSON', raw);
        return {};
      }
    } catch (error) {
      await this.recordFailedUsage(
        provider,
        'instance_default',
        resolvedUsageContext,
        error,
      );
      throw error;
    }
  }

  async generateQuickCharacter(
    description: string,
  ): Promise<Record<string, unknown>> {
    const prompt = `你是隐界的角色设计师。根据以下描述，生成一个完整的虚拟角色 JSON 草稿，严格输出合法 JSON，不要输出任何其他内容。

要求：
1. 角色要像用户现实里真会认识的人，不要像万能助手、客服、课程讲师或系统提示词外壳。
2. 所有文字字段都尽量自然，少一点过度客气、总结腔、提纲腔。
3. 不要在任何字段里写（动作）、[旁白]、*动作* 这类舞台说明。
4. basePrompt 只写这个人自己的说话方式、边界和习惯，不要写成 prompt 教程、操作手册，别出现“你是一个 AI 助手”这类描述。

描述：${description}

输出格式（全部字段用中文填写，avatar 用一个合适的 emoji）：
{
  "name": "角色姓名",
  "avatar": "😊",
  "relationship": "与用户的关系描述（一句话，例如：温柔的心理咨询师）",
  "relationshipType": "friend|family|expert|mentor|custom",
  "bio": "角色简介（2-3句话）",
  "occupation": "职业",
  "background": "背景故事（2-3句话）",
  "motivation": "核心动机（一句话）",
  "worldview": "世界观（一句话）",
  "expertDomains": ["领域1", "领域2"],
  "speechPatterns": ["说话习惯1", "说话习惯2"],
  "catchphrases": ["口头禅1"],
  "topicsOfInterest": ["兴趣话题1", "兴趣话题2"],
  "emotionalTone": "grounded|warm|energetic|melancholic|playful|serious",
  "responseLength": "short|medium|long",
  "emojiUsage": "none|occasional|frequent",
  "memorySummary": "初始记忆摘要（一句话）",
  "basePrompt": "这个人自己的说话方式和边界（2-4句话，不要写成助理说明书，不要出现括号动作）"
}`;

    const runtimeProvider = await this.resolveRuntimeProvider();
    const usageContext: AiUsageContext = {
      surface: 'admin',
      scene: 'quick_character_generate',
      scopeType: 'admin_task',
      scopeLabel: description.slice(0, 48) || 'quick-character',
    };
    const budgetedProvider = await this.prepareBudgetAwareProvider(
      runtimeProvider,
      'instance_default',
      usageContext,
    );
    const provider = budgetedProvider.provider;
    const client = this.createProviderClient(provider);

    try {
      const response = await client.chat.completions.create({
        model: provider.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 800,
        temperature: 0.8,
        response_format: { type: 'json_object' },
      });

      const usage = this.normalizeUsageMetrics(response.usage);
      await this.recordSuccessfulUsage(
        provider,
        'instance_default',
        usageContext,
        {
          usage,
          model: response.model ?? provider.model,
        },
        budgetedProvider.usageAudit,
      );

      const raw = response.choices[0]?.message?.content ?? '{}';
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        this.logger.error('Failed to parse quick character JSON', raw);
        return {};
      }
    } catch (error) {
      await this.recordFailedUsage(
        provider,
        'instance_default',
        usageContext,
        error,
      );
      throw error;
    }
  }

  async generateJsonObject(options: {
    prompt: string;
    usageContext: AiUsageContext;
    maxTokens?: number;
    temperature?: number;
    fallback?: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const runtimeProvider = await this.resolveRuntimeProvider();
    let failureProvider = runtimeProvider;

    try {
      const budgetedProvider = await this.prepareBudgetAwareProvider(
        runtimeProvider,
        'instance_default',
        options.usageContext,
      );
      const provider = budgetedProvider.provider;
      failureProvider = provider;
      const client = this.createProviderClient(provider);
      const response = await client.chat.completions.create({
        model: provider.model,
        messages: [{ role: 'user', content: options.prompt }],
        max_tokens: options.maxTokens ?? 1200,
        temperature: options.temperature ?? 0.3,
        response_format: { type: 'json_object' },
      });

      const usage = this.normalizeUsageMetrics(response.usage);
      await this.recordSuccessfulUsage(
        provider,
        'instance_default',
        options.usageContext,
        {
          usage,
          model: response.model ?? provider.model,
        },
        budgetedProvider.usageAudit,
      );

      const raw = response.choices[0]?.message?.content ?? '{}';
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        this.logger.error('Failed to parse JSON task result', raw);
        return options.fallback ?? {};
      }
    } catch (error) {
      await this.recordFailedUsage(
        failureProvider,
        'instance_default',
        options.usageContext,
        error,
      );
      this.logger.error('generateJsonObject error', error);
      return options.fallback ?? {};
    }
  }

  async generatePlainText(options: {
    prompt: string;
    usageContext: AiUsageContext;
    maxTokens?: number;
    temperature?: number;
    fallback?: string;
  }): Promise<string> {
    const runtimeProvider = await this.resolveRuntimeProvider();
    let failureProvider = runtimeProvider;

    try {
      const budgetedProvider = await this.prepareBudgetAwareProvider(
        runtimeProvider,
        'instance_default',
        options.usageContext,
      );
      const provider = budgetedProvider.provider;
      failureProvider = provider;
      const client = this.createProviderClient(provider);
      const response = await client.chat.completions.create({
        model: provider.model,
        messages: [{ role: 'user', content: options.prompt }],
        max_tokens: options.maxTokens ?? 800,
        temperature: options.temperature ?? 0.4,
      });

      const usage = this.normalizeUsageMetrics(response.usage);
      await this.recordSuccessfulUsage(
        provider,
        'instance_default',
        options.usageContext,
        {
          usage,
          model: response.model ?? provider.model,
        },
        budgetedProvider.usageAudit,
      );

      return sanitizeAiText(response.choices[0]?.message?.content ?? '');
    } catch (error) {
      await this.recordFailedUsage(
        failureProvider,
        'instance_default',
        options.usageContext,
        error,
      );
      this.logger.error('generatePlainText error', error);
      return options.fallback ?? '';
    }
  }

  async compressMemory(
    history: ChatMessage[],
    profile: PersonalityProfile,
    usageContext?: AiUsageContext,
  ): Promise<string> {
    const chatHistory = history
      .filter((m) => m.role !== 'system')
      .map((m) => `${m.role === 'user' ? '用户' : profile.name}：${m.content}`)
      .join('\n');

    const prompt = await this.promptBuilder.buildMemoryCompressionPrompt(
      chatHistory,
      profile,
    );

    const runtimeProvider = await this.resolveRuntimeProvider();
    const resolvedUsageContext: AiUsageContext = {
      surface: usageContext?.surface ?? 'app',
      scene: usageContext?.scene ?? 'memory_compress',
      scopeType: usageContext?.scopeType ?? 'character',
      scopeId: usageContext?.scopeId ?? profile.characterId,
      scopeLabel: usageContext?.scopeLabel ?? profile.name,
      ownerId: usageContext?.ownerId,
      characterId: usageContext?.characterId ?? profile.characterId,
      characterName: usageContext?.characterName ?? profile.name,
      conversationId: usageContext?.conversationId,
      groupId: usageContext?.groupId,
    };
    let failureProvider = runtimeProvider;

    try {
      const budgetedProvider = await this.prepareBudgetAwareProvider(
        runtimeProvider,
        'instance_default',
        resolvedUsageContext,
      );
      const provider = budgetedProvider.provider;
      failureProvider = provider;
      const client = this.createProviderClient(provider);
      const response = await client.chat.completions.create({
        model: provider.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.3,
      });

      const usage = this.normalizeUsageMetrics(response.usage);
      await this.recordSuccessfulUsage(
        provider,
        'instance_default',
        resolvedUsageContext,
        {
          usage,
          model: response.model ?? provider.model,
        },
        budgetedProvider.usageAudit,
      );

      return sanitizeAiText(response.choices[0]?.message?.content ?? '');
    } catch (err) {
      await this.recordFailedUsage(
        failureProvider,
        'instance_default',
        resolvedUsageContext,
        err,
      );
      this.logger.error('compressMemory error', err);
      return profile.memory?.recentSummary ?? profile.memorySummary;
    }
  }

  async extractCoreMemory(
    interactionHistory: string,
    profile: PersonalityProfile,
    usageContext?: AiUsageContext,
  ): Promise<string> {
    const prompt = await this.promptBuilder.buildCoreMemoryExtractionPrompt(
      interactionHistory,
      profile,
    );

    const runtimeProvider = await this.resolveRuntimeProvider();
    const resolvedUsageContext: AiUsageContext = {
      surface: usageContext?.surface ?? 'scheduler',
      scene: usageContext?.scene ?? 'core_memory_extract',
      scopeType: usageContext?.scopeType ?? 'character',
      scopeId: usageContext?.scopeId ?? profile.characterId,
      scopeLabel: usageContext?.scopeLabel ?? profile.name,
      ownerId: usageContext?.ownerId,
      characterId: usageContext?.characterId ?? profile.characterId,
      characterName: usageContext?.characterName ?? profile.name,
    };
    let failureProvider = runtimeProvider;

    try {
      const budgetedProvider = await this.prepareBudgetAwareProvider(
        runtimeProvider,
        'instance_default',
        resolvedUsageContext,
      );
      const provider = budgetedProvider.provider;
      failureProvider = provider;
      const client = this.createProviderClient(provider);
      const response = await client.chat.completions.create({
        model: provider.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.3,
      });

      const usage = this.normalizeUsageMetrics(response.usage);
      await this.recordSuccessfulUsage(
        provider,
        'instance_default',
        resolvedUsageContext,
        {
          usage,
          model: response.model ?? provider.model,
        },
        budgetedProvider.usageAudit,
      );

      return sanitizeAiText(response.choices[0]?.message?.content ?? '');
    } catch (err) {
      await this.recordFailedUsage(
        failureProvider,
        'instance_default',
        resolvedUsageContext,
        err,
      );
      this.logger.error('extractCoreMemory error', err);
      return profile.memory?.coreMemory ?? profile.memorySummary ?? '';
    }
  }

  async classifyIntent(
    userMessage: string,
    characterName: string,
    characterDomains: string[],
    usageContext?: AiUsageContext,
  ): Promise<{
    needsGroupChat: boolean;
    reason: string;
    requiredDomains: string[];
  }> {
    const runtimeProvider = await this.resolveRuntimeProvider();
    if (!runtimeProvider.apiKey) {
      return { needsGroupChat: false, reason: '', requiredDomains: [] };
    }

    const prompt = await this.promptBuilder.buildIntentClassificationPrompt(
      userMessage,
      characterName,
      characterDomains,
    );
    const resolvedUsageContext: AiUsageContext = {
      surface: usageContext?.surface ?? 'system',
      scene: usageContext?.scene ?? 'intent_classify',
      scopeType: usageContext?.scopeType ?? 'character',
      scopeId: usageContext?.scopeId,
      scopeLabel: usageContext?.scopeLabel ?? characterName,
      ownerId: usageContext?.ownerId,
      characterId: usageContext?.characterId,
      characterName: usageContext?.characterName ?? characterName,
      conversationId: usageContext?.conversationId,
      groupId: usageContext?.groupId,
    };

    let failureProvider = runtimeProvider;

    try {
      const budgetedProvider = await this.prepareBudgetAwareProvider(
        runtimeProvider,
        'instance_default',
        resolvedUsageContext,
      );
      const provider = budgetedProvider.provider;
      failureProvider = provider;
      const client = this.createProviderClient(provider);
      const response = await client.chat.completions.create({
        model: provider.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      const usage = this.normalizeUsageMetrics(response.usage);
      await this.recordSuccessfulUsage(
        provider,
        'instance_default',
        resolvedUsageContext,
        {
          usage,
          model: response.model ?? provider.model,
        },
        budgetedProvider.usageAudit,
      );

      const raw = response.choices[0]?.message?.content ?? '{}';
      return JSON.parse(raw) as {
        needsGroupChat: boolean;
        reason: string;
        requiredDomains: string[];
      };
    } catch (error) {
      await this.recordFailedUsage(
        failureProvider,
        'instance_default',
        resolvedUsageContext,
        error,
      );
      return { needsGroupChat: false, reason: '', requiredDomains: [] };
    }
  }

  async transcribeAudio(
    file: UploadedAudioFile,
    options: { conversationId?: string; mode?: string },
  ) {
    if (!file.buffer?.length) {
      throw new BadRequestException('没有收到可转写的音频内容。');
    }

    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('录音文件过大，请缩短单次语音输入时长。');
    }

    if (file.mimetype && !ACCEPTED_AUDIO_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        '当前录音格式暂不支持，请改用系统默认录音格式。',
      );
    }

    const provider = await this.resolveProviderConfig();
    if (!provider.transcriptionApiKey.trim()) {
      throw new ServiceUnavailableException(
        '当前实例未配置可用的 AI Key，暂时无法转写语音。',
      );
    }

    const client = new OpenAI({
      apiKey: provider.transcriptionApiKey,
      baseURL: provider.transcriptionEndpoint,
    });
    const startedAt = Date.now();

    try {
      const response = await this.retrySpeechRequest(
        'speech transcription',
        async () =>
          client.audio.transcriptions.create({
            file: await toFile(
              file.buffer,
              file.originalname || 'speech-input.webm',
              {
                type: file.mimetype || 'audio/webm',
              },
            ),
            model: provider.transcriptionModel,
            language: 'zh',
            prompt: '这是聊天输入语音转文字，请输出自然、简洁的中文口语内容。',
          }),
      );
      const text = response.text.trim();

      if (!text) {
        throw new BadGatewayException(
          '这段语音没有识别出有效文字，请再说一遍。',
        );
      }

      return {
        text,
        durationMs: Date.now() - startedAt,
        provider: provider.model,
      };
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      this.logger.error('speech transcription failed', {
        conversationId: options.conversationId,
        mode: options.mode,
        mimetype: file.mimetype,
        size: file.size,
        errorMessage: this.extractErrorMessage(error),
      });

      if (this.isAuthenticationFailure(error)) {
        throw new ServiceUnavailableException(
          '当前语音转写配置鉴权失败，请检查 Provider Key。',
        );
      }

      if (this.isTransientSpeechFailure(error)) {
        throw new ServiceUnavailableException(
          '当前语音转写通道繁忙，请稍后再试。',
        );
      }

      throw new BadGatewayException(
        '当前 Provider 暂不支持语音转写，请切换支持转写的模型或网关。',
      );
    }
  }

  async synthesizeSpeech(
    options: SpeechSynthesisOptions,
  ): Promise<SpeechSynthesisResult> {
    const provider = await this.resolveProviderConfig();
    if (!provider.apiKey.trim()) {
      throw new ServiceUnavailableException(
        '当前实例未配置可用的 AI Key，暂时无法生成语音。',
      );
    }

    const text = options.text.trim();
    if (!text) {
      throw new BadRequestException('请先提供要播报的文本。');
    }

    const voice =
      options.voice?.trim() || provider.ttsVoice || DEFAULT_TTS_VOICE;
    const client = this.createProviderClient(provider);
    const startedAt = Date.now();

    try {
      const response = await this.retrySpeechRequest('speech synthesis', () =>
        client.audio.speech.create({
          model: provider.ttsModel,
          voice,
          input: text,
          response_format: 'mp3',
          instructions: options.instructions?.trim() || undefined,
        }),
      );
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (!buffer.length) {
        throw new BadGatewayException('语音生成结果为空，请稍后再试。');
      }

      return {
        buffer,
        mimeType: 'audio/mpeg',
        fileExtension: 'mp3',
        durationMs: Date.now() - startedAt,
        provider: provider.ttsModel,
        voice,
      };
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      this.logger.error('speech synthesis failed', {
        conversationId: options.conversationId,
        characterId: options.characterId,
        voice,
        textLength: text.length,
        errorMessage: this.extractErrorMessage(error),
      });

      if (this.isAuthenticationFailure(error)) {
        throw new ServiceUnavailableException(
          '当前语音播报配置鉴权失败，请检查 Provider Key。',
        );
      }

      if (this.isTransientSpeechFailure(error)) {
        throw new ServiceUnavailableException(
          '当前语音播报通道繁忙，请稍后再试。',
        );
      }

      throw new BadGatewayException(
        '当前 Provider 暂不支持语音合成，请切换支持播报的模型或网关。',
      );
    }
  }
}
