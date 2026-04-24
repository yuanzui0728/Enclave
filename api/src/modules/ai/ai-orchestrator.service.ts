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
import { buildNativeAudioModelCandidates } from './native-audio-routing';
import { WorldService } from '../world/world.service';
import { ReplyLogicRulesService } from './reply-logic-rules.service';
import { AiUsageLedgerService } from '../analytics/ai-usage-ledger.service';
import { resolveReadableChatAttachmentPath } from '../chat/chat-attachment-storage';
import { resolveReadableMomentMediaPath } from '../moments/moment-media.storage';
import {
  InferenceService,
  type ResolvedInferenceCapabilityProfile,
} from '../inference/inference.service';

const DEFAULT_TTS_VOICE = 'alloy';
const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_INLINE_AUDIO_BYTES = 2 * 1024 * 1024;
const MAX_DOCUMENT_EXTRACTION_BYTES = 512 * 1024;
const MAX_DOCUMENT_EXTRACTED_TEXT_CHARS = 1800;
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

type ResponseInputFilePart = Extract<
  OpenAI.Responses.ResponseInputMessageContentList[number],
  { type: 'input_file' }
>;

type NativeAudioInputFormat = 'wav' | 'mp3';

type NativeAudioInputPart = OpenAI.Chat.ChatCompletionContentPartInputAudio;

