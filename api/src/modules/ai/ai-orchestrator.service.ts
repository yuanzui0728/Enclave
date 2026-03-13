import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  GenerateReplyOptions,
  GenerateReplyResult,
  GenerateMomentOptions,
  ChatMessage,
  PersonalityProfile,
} from './ai.types';
import { PromptBuilderService } from './prompt-builder.service';
import { SystemConfigService } from '../config/config.service';

@Injectable()
export class AiOrchestratorService {
  private readonly logger = new Logger(AiOrchestratorService.name);
  private readonly client: OpenAI;

  constructor(
    private readonly config: ConfigService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly configService: SystemConfigService,
  ) {
    this.client = new OpenAI({
      apiKey: this.config.get<string>('DEEPSEEK_API_KEY'),
      baseURL: this.config.get<string>('OPENAI_BASE_URL') ?? 'https://api.deepseek.com',
    });
  }

  async generateReply(options: GenerateReplyOptions): Promise<GenerateReplyResult> {
    const { profile, conversationHistory, userMessage, isGroupChat, otherParticipants } = options;

    const systemPrompt = profile.systemPrompt
      ?? this.promptBuilder.buildChatSystemPrompt(profile, isGroupChat);

    // Build messages array: system + history (last 20) + new user message
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-20).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.characterId
          ? `[${m.characterId}]: ${m.content}`
          : m.content,
      })),
      { role: 'user', content: userMessage },
    ];

    try {
      const model = await this.configService.getAiModel();
      const response = await this.client.chat.completions.create({
        model,
        messages,
        max_tokens: 500,
        temperature: 0.85,
      });

      const text = response.choices[0]?.message?.content ?? '（无回复）';
      const tokensUsed = response.usage?.total_tokens ?? 0;

      return { text, tokensUsed };
    } catch (err) {
      this.logger.error('DeepSeek API error', err);
      throw err;
    }
  }

  async generateMoment(options: GenerateMomentOptions): Promise<string> {
    const { profile, currentTime, recentTopics } = options;
    const prompt = this.promptBuilder.buildMomentPrompt(profile, currentTime, recentTopics);

    const model = await this.configService.getAiModel();
    const response = await this.client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 150,
      temperature: 0.95,
    });

    return response.choices[0]?.message?.content?.trim() ?? '';
  }

  async extractPersonality(chatSample: string, personName: string): Promise<Record<string, unknown>> {
    const prompt = this.promptBuilder.buildPersonalityExtractionPrompt(chatSample, personName);

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

  async compressMemory(history: ChatMessage[], profile: PersonalityProfile): Promise<string> {
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
      return response.choices[0]?.message?.content?.trim() ?? '';
    } catch (err) {
      this.logger.error('compressMemory error', err);
      return profile.memorySummary;
    }
  }

  async classifyIntent(
    userMessage: string,
    characterName: string,
    characterDomains: string[],
  ): Promise<{ needsGroupChat: boolean; reason: string; requiredDomains: string[] }> {
    const prompt = this.promptBuilder.buildIntentClassificationPrompt(
      userMessage,
      characterName,
      characterDomains,
    );

    const model = await this.configService.getAiModel();
    const response = await this.client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    try {
      return JSON.parse(raw) as { needsGroupChat: boolean; reason: string; requiredDomains: string[] };
    } catch {
      return { needsGroupChat: false, reason: '', requiredDomains: [] };
    }
  }
}
