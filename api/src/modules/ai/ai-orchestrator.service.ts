import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { toFile } from 'openai';
import {
  AiMessagePart,
  GenerateReplyOptions,
  GenerateReplyResult,
  GenerateMomentOptions,
  ChatMessage,
  PersonalityProfile,
  AiKeyOverride,
} from './ai.types';
import { PromptBuilderService } from './prompt-builder.service';
import { sanitizeAiText } from './ai-text-sanitizer';
import { SystemConfigService } from '../config/config.service';
import { WorldService } from '../world/world.service';
import { calculateHistoryWindow } from './reply-logic.constants';

const DEFAULT_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe';
const ACCEPTED_AUDIO_MIME_TYPES = new Set([
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'video/mp4',
  'video/webm',
]);

type UploadedAudioFile = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size: number;
};

type ResolvedProviderConfig = {
  endpoint: string;
  model: string;
  apiKey: string;
  transcriptionModel: string;
  apiStyle: 'openai-chat-completions' | 'openai-responses';
  mode: 'cloud' | 'local-compatible';
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
    const apiStyle =
      (await this.configService.getConfig('provider_api_style')) ??
      'openai-chat-completions';
    const mode =
      (await this.configService.getConfig('provider_mode')) ?? 'cloud';

    return {
      endpoint: this.normalizeProviderEndpoint(endpoint),
      model,
      apiKey: apiKey.trim(),
      transcriptionModel,
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
      transcriptionModel: provider.transcriptionModel,
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

  private buildMessageText(
    message: Pick<ChatMessage, 'content' | 'characterId'>,
    isGroupChat?: boolean,
  ) {
    return isGroupChat && message.characterId
      ? `[${message.characterId}]: ${message.content}`
      : message.content;
  }

  private collectUsableImageParts(
    parts: AiMessagePart[] | undefined,
    provider: ResolvedProviderConfig,
  ) {
    if (!parts?.length || !this.modelSupportsImageInput(provider.model)) {
      return [];
    }

    return parts.filter(
      (part): part is Extract<AiMessagePart, { type: 'image' }> =>
        part.type === 'image' &&
        this.isReachableImageUrl(part.imageUrl, provider),
    );
  }

  private buildChatCompletionMessage(
    message: ChatMessage,
    provider: ResolvedProviderConfig,
    isGroupChat?: boolean,
  ): OpenAI.Chat.ChatCompletionMessageParam {
    const textContent = this.buildMessageText(message, isGroupChat);
    const imageParts = this.collectUsableImageParts(message.parts, provider);
    if (!imageParts.length || message.role !== 'user') {
      return {
        role: message.role as 'user' | 'assistant' | 'system',
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

  private buildResponsesMessage(
    message: ChatMessage,
    provider: ResolvedProviderConfig,
    isGroupChat?: boolean,
  ): OpenAI.Responses.EasyInputMessage {
    const textContent = this.buildMessageText(message, isGroupChat);
    const imageParts = this.collectUsableImageParts(message.parts, provider);
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
    );
    const historyWindow = calculateHistoryWindow(
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
    const worldContextText = this.worldService.buildContextString(worldCtx);

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

  private async buildSystemPrompt(
    profile: PersonalityProfile,
    isGroupChat?: boolean,
    chatContext?: GenerateReplyOptions['chatContext'],
  ) {
    let systemPrompt =
      profile.systemPrompt ??
      this.promptBuilder.buildChatSystemPrompt(
        profile,
        isGroupChat,
        chatContext,
      );

    try {
      const worldCtx = await this.worldService.getLatest();
      const ctxStr = this.worldService.buildContextString(worldCtx);
      if (ctxStr) {
        systemPrompt = systemPrompt.replace(/当前时间：[^\n]*/, ctxStr);
        if (!systemPrompt.includes(ctxStr)) {
          systemPrompt += `\n\n【当前世界状态】${ctxStr}`;
        }
      }
    } catch {
      // ignore world context errors
    }

    return systemPrompt;
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
      otherParticipants,
      chatContext,
      aiKeyOverride,
    } = options;
    const provider = await this.resolveRuntimeProvider(aiKeyOverride);
    if (!provider.apiKey) {
      return this.buildUnavailableReply(profile);
    }

    const client = this.createProviderClient(provider);

    const systemPrompt = await this.buildSystemPrompt(
      profile,
      isGroupChat,
      chatContext,
    );
    const historyWindow = calculateHistoryWindow(
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

    try {
      if (provider.apiStyle === 'openai-responses') {
        const response = await client.responses.create({
          model: provider.model,
          instructions: systemPrompt,
          input: [
            ...sanitizedHistory.map((message) =>
              this.buildResponsesMessage(message, provider, isGroupChat),
            ),
            this.buildResponsesMessage(
              currentUserMessage,
              provider,
              isGroupChat,
            ),
          ],
          max_output_tokens: 500,
          temperature: 0.85,
        });

        const rawText = response.output_text ?? '（无回复）';
        const text = sanitizeAiText(rawText) || '（无回复）';
        const tokensUsed = response.usage?.total_tokens ?? 0;
        return { text, tokensUsed };
      }

      const response = await client.chat.completions.create({
        model: provider.model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...sanitizedHistory.map((message) =>
            this.buildChatCompletionMessage(message, provider, isGroupChat),
          ),
          this.buildChatCompletionMessage(
            currentUserMessage,
            provider,
            isGroupChat,
          ),
        ],
        max_tokens: 500,
        temperature: 0.85,
      });

      const rawText = response.choices[0]?.message?.content ?? '（无回复）';
      const text = sanitizeAiText(rawText) || '（无回复）';
      const tokensUsed = response.usage?.total_tokens ?? 0;

      return { text, tokensUsed };
    } catch (err) {
      this.logger.error('AI provider error', err);
      throw err;
    }
  }

  async generateMoment(options: GenerateMomentOptions): Promise<string> {
    const { profile, currentTime, recentTopics } = options;
    const prompt = this.promptBuilder.buildMomentPrompt(
      profile,
      currentTime,
      recentTopics,
    );

    const model = await this.configService.getAiModel();
    const response = await this.client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 150,
      temperature: 0.95,
    });

    return sanitizeAiText(response.choices[0]?.message?.content ?? '');
  }

  async extractPersonality(
    chatSample: string,
    personName: string,
  ): Promise<Record<string, unknown>> {
    const prompt = this.promptBuilder.buildPersonalityExtractionPrompt(
      chatSample,
      personName,
    );

    const model = await this.configService.getAiModel();
    const response = await this.client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      this.logger.error('Failed to parse personality JSON', raw);
      return {};
    }
  }

  async compressMemory(
    history: ChatMessage[],
    profile: PersonalityProfile,
  ): Promise<string> {
    const chatHistory = history
      .filter((m) => m.role !== 'system')
      .map((m) => `${m.role === 'user' ? '用户' : profile.name}：${m.content}`)
      .join('\n');

    const prompt = `以下是${profile.name}和用户的对话片段：
${chatHistory}

请从${profile.name}的视角，用100字以内总结：
1. 用户是什么样的人（性格、喜好、习惯）
2. 两人聊过什么重要的事
3. ${profile.name}对用户的印象

只输出总结文字，不要加标题或格式。`;

    try {
      const model = await this.configService.getAiModel();
      const response = await this.client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.3,
      });
      return sanitizeAiText(response.choices[0]?.message?.content ?? '');
    } catch (err) {
      this.logger.error('compressMemory error', err);
      return profile.memory?.recentSummary ?? profile.memorySummary;
    }
  }

  async classifyIntent(
    userMessage: string,
    characterName: string,
    characterDomains: string[],
  ): Promise<{
    needsGroupChat: boolean;
    reason: string;
    requiredDomains: string[];
  }> {
    const provider = await this.resolveRuntimeProvider();
    if (!provider.apiKey) {
      return { needsGroupChat: false, reason: '', requiredDomains: [] };
    }

    const prompt = this.promptBuilder.buildIntentClassificationPrompt(
      userMessage,
      characterName,
      characterDomains,
    );

    try {
      const client = this.createProviderClient(provider);
      const response = await client.chat.completions.create({
        model: provider.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      const raw = response.choices[0]?.message?.content ?? '{}';
      return JSON.parse(raw) as {
        needsGroupChat: boolean;
        reason: string;
        requiredDomains: string[];
      };
    } catch {
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
    if (!provider.apiKey.trim()) {
      throw new ServiceUnavailableException(
        '当前实例未配置可用的 AI Key，暂时无法转写语音。',
      );
    }

    const client = new OpenAI({
      apiKey: provider.apiKey,
      baseURL: provider.endpoint,
    });
    const startedAt = Date.now();

    try {
      const response = await client.audio.transcriptions.create({
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
      });
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
        error,
      });
      throw new BadGatewayException(
        '当前 Provider 不支持语音转写，或本次转写请求失败。',
      );
    }
  }
}