type ResolvedProviderConfig = {
  accountId?: string;
  accountName?: string;
  allowOwnerKeyOverride?: boolean;
  appliedOwnerKeyOverride?: boolean;
  endpoint: string;
  model: string;
  apiKey: string;
  transcriptionEndpoint: string;
  transcriptionApiKey: string;
  transcriptionModel: string;
  ttsEndpoint: string;
  ttsApiKey: string;
  ttsModel: string;
  ttsVoice: string;
  imageGenerationEndpoint: string;
  imageGenerationApiKey: string;
  imageGenerationModel: string;
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

type ImageGenerationOptions = {
  prompt: string;
  conversationId?: string;
  characterId?: string;
  size?: '1024x1024' | '1024x1536' | '1536x1024';
};

type ImageGenerationResult = {
  buffer: Buffer;
  mimeType: string;
  fileExtension: string;
  provider: string;
  revisedPrompt?: string;
};

type PreparedReplyRequest = {
  systemPrompt: string;
  conversationHistory: ChatMessage[];
  currentUserMessage: ChatMessage;
  isGroupChat?: boolean;
  emptyTextFallback?: string;
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

type ProviderFallbackCapability =
  | 'text'
  | 'transcription'
  | 'tts'
  | 'image_generation';

type ProviderFallbackCandidate = {
  provider: ResolvedProviderConfig;
  billingSource: AiUsageBillingSource;
  reason:
    | 'character_instance_route'
    | 'instance_default_route'
    | 'enabled_provider_route';
};

type ChatCompletionTaskResult = {
  usage?:
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
      }
    | null;
  model?: string | null;
  choices: Array<{
    message?: {
      content?: string | null;
    } | null;
  }>;
};

@Injectable()
export class AiOrchestratorService {
  private readonly logger = new Logger(AiOrchestratorService.name);
  private readonly client: OpenAI;

  constructor(
    private readonly config: ConfigService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly inferenceService: InferenceService,
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
    return this.inferenceService.resolveRuntimeProviderConfig();
  }

  private async resolveRuntimeProvider(
    options?: {
      override?: AiKeyOverride;
      characterId?: string | null;
    },
  ): Promise<ResolvedProviderConfig> {
    const provider = await this.inferenceService.resolveRuntimeProviderConfig({
      characterId: options?.characterId,
    });

    return {
      ...provider,
      appliedOwnerKeyOverride:
        Boolean(options?.override?.apiKey?.trim()) &&
        provider.allowOwnerKeyOverride !== false,
      endpoint:
        options?.override?.apiBase && provider.allowOwnerKeyOverride !== false
          ? this.normalizeProviderEndpoint(options.override.apiBase)
        : provider.endpoint,
      apiKey:
        provider.allowOwnerKeyOverride !== false
          ? options?.override?.apiKey?.trim() || provider.apiKey
          : provider.apiKey,
      model: provider.model,
      transcriptionEndpoint: provider.transcriptionEndpoint,
      transcriptionApiKey: provider.transcriptionApiKey,
      transcriptionModel: provider.transcriptionModel,
      ttsEndpoint: provider.ttsEndpoint,
      ttsApiKey: provider.ttsApiKey,
      ttsModel: provider.ttsModel,
      ttsVoice: provider.ttsVoice,
      imageGenerationEndpoint: provider.imageGenerationEndpoint,
      imageGenerationApiKey: provider.imageGenerationApiKey,
      imageGenerationModel: provider.imageGenerationModel,
      apiStyle: provider.apiStyle,
      mode: provider.mode,
    };
  }

  private createProviderClientFromEndpoint(input: {
    endpoint: string;
    apiKey: string;
  }) {
    return new OpenAI({
      apiKey: input.apiKey,
      baseURL: this.normalizeProviderEndpoint(input.endpoint),
    });
  }

  private createProviderClient(provider: ResolvedProviderConfig) {
    return this.createProviderClientFromEndpoint({
      endpoint: provider.endpoint,
      apiKey: provider.apiKey,
    });
  }

  private async resolveProviderCapabilityProfile(
    provider: ResolvedProviderConfig,
  ): Promise<ResolvedInferenceCapabilityProfile> {
    return this.inferenceService.resolveCapabilityProfile({
      model: provider.model,
      ttsEndpoint: provider.ttsEndpoint,
      ttsApiKey: provider.ttsApiKey,
      ttsModel: provider.ttsModel,
      transcriptionEndpoint: provider.transcriptionEndpoint,
      transcriptionApiKey: provider.transcriptionApiKey,
      transcriptionModel: provider.transcriptionModel,
      imageGenerationEndpoint: provider.imageGenerationEndpoint,
      imageGenerationApiKey: provider.imageGenerationApiKey,
      imageGenerationModel: provider.imageGenerationModel,
      apiStyle: provider.apiStyle,
      mode: provider.mode,
    });
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

  private isReachableAssetUrl(url: string, provider: ResolvedProviderConfig) {
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

  private isReachableImageUrl(url: string, provider: ResolvedProviderConfig) {
    return this.isReachableAssetUrl(url, provider);
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
      case '.txt':
        return 'text/plain';
      case '.md':
      case '.markdown':
        return 'text/markdown';
      case '.csv':
        return 'text/csv';
      case '.json':
        return 'application/json';
      case '.xml':
        return 'application/xml';
      case '.html':
      case '.htm':
        return 'text/html';
      case '.pdf':
        return 'application/pdf';
      case '.doc':
        return 'application/msword';
      case '.docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
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

  private loadAssetFromDataUrl(url: string): LoadedAsset | null {
    const match = url.match(/^data:([^;,]+)?(;base64)?,(.*)$/is);
    if (!match) {
      return null;
    }

    try {
      const mimeType = this.normalizeMediaMimeType(match[1]);
      const buffer = match[2]
        ? Buffer.from(match[3] ?? '', 'base64')
        : Buffer.from(decodeURIComponent(match[3] ?? ''), 'utf8');
      return { buffer, mimeType };
    } catch {
      return null;
    }
  }

  private inferNativeAudioInputFormatFromMimeType(
    mimeType?: string | null,
  ): NativeAudioInputFormat | undefined {
    const normalized = this.normalizeMediaMimeType(mimeType);
    if (!normalized) {
      return undefined;
    }

    if (normalized === 'audio/mpeg') {
      return 'mp3';
    }
    if (
      normalized === 'audio/wav' ||
      normalized === 'audio/wave' ||
      normalized === 'audio/x-wav' ||
      normalized === 'audio/vnd.wave'
    ) {
      return 'wav';
    }

    return undefined;
  }

  private inferNativeAudioInputFormatFromFileName(
    fileName?: string | null,
  ): NativeAudioInputFormat | undefined {
    const ext = path
      .extname(fileName ?? '')
      .trim()
      .toLowerCase();
    if (ext === '.mp3') {
      return 'mp3';
    }
    if (ext === '.wav' || ext === '.wave') {
      return 'wav';
    }

    return undefined;
  }

  private inferNativeAudioInputFormat(
    part: Extract<AiMessagePart, { type: 'audio' }>,
    asset: LoadedAsset,
  ): NativeAudioInputFormat | undefined {
    return (
      this.inferNativeAudioInputFormatFromMimeType(part.mimeType) ??
      this.inferNativeAudioInputFormatFromMimeType(asset.mimeType) ??
      this.inferNativeAudioInputFormatFromFileName(part.fileName) ??
      this.inferNativeAudioInputFormatFromFileName(asset.fileName)
    );
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

  private isTextExtractableDocument(mimeType?: string, fileName?: string) {
    const normalizedMimeType = this.normalizeMediaMimeType(mimeType);
    if (normalizedMimeType) {
      if (/^text\//i.test(normalizedMimeType)) {
        return true;
      }

      if (
        /^(application\/json|application\/xml|application\/xhtml\+xml)$/i.test(
          normalizedMimeType,
        )
      ) {
        return true;
      }
    }

    return /\.(txt|md|markdown|csv|json|xml|html|htm)$/i.test(fileName ?? '');
  }

  private normalizeExtractedDocumentText(text: string, mimeType?: string) {
    let normalized = text.replace(/\u0000/g, ' ').trim();
    if (/html|xml/i.test(mimeType ?? '')) {
      normalized = normalized.replace(/<[^>]+>/g, ' ');
    }

    normalized = normalized.replace(/\r\n/g, '\n');
    normalized = normalized.replace(/[ \t]+\n/g, '\n');
    normalized = normalized.replace(/\n{3,}/g, '\n\n');
    normalized = normalized.replace(/[ \t]{2,}/g, ' ');
    normalized = normalized.trim();

    if (normalized.length <= MAX_DOCUMENT_EXTRACTED_TEXT_CHARS) {
      return normalized;
    }

    return `${normalized.slice(0, MAX_DOCUMENT_EXTRACTED_TEXT_CHARS).trim()}…`;
  }

  async tryExtractDocumentTextFromUrl(input: {
    url: string;
    mimeType?: string | null;
    fileName?: string | null;
    maxBytes?: number;
  }) {
    const normalizedMimeType =
      this.normalizeMediaMimeType(input.mimeType) ??
      this.inferMimeTypeFromFileName(input.fileName);
    if (
      !this.isTextExtractableDocument(
        normalizedMimeType,
        input.fileName ?? undefined,
      )
    ) {
      return null;
    }

    const asset = await this.loadAssetFromUrl(
      input.url,
      input.maxBytes ?? MAX_DOCUMENT_EXTRACTION_BYTES,
    );
    if (!asset?.buffer.length) {
      return null;
    }

    try {
      const extracted = this.normalizeExtractedDocumentText(
        asset.buffer.toString('utf8'),
        normalizedMimeType ?? asset.mimeType,
      );
      return extracted || null;
    } catch {
      return null;
    }
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

  private isTransientProviderFailure(error: unknown) {
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

  private isTransientSpeechFailure(error: unknown) {
    return this.isTransientProviderFailure(error);
  }

  private resolveImageGenerationModel(provider: ResolvedProviderConfig) {
    return provider.imageGenerationModel?.trim() || null;
  }

  private getImageFileExtension(mimeType?: string | null) {
    const normalizedMimeType = this.normalizeMediaMimeType(mimeType);
    switch (normalizedMimeType) {
      case 'image/jpeg':
        return 'jpg';
      case 'image/webp':
        return 'webp';
      default:
        return 'png';
    }
  }

  private isModelOrCapabilityFailure(error: unknown) {
    const message = this.extractErrorMessage(error);
    const status = this.extractErrorStatus(error);
    if (status === 404) {
      return true;
    }

    if (status === 400) {
      return /model|unsupported|not support|not supported|audio|speech|transcription|tts|responses api/i.test(
        message,
      );
    }

    return /model.+not found|no such model|unknown model|does not exist|unsupported|not support|not supported|audio.+not support|speech.+not support|transcription.+not support|tts.+not support|responses api/i.test(
      message,
    );
  }

  private isFallbackEligibleProviderFailure(error: unknown) {
    return (
      this.isAuthenticationFailure(error) ||
      this.isTransientProviderFailure(error) ||
      this.isModelOrCapabilityFailure(error)
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

  private hasProviderCapability(
    provider: ResolvedProviderConfig,
    capability: ProviderFallbackCapability,
  ) {
    switch (capability) {
      case 'transcription':
        return Boolean(
          provider.transcriptionApiKey?.trim() &&
            provider.transcriptionModel?.trim() &&
            provider.transcriptionEndpoint?.trim(),
        );
      case 'image_generation':
        return Boolean(
          provider.imageGenerationEndpoint?.trim() &&
            provider.imageGenerationApiKey?.trim() &&
            this.resolveImageGenerationModel(provider),
        );
      case 'tts':
        return Boolean(
          provider.ttsEndpoint?.trim() &&
            provider.ttsApiKey?.trim() &&
            provider.ttsModel?.trim(),
        );
      case 'text':
      default:
        return Boolean(provider.apiKey?.trim() && provider.model?.trim());
    }
  }

  private buildFallbackProviderKey(
    provider: ResolvedProviderConfig,
    capability: ProviderFallbackCapability,
  ) {
    switch (capability) {
      case 'transcription':
        return [
          provider.mode,
          provider.transcriptionEndpoint,
          provider.transcriptionApiKey,
          provider.transcriptionModel,
        ].join('|');
      case 'image_generation':
        return [
          provider.mode,
          provider.imageGenerationEndpoint,
          provider.imageGenerationApiKey,
          this.resolveImageGenerationModel(provider),
        ].join('|');
      case 'tts':
        return [
          provider.mode,
          provider.ttsEndpoint,
          provider.ttsApiKey,
          provider.ttsModel,
        ].join('|');
      case 'text':
      default:
        return [
          provider.mode,
          provider.endpoint,
          provider.apiKey,
          provider.model,
          provider.apiStyle,
        ].join('|');
    }
  }

  private async resolveFallbackProviders(options: {
    currentProvider: ResolvedProviderConfig;
    characterId?: string | null;
    capability: ProviderFallbackCapability;
    includeSameRouteInstanceProvider?: boolean;
  }): Promise<ProviderFallbackCandidate[]> {
    const candidates: ProviderFallbackCandidate[] = [];
    const seenKeys = new Set<string>([
      this.buildFallbackProviderKey(
        options.currentProvider,
        options.capability,
      ),
    ]);

    const pushCandidate = (
      provider: ResolvedProviderConfig,
      billingSource: AiUsageBillingSource,
      reason: ProviderFallbackCandidate['reason'],
    ) => {
      if (!this.hasProviderCapability(provider, options.capability)) {
        return;
      }

      const providerKey = this.buildFallbackProviderKey(
        provider,
        options.capability,
      );
      if (seenKeys.has(providerKey)) {
        return;
      }

      seenKeys.add(providerKey);
      candidates.push({
        provider,
        billingSource,
        reason,
      });
    };

    if (options.includeSameRouteInstanceProvider) {
      pushCandidate(
        await this.resolveRuntimeProvider({
          characterId: options.characterId,
        }),
        'instance_default',
        'character_instance_route',
      );
    }

    const runtimeProviders =
      await this.inferenceService.listEnabledRuntimeProviderConfigs({
        characterId: options.characterId,
      });
    runtimeProviders.forEach((provider, index) => {
      pushCandidate(
        provider,
        'instance_default',
        index === 0 ? 'instance_default_route' : 'enabled_provider_route',
      );
    });

    return candidates;
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

  private async requestChatTaskWithFallback(options: {
    usageContext: AiUsageContext;
    characterId?: string | null;
    label: string;
    request: (
      client: OpenAI,
      provider: ResolvedProviderConfig,
    ) => Promise<ChatCompletionTaskResult>;
  }): Promise<ChatCompletionTaskResult> {
    const characterId = options.characterId ?? options.usageContext.characterId;
    const primaryProvider = await this.resolveRuntimeProvider({
      characterId,
    });
    const fallbackProviders = await this.resolveFallbackProviders({
      currentProvider: primaryProvider,
      characterId,
      capability: 'text',
    });
    const attempts = [
      {
        provider: primaryProvider,
        billingSource: 'instance_default' as const,
        reason: 'primary' as const,
      },
      ...fallbackProviders,
    ];
    let attemptedProvider = false;
    let lastError: unknown = new ServiceUnavailableException(
      '当前实例未配置可用的 AI Key，暂时无法完成该 AI 任务。',
    );

    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index];
      if (!this.hasProviderCapability(attempt.provider, 'text')) {
        continue;
      }

      attemptedProvider = true;
      const budgetedProvider = await this.prepareBudgetAwareProvider(
        attempt.provider,
        attempt.billingSource,
        options.usageContext,
      );
      const provider = budgetedProvider.provider;
      const client = this.createProviderClient(provider);

      try {
        const response = await options.request(client, provider);
        const usage = this.normalizeUsageMetrics(response.usage);
        await this.recordSuccessfulUsage(
          provider,
          attempt.billingSource,
          options.usageContext,
          {
            usage,
            model: response.model ?? provider.model,
          },
          budgetedProvider.usageAudit,
        );
        return response;
      } catch (error) {
        lastError = error;
        await this.recordFailedUsage(
          provider,
          attempt.billingSource,
          options.usageContext,
          error,
        );

        const hasMoreFallback = index < attempts.length - 1;
        if (!hasMoreFallback || !this.isFallbackEligibleProviderFailure(error)) {
          this.logger.error(`${options.label} failed`, {
            scene: options.usageContext.scene,
            characterId: characterId ?? null,
            model: provider.model,
            billingSource: attempt.billingSource,
            errorMessage: this.extractErrorMessage(error),
          });
          throw error;
        }

        this.logger.warn(`${options.label} fallback scheduled`, {
          scene: options.usageContext.scene,
          characterId: characterId ?? null,
          fromModel: provider.model,
          toModel: attempts[index + 1]?.provider.model,
          reason: attempt.reason,
          errorMessage: this.extractErrorMessage(error),
        });
      }
    }

    if (!attemptedProvider) {
      throw new ServiceUnavailableException(
        '当前实例未配置可用的 AI Key，暂时无法完成该 AI 任务。',
      );
    }

    throw lastError;
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
      emptyTextFallback,
    } = request;
    const hasImageInput = this.requestContainsImageInput(request);
    const hasAudioInput = this.requestContainsAudioInput(request);
    const hasDocumentInput = this.requestContainsDocumentInput(request);
    const capabilities = await this.resolveProviderCapabilityProfile(provider);
    const allowNativeImageInput =
      hasImageInput && capabilities.supportsNativeImageInput;
    const allowNativeAudioInput =
      hasAudioInput && capabilities.supportsNativeAudioInput;
    const allowNativeDocumentInput =
      hasDocumentInput && capabilities.supportsNativeDocumentInput;

    const execute = async (
      allowImageInput: boolean,
      allowAudioInput: boolean,
      allowDocumentInput: boolean,
    ): Promise<GenerateReplyResult> => {
      if (provider.apiStyle === 'openai-responses') {
        const historyMessages = await Promise.all(
          conversationHistory.map((message) =>
            this.buildResponsesMessage(
              message,
              provider,
              capabilities,
              isGroupChat,
              allowImageInput,
              allowDocumentInput,
            ),
          ),
        );
        const currentMessage = await this.buildResponsesMessage(
          currentUserMessage,
          provider,
          capabilities,
          isGroupChat,
          allowImageInput,
          allowDocumentInput,
        );
        const response = await client.responses.create({
          model: provider.model,
          instructions: systemPrompt,
          input: [...historyMessages, currentMessage],
          max_output_tokens: 500,
          temperature: 0.85,
        });

        const rawText = response.output_text ?? '';
        const text =
          sanitizeAiText(rawText) || emptyTextFallback || '（无回复）';
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
            allowAudioInput,
          ),
        ),
      );
      const currentMessage = await this.buildChatCompletionMessage(
        currentUserMessage,
        provider,
        isGroupChat,
        allowImageInput,
        allowAudioInput,
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

      const rawText = response.choices[0]?.message?.content ?? '';
      const text =
        sanitizeAiText(rawText) || emptyTextFallback || '（无回复）';
      const usage = this.normalizeUsageMetrics(response.usage);

      return {
        text,
        tokensUsed: usage.totalTokens ?? 0,
        usage,
        model: response.model ?? provider.model,
      };
    };

    try {
      return await execute(
        allowNativeImageInput,
        allowNativeAudioInput,
        allowNativeDocumentInput,
      );
    } catch (error) {
      if (
        (allowNativeImageInput && this.isUnsupportedImageInputError(error)) ||
        (allowNativeAudioInput && this.isUnsupportedAudioInputError(error)) ||
        (allowNativeDocumentInput &&
          this.isUnsupportedDocumentInputError(error))
      ) {
        this.logger.warn(
          'Provider rejected native multimodal input, retrying with text-only fallback',
          {
            model: provider.model,
            errorMessage: this.extractErrorMessage(error),
          },
        );
        return execute(false, false, false);
      }

      throw error;
    }
  }

  async resolveRuntimeCapabilityProfile(options?: {
    override?: AiKeyOverride;
    characterId?: string | null;
  }) {
    const provider = await this.resolveRuntimeProvider({
      override: options?.override,
      characterId: options?.characterId,
    });
    return this.resolveProviderCapabilityProfile(provider);
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

  private async collectUsableDocumentParts(
    parts: AiMessagePart[] | undefined,
    provider: ResolvedProviderConfig,
    capabilities: ResolvedInferenceCapabilityProfile,
  ): Promise<ResponseInputFilePart[]> {
    if (!parts?.length || !capabilities.supportsNativeDocumentInput) {
      return [];
    }

    const documentParts = parts.filter(
      (part): part is Extract<AiMessagePart, { type: 'document' }> =>
        part.type === 'document',
    );
    const resolvedParts: Array<ResponseInputFilePart | null> =
      await Promise.all(
        documentParts.map(async (part) => {
          if (this.isReachableAssetUrl(part.url, provider)) {
            return {
              type: 'input_file',
              file_url: part.url,
              filename: part.fileName,
              detail: 'high',
            };
          }

          const loadedAsset = await this.loadAssetFromUrl(
            part.url,
            capabilities.maxInlineFileBytes,
          );
          if (!loadedAsset?.buffer.length) {
            return null;
          }

          return {
            type: 'input_file',
            file_data: loadedAsset.buffer.toString('base64'),
            filename: part.fileName || loadedAsset.fileName,
            detail: 'high',
          };
        }),
      );

    return resolvedParts.filter((part): part is ResponseInputFilePart =>
      Boolean(part),
    );
  }

  private async collectUsableAudioParts(
    parts: AiMessagePart[] | undefined,
  ): Promise<NativeAudioInputPart[]> {
    if (!parts?.length) {
      return [];
    }

    const audioParts = parts.filter(
      (part): part is Extract<AiMessagePart, { type: 'audio' }> =>
        part.type === 'audio',
    );
    const resolvedParts: Array<NativeAudioInputPart | null> =
      await Promise.all(
        audioParts.map(async (part) => {
          const loadedAsset = part.audioUrl.startsWith('data:')
            ? this.loadAssetFromDataUrl(part.audioUrl)
            : await this.loadAssetFromUrl(part.audioUrl, MAX_INLINE_AUDIO_BYTES);
          if (
            !loadedAsset?.buffer.length ||
            loadedAsset.buffer.byteLength > MAX_INLINE_AUDIO_BYTES
          ) {
            return null;
          }

          const format = this.inferNativeAudioInputFormat(part, loadedAsset);
          if (!format) {
            return null;
          }

          return {
            type: 'input_audio',
            input_audio: {
              data: loadedAsset.buffer.toString('base64'),
              format,
            },
          };
        }),
      );

    return resolvedParts.filter((part): part is NativeAudioInputPart =>
      Boolean(part),
    );
  }

  private async buildChatCompletionMessage(
    message: ChatMessage,
    provider: ResolvedProviderConfig,
    isGroupChat?: boolean,
    allowImageInput = true,
    allowAudioInput = true,
  ): Promise<OpenAI.Chat.ChatCompletionMessageParam> {
    const textContent = this.buildMessageText(message, isGroupChat);
    const imageParts = allowImageInput
      ? await this.collectUsableImageParts(message.parts, provider)
      : [];
    const audioParts = allowAudioInput
      ? await this.collectUsableAudioParts(message.parts)
      : [];
    if (
      message.role !== 'user' ||
      (!imageParts.length && !audioParts.length)
    ) {
      return {
        role: message.role,
        content: textContent,
      };
    }

    const contentParts: Array<
      | OpenAI.Chat.ChatCompletionContentPartText
      | OpenAI.Chat.ChatCompletionContentPartImage
      | NativeAudioInputPart
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

    audioParts.forEach((part) => {
      contentParts.push(part);
    });

    return {
      role: 'user',
      content: contentParts,
    };
  }

  private async buildResponsesMessage(
    message: ChatMessage,
    provider: ResolvedProviderConfig,
    capabilities: ResolvedInferenceCapabilityProfile,
    isGroupChat?: boolean,
    allowImageInput = true,
    allowDocumentInput = true,
  ): Promise<OpenAI.Responses.EasyInputMessage> {
    const textContent = this.buildMessageText(message, isGroupChat);
    const imageParts = allowImageInput
      ? await this.collectUsableImageParts(message.parts, provider)
      : [];
    const documentParts = allowDocumentInput
      ? await this.collectUsableDocumentParts(
          message.parts,
          provider,
          capabilities,
        )
      : [];
    if (
      message.role !== 'user' ||
      (!imageParts.length && !documentParts.length)
    ) {
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

    documentParts.forEach((part) => {
      contentParts.push(part);
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

  private requestContainsAudioInput(request: PreparedReplyRequest) {
    return [...request.conversationHistory, request.currentUserMessage].some(
      (message) => message.parts?.some((part) => part.type === 'audio'),
    );
  }

  private requestContainsDocumentInput(request: PreparedReplyRequest) {
    return [...request.conversationHistory, request.currentUserMessage].some(
      (message) => message.parts?.some((part) => part.type === 'document'),
    );
  }

  private buildReplyProviderAttemptChain(
    provider: ResolvedProviderConfig,
    request: PreparedReplyRequest,
  ) {
    const hasAudioInput = this.requestContainsAudioInput(request);
    if (!hasAudioInput) {
      return [provider];
    }

    if (
      this.requestContainsImageInput(request) ||
      this.requestContainsDocumentInput(request)
    ) {
      return [provider];
    }

    const seenModels = new Set<string>();
    const attempts: ResolvedProviderConfig[] = [];
    for (const model of buildNativeAudioModelCandidates(provider.model)) {
      const normalizedModel = model.trim().toLowerCase();
      if (!normalizedModel || seenModels.has(normalizedModel)) {
        continue;
      }

      seenModels.add(normalizedModel);
      attempts.push(
        model === provider.model
          ? provider
          : {
              ...provider,
              model,
            },
      );
    }

    return attempts.length ? attempts : [provider];
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

  private isUnsupportedAudioInputError(error: unknown) {
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

    return /audio|input_audio|unsupported.*audio|does not support audio|content part/i.test(
      message,
    );
  }

  private isUnsupportedDocumentInputError(error: unknown) {
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

    return /file|input_file|document|unsupported.*file|content part/i.test(
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
      extraSystemPromptSections,
      aiKeyOverride,
    } = options;
    const provider = await this.resolveRuntimeProvider({
      override: aiKeyOverride,
      characterId: profile.characterId,
    });
    const systemPrompt = await this.buildSystemPrompt(
      profile,
      isGroupChat,
      chatContext,
      this.resolveSceneKey(options.usageContext?.scene),
      extraSystemPromptSections,
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
    characterId?: string;
    mode?: string;
    throwOnFailure?: boolean;
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
          characterId: input.characterId,
          mode: input.mode,
        },
      );
    } catch (error) {
      if (input.throwOnFailure) {
        throw error;
      }

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
    extraSystemPromptSections?: string[],
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

    if (extraSystemPromptSections?.length) {
      systemPrompt = [
        systemPrompt,
        ...extraSystemPromptSections.map((item) => item.trim()).filter(Boolean),
      ].join('\n\n');
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
      extraSystemPromptSections,
      aiKeyOverride,
      emptyTextFallback,
    } = options;
    const usageContext = this.resolveReplyUsageContext(profile, options);
    const runtimeProvider = await this.resolveRuntimeProvider({
      override: aiKeyOverride,
      characterId: profile.characterId,
    });
    const ownerKeyApplied = runtimeProvider.appliedOwnerKeyOverride === true;
    if (!runtimeProvider.apiKey) {
      return this.buildUnavailableReply(profile);
    }

    const systemPrompt = await this.buildSystemPrompt(
      profile,
      isGroupChat,
      chatContext,
      this.resolveSceneKey(usageContext.scene),
      extraSystemPromptSections,
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
      emptyTextFallback,
    };
    const billingSource: AiUsageBillingSource = ownerKeyApplied
      ? 'owner_custom'
      : 'instance_default';
    const replyProviderAttempts = this.buildReplyProviderAttemptChain(
      runtimeProvider,
      request,
    );
    let failedProvider = runtimeProvider;
    let failedBillingSource = billingSource;
    let failedError: unknown = new ServiceUnavailableException(
      '当前实例未配置可用的 AI Key，暂时无法完成该 AI 任务。',
    );

    for (let index = 0; index < replyProviderAttempts.length; index += 1) {
      const attemptProvider = replyProviderAttempts[index];
      let budgetedProvider: BudgetAwareProviderResult = {
        provider: attemptProvider,
      };
      try {
        budgetedProvider = await this.prepareBudgetAwareProvider(
          attemptProvider,
          billingSource,
          usageContext,
        );
        const result = await this.requestReplyFromProvider(
          budgetedProvider.provider,
          request,
        );
        await this.recordSuccessfulUsage(
          budgetedProvider.provider,
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
        failedProvider = budgetedProvider.provider;
        failedBillingSource = billingSource;
        failedError = err;
        await this.recordFailedUsage(
          budgetedProvider.provider,
          billingSource,
          usageContext,
          err,
        );
        const hasMoreReplyCandidates = index < replyProviderAttempts.length - 1;
        if (
          hasMoreReplyCandidates &&
          this.isFallbackEligibleProviderFailure(err)
        ) {
          this.logger.warn('AI reply model reroute scheduled', {
            characterId: profile.characterId,
            fromModel: budgetedProvider.provider.model,
            toModel: replyProviderAttempts[index + 1]?.model,
            reason: 'native_audio_routing',
            errorMessage: this.extractErrorMessage(err),
          });
          continue;
        }

        break;
      }
    }

    if (this.isFallbackEligibleProviderFailure(failedError)) {
      const fallbackCandidates = await this.resolveFallbackProviders({
        currentProvider: failedProvider,
        characterId: profile.characterId,
        capability: 'text',
        includeSameRouteInstanceProvider: ownerKeyApplied,
      });

      for (const candidate of fallbackCandidates) {
        this.logger.warn('AI reply provider fallback scheduled', {
          characterId: profile.characterId,
          fromModel: failedProvider.model,
          toModel: candidate.provider.model,
          reason: candidate.reason,
          errorMessage: this.extractErrorMessage(failedError),
        });

        let fallbackProvider = candidate.provider;
        try {
          const budgetedFallbackProvider =
            await this.prepareBudgetAwareProvider(
              candidate.provider,
              candidate.billingSource,
              usageContext,
            );
          fallbackProvider = budgetedFallbackProvider.provider;
          const fallbackResult = await this.requestReplyFromProvider(
            fallbackProvider,
            request,
          );
          await this.recordSuccessfulUsage(
            fallbackProvider,
            candidate.billingSource,
            usageContext,
            fallbackResult,
            budgetedFallbackProvider.usageAudit,
          );
          return {
            ...fallbackResult,
            billingSource: candidate.billingSource,
          };
        } catch (fallbackError) {
          failedProvider = fallbackProvider;
          failedBillingSource = candidate.billingSource;
          failedError = fallbackError;
          await this.recordFailedUsage(
            fallbackProvider,
            candidate.billingSource,
            usageContext,
            fallbackError,
          );
          this.logger.warn('AI reply provider fallback failed', {
            characterId: profile.characterId,
            model: fallbackProvider.model,
            reason: candidate.reason,
            errorMessage: this.extractErrorMessage(fallbackError),
          });

          if (!this.isFallbackEligibleProviderFailure(fallbackError)) {
            break;
          }
        }
      }
    }

    this.logger.error('AI provider error', failedError);
    if (this.isAuthenticationFailure(failedError)) {
      throw new AiProviderAuthError(failedBillingSource);
    }

    throw failedError;
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
        const response = await this.requestChatTaskWithFallback({
          usageContext: resolvedUsageContext,
          characterId: profile.characterId,
          label: `${sceneKey} generation`,
          request: (client, activeProvider) =>
            client.chat.completions.create({
              model: activeProvider.model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: taskPrompts[attempt] },
              ],
              max_tokens: sceneKey === 'channel_post' ? 220 : 170,
              temperature: attempt === 0 ? 0.9 : 0.72,
            }),
        });

        const text = sanitizeAiText(response.choices[0]?.message?.content ?? '');
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
    const userPrompts = [promptRequest.userPrompt, promptRequest.retryUserPrompt];

    for (let attempt = 0; attempt < userPrompts.length; attempt += 1) {
      const response = await this.requestChatTaskWithFallback({
        usageContext: resolvedUsageContext,
        characterId: profile.characterId,
        label: 'moment generation',
        request: (client, activeProvider) =>
          client.chat.completions.create({
            model: activeProvider.model,
            messages: [
              { role: 'system', content: promptRequest.systemPrompt },
              { role: 'user', content: userPrompts[attempt] },
            ],
            max_tokens: 180,
            temperature: attempt === 0 ? 0.9 : 0.75,
          }),
      });

      const text = sanitizeAiText(response.choices[0]?.message?.content ?? '');
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
    const response = await this.requestChatTaskWithFallback({
      usageContext: resolvedUsageContext,
      characterId: resolvedUsageContext.characterId,
      label: 'personality extraction',
      request: (client, provider) =>
        client.chat.completions.create({
          model: provider.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 600,
          temperature: 0.3,
          response_format: { type: 'json_object' },
        }),
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      this.logger.error('Failed to parse personality JSON', raw);
      return {};
    }
  }

  async generateQuickCharacter(
    description: string,
    options?: {
      timeoutMs?: number;
    },
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
  "memorySummary": "这个人给用户的熟悉感和关系分寸（一句话）",
  "basePrompt": "这个人自己的说话方式和边界（2-4句话，不要写成助理说明书，不要出现括号动作）"
}`;

    const usageContext: AiUsageContext = {
      surface: 'admin',
      scene: 'quick_character_generate',
      scopeType: 'admin_task',
      scopeLabel: description.slice(0, 48) || 'quick-character',
    };
    const response = await this.requestChatTaskWithFallback({
      usageContext,
      label: 'quick character generation',
      request: (client, provider) =>
        client.chat.completions.create({
          model: provider.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 800,
          temperature: 0.8,
          response_format: { type: 'json_object' },
        }),
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      this.logger.error('Failed to parse quick character JSON', raw);
      return {};
    }
  }

  async generateJsonObject(options: {
    prompt: string;
    usageContext: AiUsageContext;
    maxTokens?: number;
    temperature?: number;
    fallback?: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    try {
      const response = await this.requestChatTaskWithFallback({
        usageContext: options.usageContext,
        characterId: options.usageContext.characterId,
        label: 'json generation',
        request: (client, provider) =>
          client.chat.completions.create({
            model: provider.model,
            messages: [{ role: 'user', content: options.prompt }],
            max_tokens: options.maxTokens ?? 1200,
            temperature: options.temperature ?? 0.3,
            response_format: { type: 'json_object' },
          }),
      });

      const raw = response.choices[0]?.message?.content ?? '{}';
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        this.logger.error('Failed to parse JSON task result', raw);
        return options.fallback ?? {};
      }
    } catch (error) {
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
    try {
      const response = await this.requestChatTaskWithFallback({
        usageContext: options.usageContext,
        characterId: options.usageContext.characterId,
        label: 'plain text generation',
        request: (client, provider) =>
          client.chat.completions.create({
            model: provider.model,
            messages: [{ role: 'user', content: options.prompt }],
            max_tokens: options.maxTokens ?? 800,
            temperature: options.temperature ?? 0.4,
          }),
      });

      return sanitizeAiText(response.choices[0]?.message?.content ?? '');
    } catch (error) {
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

    try {
      const response = await this.requestChatTaskWithFallback({
        usageContext: resolvedUsageContext,
        characterId: profile.characterId,
        label: 'memory compression',
        request: (client, provider) =>
          client.chat.completions.create({
            model: provider.model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 200,
            temperature: 0.3,
          }),
      });

      return sanitizeAiText(response.choices[0]?.message?.content ?? '');
    } catch (err) {
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
    try {
      const response = await this.requestChatTaskWithFallback({
        usageContext: resolvedUsageContext,
        characterId: resolvedUsageContext.characterId,
        label: 'core memory extraction',
        request: (client, provider) =>
          client.chat.completions.create({
            model: provider.model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 300,
            temperature: 0.3,
          }),
      });

      return sanitizeAiText(response.choices[0]?.message?.content ?? '');
    } catch (err) {
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

    try {
      const response = await this.requestChatTaskWithFallback({
        usageContext: resolvedUsageContext,
        characterId: resolvedUsageContext.characterId,
        label: 'intent classification',
        request: (client, provider) =>
          client.chat.completions.create({
            model: provider.model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 200,
            temperature: 0.1,
            response_format: { type: 'json_object' },
          }),
      });

      const raw = response.choices[0]?.message?.content ?? '{}';
      return JSON.parse(raw) as {
        needsGroupChat: boolean;
        reason: string;
        requiredDomains: string[];
      };
    } catch (error) {
      return { needsGroupChat: false, reason: '', requiredDomains: [] };
    }
  }

  private toSpeechTranscriptionException(error: unknown) {
    if (
      error instanceof BadRequestException ||
      error instanceof BadGatewayException ||
      error instanceof ServiceUnavailableException
    ) {
      return error;
    }

    if (this.isAuthenticationFailure(error)) {
      return new ServiceUnavailableException(
        '当前语音转写配置鉴权失败，请检查 Provider Key。',
      );
    }

    if (this.isTransientSpeechFailure(error)) {
      return new ServiceUnavailableException(
        '当前语音转写通道繁忙，请稍后再试。',
      );
    }

    return new BadGatewayException(
      '当前 Provider 暂不支持语音转写，请切换支持转写的模型或网关。',
    );
  }

  private toSpeechSynthesisException(error: unknown) {
    if (
      error instanceof BadRequestException ||
      error instanceof BadGatewayException ||
      error instanceof ServiceUnavailableException
    ) {
      return error;
    }

    if (this.isAuthenticationFailure(error)) {
      return new ServiceUnavailableException(
        '当前语音播报配置鉴权失败，请检查 Provider Key。',
      );
    }

    if (this.isTransientSpeechFailure(error)) {
      return new ServiceUnavailableException(
        '当前语音播报通道繁忙，请稍后再试。',
      );
    }

    return new BadGatewayException(
      '当前 Provider 暂不支持语音合成，请切换支持播报的模型或网关。',
    );
  }

  private toImageGenerationException(error: unknown) {
    if (
      error instanceof BadRequestException ||
      error instanceof BadGatewayException ||
      error instanceof ServiceUnavailableException
    ) {
      return error;
    }

    if (this.isAuthenticationFailure(error)) {
      return new ServiceUnavailableException(
        '当前图片生成配置鉴权失败，请检查 Provider Key。',
      );
    }

    if (this.isTransientProviderFailure(error)) {
      return new ServiceUnavailableException(
        '当前图片生成通道繁忙，请稍后再试。',
      );
    }

    return new BadGatewayException(
      '当前 Provider 暂不支持图片生成，请切换支持出图的模型或网关。',
    );
  }

  async generateImage(
    options: ImageGenerationOptions,
  ): Promise<ImageGenerationResult> {
    const prompt = options.prompt.trim();
    if (!prompt) {
      throw new BadRequestException('请先提供图片生成描述。');
    }

    const primaryProvider = await this.resolveRuntimeProvider({
      characterId: options.characterId,
    });
    const fallbackProviders = await this.resolveFallbackProviders({
      currentProvider: primaryProvider,
      characterId: options.characterId,
      capability: 'image_generation',
    });
    const attempts = [
      {
        provider: primaryProvider,
        reason: 'primary' as const,
      },
      ...fallbackProviders,
    ];
    let attemptedProvider = false;
    let lastError: unknown = new ServiceUnavailableException(
      '当前实例未配置可用的图片生成通道。',
    );

    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index];
      const provider = attempt.provider;
      const imageModel = this.resolveImageGenerationModel(provider);
      if (!imageModel || !this.hasProviderCapability(provider, 'image_generation')) {
        continue;
      }

      attemptedProvider = true;
      const client = this.createProviderClientFromEndpoint({
        endpoint: provider.imageGenerationEndpoint,
        apiKey: provider.imageGenerationApiKey,
      });
      try {
        const body: OpenAI.Images.ImageGenerateParamsNonStreaming = {
          model: imageModel,
          prompt,
        };
        if (/^(gpt-image|chatgpt-image)/i.test(imageModel)) {
          body.output_format = 'png';
          body.quality = 'medium';
          body.size = options.size ?? '1024x1024';
        } else if (/^dall-e-3/i.test(imageModel)) {
          body.quality = 'standard';
          body.response_format = 'b64_json';
          body.size = '1024x1024';
        } else if (/^dall-e-2/i.test(imageModel)) {
          body.response_format = 'b64_json';
          body.size = '1024x1024';
        }

        const response = await client.images.generate(body);
        const image = 'data' in response ? response.data?.[0] : undefined;
        if (!image) {
          throw new BadGatewayException('图片生成结果为空，请稍后再试。');
        }

        if (image.b64_json) {
          const buffer = Buffer.from(image.b64_json, 'base64');
          if (!buffer.length) {
            throw new BadGatewayException('图片生成结果为空，请稍后再试。');
          }

          return {
            buffer,
            mimeType: 'image/png',
            fileExtension: 'png',
            provider: imageModel,
            revisedPrompt: image.revised_prompt,
          };
        }

        if (image.url) {
          const asset = await this.loadAssetFromUrl(image.url, 10 * 1024 * 1024);
          if (!asset?.buffer.length) {
            throw new BadGatewayException('图片生成结果为空，请稍后再试。');
          }

          const mimeType =
            this.normalizeMediaMimeType(asset.mimeType) ?? 'image/png';
          return {
            buffer: asset.buffer,
            mimeType,
            fileExtension: this.getImageFileExtension(mimeType),
            provider: imageModel,
            revisedPrompt: image.revised_prompt,
          };
        }

        throw new BadGatewayException('图片生成结果为空，请稍后再试。');
      } catch (error) {
        lastError = error;
        const hasMoreFallback = index < attempts.length - 1;
        if (!hasMoreFallback || !this.isFallbackEligibleProviderFailure(error)) {
          this.logger.error('image generation failed', {
            conversationId: options.conversationId,
            characterId: options.characterId,
            model: imageModel,
            promptLength: prompt.length,
            errorMessage: this.extractErrorMessage(error),
          });
          throw this.toImageGenerationException(error);
        }

        this.logger.warn('image generation fallback scheduled', {
          conversationId: options.conversationId,
          characterId: options.characterId,
          fromModel: imageModel,
          toModel: this.resolveImageGenerationModel(
            attempts[index + 1]?.provider ?? provider,
          ),
          reason: attempt.reason,
          errorMessage: this.extractErrorMessage(error),
        });
      }
    }

    if (!attemptedProvider) {
      throw new ServiceUnavailableException(
        '当前实例未配置可用的图片生成通道。',
      );
    }

    throw this.toImageGenerationException(lastError);
  }

  async transcribeAudio(
    file: UploadedAudioFile,
    options: { conversationId?: string; characterId?: string; mode?: string },
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

    const primaryProvider = await this.resolveRuntimeProvider({
      characterId: options.characterId,
    });
    const fallbackProviders = await this.resolveFallbackProviders({
      currentProvider: primaryProvider,
      characterId: options.characterId,
      capability: 'transcription',
    });
    const attempts = [
      {
        provider: primaryProvider,
        reason: 'primary' as const,
      },
      ...fallbackProviders,
    ];
    const startedAt = Date.now();
    let attemptedProvider = false;
    let lastError: unknown = new ServiceUnavailableException(
      '当前实例未配置可用的 AI Key，暂时无法转写语音。',
    );

    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index];
      const provider = attempt.provider;
      if (!this.hasProviderCapability(provider, 'transcription')) {
        continue;
      }

      attemptedProvider = true;
      const client = new OpenAI({
        apiKey: provider.transcriptionApiKey,
        baseURL: provider.transcriptionEndpoint,
      });

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
          provider: provider.transcriptionModel || provider.model,
        };
      } catch (error) {
        lastError = error;
        const hasMoreFallback = index < attempts.length - 1;
        if (!hasMoreFallback || !this.isFallbackEligibleProviderFailure(error)) {
          this.logger.error('speech transcription failed', {
            conversationId: options.conversationId,
            characterId: options.characterId,
            mode: options.mode,
            mimetype: file.mimetype,
            size: file.size,
            errorMessage: this.extractErrorMessage(error),
          });
          throw this.toSpeechTranscriptionException(error);
        }

        this.logger.warn('speech transcription fallback scheduled', {
          conversationId: options.conversationId,
          characterId: options.characterId,
          mode: options.mode,
          fromModel: provider.transcriptionModel || provider.model,
          toModel:
            attempts[index + 1]?.provider.transcriptionModel ||
            attempts[index + 1]?.provider.model,
          reason: attempt.reason,
          errorMessage: this.extractErrorMessage(error),
        });
      }
    }

    if (!attemptedProvider) {
      throw new ServiceUnavailableException(
        '当前实例未配置可用的 AI Key，暂时无法转写语音。',
      );
    }

    throw this.toSpeechTranscriptionException(lastError);
  }

  async synthesizeSpeech(
    options: SpeechSynthesisOptions,
  ): Promise<SpeechSynthesisResult> {
    const primaryProvider = await this.resolveRuntimeProvider({
      characterId: options.characterId,
    });
    const fallbackProviders = await this.resolveFallbackProviders({
      currentProvider: primaryProvider,
      characterId: options.characterId,
      capability: 'tts',
    });
    const attempts = [
      {
        provider: primaryProvider,
        reason: 'primary' as const,
      },
      ...fallbackProviders,
    ];

    const text = options.text.trim();
    if (!text) {
      throw new BadRequestException('请先提供要播报的文本。');
    }

    const startedAt = Date.now();
    let attemptedProvider = false;
    let lastError: unknown = new ServiceUnavailableException(
      '当前实例未配置可用的 AI Key，暂时无法生成语音。',
    );

    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index];
      const provider = attempt.provider;
      if (!this.hasProviderCapability(provider, 'tts')) {
        continue;
      }

      attemptedProvider = true;
      const voice =
        options.voice?.trim() || provider.ttsVoice || DEFAULT_TTS_VOICE;
      const client = this.createProviderClientFromEndpoint({
        endpoint: provider.ttsEndpoint,
        apiKey: provider.ttsApiKey,
      });

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
        lastError = error;
        const hasMoreFallback = index < attempts.length - 1;
        if (!hasMoreFallback || !this.isFallbackEligibleProviderFailure(error)) {
          this.logger.error('speech synthesis failed', {
            conversationId: options.conversationId,
            characterId: options.characterId,
            voice,
            textLength: text.length,
            errorMessage: this.extractErrorMessage(error),
          });
          throw this.toSpeechSynthesisException(error);
        }

        this.logger.warn('speech synthesis fallback scheduled', {
          conversationId: options.conversationId,
          characterId: options.characterId,
          voice,
          fromModel: provider.ttsModel,
          toModel: attempts[index + 1]?.provider.ttsModel,
          reason: attempt.reason,
          errorMessage: this.extractErrorMessage(error),
        });
      }
    }

    if (!attemptedProvider) {
      throw new ServiceUnavailableException(
        '当前实例未配置可用的 AI Key，暂时无法生成语音。',
      );
    }

    throw this.toSpeechSynthesisException(lastError);
  }
}
