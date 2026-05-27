import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { ConversationEntity } from '../chat/conversation.entity';
import { MessageEntity } from '../chat/message.entity';
import { TenantRepository } from '../tenancy/tenant-scoped.repository';
import { WorldService } from '../world/world.service';
import type {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  GenerateMomentOptions,
  MomentGenerationContext,
} from './ai.types';
import { sanitizeAiText } from './ai-text-sanitizer';
import { stripChatReplyPrefix } from '../chat/chat-text.utils';

const DIRECT_MESSAGE_LIMIT = 18;
const MAX_TOPIC_COUNT = 4;
const MAX_TOPIC_LENGTH = 20;
const GENERIC_TOPIC_PATTERNS = [
  /^(你好|在吗|哈哈+|嘿+|嗯+|哦+|好的|收到|晚安|早安)$/u,
  /^(是吗|可以|行吧|知道了|明白了)$/u,
];

function normalizeConversationText(text: string, senderType: string) {
  const stripped = stripChatReplyPrefix(text || '').trim();
  if (!stripped) {
    return '';
  }

  return senderType === 'character' ? sanitizeAiText(stripped) : stripped;
}

function trimTopicSnippet(text: string) {
  const normalized = text
    .replace(/\s+/g, ' ')
    .replace(/[“”"'`]/g, '')
    .trim();
  if (!normalized) {
    return '';
  }

  const firstSentence = normalized.split(/[。！？!?；;\n]/u)[0]?.trim() ?? '';
  const candidate = firstSentence || normalized;
  if (!candidate) {
    return '';
  }

  const concise = candidate
    .replace(/^(我想问一下|我想问|想问一下|想问|我在想|我感觉|我觉得)/u, '')
    .replace(/^(就是|那个|然后|所以|其实)/u, '')
    .trim();

  if (!concise) {
    return '';
  }

  if (GENERIC_TOPIC_PATTERNS.some((pattern) => pattern.test(concise))) {
    return '';
  }

  return concise.length > MAX_TOPIC_LENGTH
    ? `${concise.slice(0, MAX_TOPIC_LENGTH).trim()}...`
    : concise;
}

function dedupeTopics(topics: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const topic of topics) {
    const normalized = topic.trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
    if (result.length >= MAX_TOPIC_COUNT) {
      break;
    }
  }

  return result;
}

@Injectable()
export class MomentGenerationContextService {
  constructor(
    private readonly worldService: WorldService,
    @InjectRepository(ConversationEntity)
    private readonly conversationRepo: Repository<ConversationEntity>,
    @InjectRepository(MessageEntity)
    private readonly messageRepo: Repository<MessageEntity>,
  ) {}

  async buildContext(
    input: Pick<
      GenerateMomentOptions,
      'currentTime' | 'recentTopics' | 'usageContext'
    >,
  ): Promise<MomentGenerationContext> {
    const characterId =
      input.usageContext?.characterId ?? input.usageContext?.scopeId;
    const [worldContext, relationshipContext] = await Promise.all([
      this.buildWorldContext(input.currentTime),
      characterId
        ? this.buildRelationshipContext(characterId, input.recentTopics)
        : Promise.resolve(undefined),
    ]);

    return {
      worldContext,
      relationshipContext,
      generationHints: {
        anchorPriority: [
          'real_world',
          'weather',
          'location',
          'recent_chat',
          'holiday',
          'life',
        ],
        mustAvoidGeneric: true,
        preferObservationOverAnnouncement: true,
      },
    };
  }

  private async buildWorldContext(currentTime: Date) {
    const [calendar, latest] = await Promise.all([
      this.worldService.getWorldCalendar(currentTime),
      this.worldService.getLatest(),
    ]);

    return {
      dateTimeText: calendar.dateTimeText,
      timeText: calendar.timeText,
      weather: latest?.weather?.trim() || undefined,
      location: latest?.location?.trim() || calendar.displayLocation,
      holiday: latest?.holiday?.trim() || undefined,
      localTime: latest?.localTime?.trim() || undefined,
    };
  }

  private async buildRelationshipContext(
    characterId: string,
    seededTopics?: string[],
  ) {
    // 共享 world：direct_<charId> 会话 id 跨 owner 共用，裸 findOneBy({id}) 会命中
    // 最早 owner 的会话行 → afterLoad 抛 TENANT_READ_LEAK（实测让 moment-video 文案
    // 生成对 world-news-desk/预设角色全失败）。经 TenantRepository 注入当前帧 ownerId。
    const conversation = await new TenantRepository(this.conversationRepo).findOneBy({
      id: `direct_${characterId}`,
    });
    const seeded = dedupeTopics(
      (seededTopics ?? [])
        .map((topic) => trimTopicSnippet(topic))
        .filter(Boolean),
    );

    if (!conversation) {
      return {
        hasRecentConversation: seeded.length > 0,
        recentTopics: seeded,
        recentUserIntentSummary: seeded.length
          ? `最近和用户聊过：${seeded.join('；')}`
          : undefined,
        avoidDirectQuote: true,
      };
    }

    // conversationId 同样跨 owner 共用，messageRepo 也要按当前 owner 过滤。
    const messages = await new TenantRepository(this.messageRepo).find({
      where: conversation.lastClearedAt
        ? {
            conversationId: conversation.id,
            createdAt: MoreThan(conversation.lastClearedAt),
          }
        : {
            conversationId: conversation.id,
          },
      order: { createdAt: 'DESC' },
      take: DIRECT_MESSAGE_LIMIT,
    });
    const orderedMessages = [...messages].reverse();
    const normalizedMessages = orderedMessages
      .map((message) => ({
        senderType: message.senderType,
        createdAt: message.createdAt,
        text: normalizeConversationText(message.text, message.senderType),
      }))
      .filter((message) => message.text);

    const recentTopics = dedupeTopics([
      ...seeded,
      ...normalizedMessages
        .filter((message) => message.senderType === 'user')
        .slice(-4)
        .reverse()
        .map((message) => trimTopicSnippet(message.text))
        .filter(Boolean),
    ]);
    const lastConversationAt =
      normalizedMessages[normalizedMessages.length - 1]?.createdAt;

    return {
      hasRecentConversation: normalizedMessages.length > 0,
      lastConversationAt,
      recentTopics,
      recentUserIntentSummary: recentTopics.length
        ? `最近和用户聊过：${recentTopics.join('；')}`
        : undefined,
      avoidDirectQuote: true,
    };
  }
}
// i18n-ignore-end
