import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { CharacterEntity } from '../../characters/character.entity';
import { CharactersService } from '../../characters/characters.service';
import { FeedService } from '../../feed/feed.service';
import { FarmEventLogEntity } from './entities/farm-event-log.entity';
import { getCropDefinition } from './crop-catalog';
import {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  FARM_INCIDENT_BROADCAST_CHANCE,
  FarmActorType,
  FarmCropId,
  FarmEventKind,
  FarmEventView,
} from './farm.types';

// i18n-content: zh-only — actorName 字段当前作为内容写入事件日志，前端按 actorType=='system' 在
// UI 层映射到本地化文案；这里保留中文作为 legacy 回退，后续如改成纯 actorType+code 形式可去掉。
export const SYSTEM_ACTOR_NAME = '系统';

export interface RecordEventInput {
  ownerId: string;
  kind: FarmEventKind;
  actorType: FarmActorType;
  actorId: string;
  actorName: string;
  targetType?: FarmActorType | null;
  targetId?: string | null;
  targetName?: string | null;
  cropId?: string | null;
  intimacyDelta?: number | null;
  payload?: Record<string, unknown> | null;
}

@Injectable()
export class FarmEventService {
  private readonly logger = new Logger(FarmEventService.name);

  constructor(
    @InjectRepository(FarmEventLogEntity)
    private readonly repo: Repository<FarmEventLogEntity>,
    private readonly charactersService: CharactersService,
    private readonly feedService: FeedService,
  ) {}

  async maybeBroadcastIncident(input: {
    ownerId: string;
    thief: CharacterEntity;
    target: { kind: FarmActorType; id: string; name: string };
    cropId: FarmCropId;
    amount: number;
  }): Promise<boolean> {
    if (Math.random() > FARM_INCIDENT_BROADCAST_CHANCE) return false;
    const def = getCropDefinition(input.cropId);
    const text = renderIncidentText(input.thief, input.target, def.nameZh, input.amount);
    try {
      const post = await this.feedService.createPost({
        authorId: input.thief.id,
        authorName: input.thief.name,
        authorAvatar: input.thief.avatar ?? '',
        authorType: 'character',
        text,
        sourceKind: 'character_generated',
        surface: 'feed',
        statsPayload: {
          kind: 'farm_incident',
          cropId: input.cropId,
          amount: input.amount,
          targetType: input.target.kind,
          targetId: input.target.id,
        },
      });
      await this.recordEvent({
        ownerId: input.ownerId,
        kind: 'incident_broadcast',
        actorType: 'character',
        actorId: input.thief.id,
        actorName: input.thief.name,
        targetType: input.target.kind,
        targetId: input.target.id,
        targetName: input.target.name,
        cropId: input.cropId,
        payload: { feedPostId: post.id, amount: input.amount },
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `feed broadcast failed for thief=${input.thief.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  async applyIntimacyChange(
    ownerId: string,
    sourceCharacterId: string | null,
    targetCharacterId: string,
    delta: number,
    actorType: FarmActorType = 'character',
    actorName?: string,
    options: { recordEvent?: boolean } = {},
  ): Promise<number | null> {
    if (!Number.isFinite(delta) || delta === 0) return null;
    const target = await this.charactersService.findById(targetCharacterId);
    if (!target) return null;
    const oldLevel = target.intimacyLevel ?? 0;
    const newLevel = Math.max(0, Math.min(100, oldLevel + delta));
    if (newLevel === oldLevel) return oldLevel;
    target.intimacyLevel = newLevel;
    await this.charactersService.upsert(target);
    // 偷菜场景调用方已经写了一条带 intimacyDelta 的 'steal' 事件，再写 intimacy_change
    // 在事件流里就是两条说同一件事的日志（"X 顺走了你家的菜" + "X 与对方好感度变化 -3"），
    // 给 recordEvent: false 让调用方按需关掉。
    if (options.recordEvent !== false) {
      await this.recordEvent({
        ownerId,
        kind: 'intimacy_change',
        actorType,
        actorId: sourceCharacterId ?? 'system',
        actorName: actorName ?? SYSTEM_ACTOR_NAME,
        targetType: 'character',
        targetId: targetCharacterId,
        targetName: target.name,
        intimacyDelta: newLevel - oldLevel,
        payload: { oldLevel, newLevel },
      });
    }
    return newLevel;
  }

  async recordEvent(input: RecordEventInput): Promise<FarmEventLogEntity> {
    const entity = this.repo.create({
      ownerId: input.ownerId,
      kind: input.kind,
      actorType: input.actorType,
      actorId: input.actorId,
      actorName: input.actorName,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      targetName: input.targetName ?? null,
      cropId: input.cropId ?? null,
      intimacyDelta: input.intimacyDelta ?? null,
      payloadJson: input.payload ?? null,
    });
    return this.repo.save(entity);
  }

  async listEvents(
    ownerId: string,
    opts?: { since?: Date; limit?: number },
  ): Promise<FarmEventLogEntity[]> {
    const qb = this.repo
      .createQueryBuilder('event')
      .where('event.ownerId = :ownerId', { ownerId })
      .orderBy('event.createdAt', 'DESC')
      .limit(opts?.limit ?? 50);

    if (opts?.since) {
      qb.andWhere('event.createdAt > :since', { since: opts.since });
    }

    return qb.getMany();
  }

  async listEventsForActor(
    ownerId: string,
    actorId: string,
    limit = 5,
  ): Promise<FarmEventLogEntity[]> {
    return this.repo.find({
      where: [
        { ownerId, actorId },
        { ownerId, targetId: actorId },
      ],
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async pruneOldEvents(ownerId: string, keepDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - keepDays * 24 * 3600 * 1000);
    const result = await this.repo.delete({
      ownerId,
      createdAt: LessThan(cutoff),
    });
    return result.affected ?? 0;
  }

  toEventView(entity: FarmEventLogEntity): FarmEventView {
    return {
      id: entity.id,
      kind: entity.kind,
      actorType: entity.actorType,
      actorId: entity.actorId,
      actorName: entity.actorName,
      targetType: entity.targetType ?? null,
      targetId: entity.targetId ?? null,
      cropId: (entity.cropId as FarmEventView['cropId']) ?? null,
      intimacyDelta: entity.intimacyDelta ?? null,
      payload: entity.payloadJson ?? null,
      createdAt:
        entity.createdAt instanceof Date
          ? entity.createdAt.toISOString()
          : new Date(entity.createdAt).toISOString(),
    };
  }
}

function renderIncidentText(
  thief: CharacterEntity,
  target: { kind: FarmActorType; id: string; name: string },
  cropName: string,
  amount: number,
): string {
  const hour = new Date().getHours();
  const periodLabel =
    hour < 5
      ? '半夜溜出来'
      : hour < 11
        ? '一大早跑去'
        : hour < 14
          ? '中午顺路过'
          : hour < 19
            ? '下午散步绕到'
            : '入夜跑去';
  const targetLabel = target.kind === 'owner' ? '世界主人' : target.name;
  const tags = (
    (thief.profile as { personalityTags?: string[] } | null)?.personalityTags ?? []
  ).map((t) => String(t).toLowerCase());
  const playful = tags.includes('playful') || tags.includes('mischievous');
  const honest = tags.includes('honest') || tags.includes('trustworthy');
  if (playful) {
    return `${periodLabel}${targetLabel}的菜地，顺走了 ${amount} 颗${cropName}。下次别这么早睡嘛 🌚`;
  }
  if (honest) {
    return `${periodLabel}${targetLabel}的菜地。${cropName}熟透了实在没忍住，回头还你 ${amount} 颗别的。`;
  }
  return `${periodLabel}${targetLabel}的菜地，${cropName} ×${amount} 入袋。世界这么大，菜怎么这么甜。`;
}
// i18n-ignore-end
