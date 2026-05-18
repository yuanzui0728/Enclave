// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { CharacterEntity } from '../../characters/character.entity';
import { FeedService } from '../../feed/feed.service';
import { ParkingWarEventLogEntity } from './entities/parking-war-event-log.entity';
import {
  PARKING_WAR_INCIDENT_BROADCAST_CHANCE,
} from './parking-war.constants';
import type {
  ParkingWarActorKind,
  ParkingWarCarTier,
  ParkingWarEventKind,
  ParkingWarEventView,
  ParkingWarRarity,
} from './parking-war.types';

export interface RecordParkingWarEventInput {
  ownerId: string;
  kind: ParkingWarEventKind;
  actorKind: ParkingWarActorKind;
  actorId: string;
  actorName: string;
  targetKind?: ParkingWarActorKind | null;
  targetId?: string | null;
  targetName?: string | null;
  amountCents?: number | null;
  payload?: Record<string, unknown> | null;
}

@Injectable()
export class ParkingWarEventService {
  private readonly logger = new Logger(ParkingWarEventService.name);

  constructor(
    @InjectRepository(ParkingWarEventLogEntity)
    private readonly repo: Repository<ParkingWarEventLogEntity>,
    private readonly feedService: FeedService,
  ) {}

  /**
   * 8% 概率把高戏剧性事件（拖车 / 罚单 / legend+ 车进出场）发到 Feed。
   * actor 是 NPC 角色时取 CharacterEntity 当 author；玩家相关事件不广播
   * （玩家自己的动作不广播给自己，避免刷屏）。
   */
  async maybeBroadcastIncident(input: {
    ownerId: string;
    character: CharacterEntity;
    kind: ParkingWarEventKind;
    targetName: string;
    carTier: ParkingWarCarTier;
    carRarity: ParkingWarRarity;
    amountCents?: number;
  }): Promise<boolean> {
    if (Math.random() > PARKING_WAR_INCIDENT_BROADCAST_CHANCE) return false;
    const text = renderIncidentText(input);
    try {
      const post = await this.feedService.createPost({
        authorId: input.character.id,
        authorName: input.character.name,
        authorAvatar: input.character.avatar ?? '',
        authorType: 'character',
        text,
        sourceKind: 'character_generated',
        surface: 'feed',
        statsPayload: {
          kind: 'parking_war_incident',
          eventKind: input.kind,
          carTier: input.carTier,
          carRarity: input.carRarity,
          amountCents: input.amountCents ?? null,
        },
      });
      await this.recordEvent({
        ownerId: input.ownerId,
        kind: 'incident_broadcast',
        actorKind: 'npc',
        actorId: input.character.id,
        actorName: input.character.name,
        targetKind: 'player',
        targetName: input.targetName,
        payload: { feedPostId: post.id, originalKind: input.kind },
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `parking-war feed broadcast failed for character=${input.character.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  async recordEvent(
    input: RecordParkingWarEventInput,
  ): Promise<ParkingWarEventLogEntity> {
    const entity = this.repo.create({
      ownerId: input.ownerId,
      kind: input.kind,
      actorKind: input.actorKind,
      actorId: input.actorId,
      actorName: input.actorName,
      targetKind: input.targetKind ?? null,
      targetId: input.targetId ?? null,
      targetName: input.targetName ?? null,
      amountCents: input.amountCents ?? null,
      payloadJson: input.payload ?? null,
    });
    return this.repo.save(entity);
  }

  async listEvents(
    ownerId: string,
    opts?: { since?: Date; limit?: number },
  ): Promise<ParkingWarEventLogEntity[]> {
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
  ): Promise<ParkingWarEventLogEntity[]> {
    return this.repo.find({
      where: [
        { ownerId, actorId },
        { ownerId, targetId: actorId },
      ],
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * 精确统计今日某类事件数量（不受 listEvents 200 条窗口限制）。
   * NPC tick 一天能产 2000+ 事件，旧实现的 listEvents+filter 会漏算清晨用户操作。
   */
  async countTodayEventsOfKind(
    ownerId: string,
    kind: ParkingWarEventKind,
    since: Date,
    extra?: {
      targetKind?: 'player' | 'npc';
      actorKind?: 'player' | 'npc';
    },
  ): Promise<number> {
    const qb = this.repo
      .createQueryBuilder('event')
      .where('event.ownerId = :ownerId', { ownerId })
      .andWhere('event.kind = :kind', { kind })
      .andWhere('event.createdAt > :since', { since });
    if (extra?.targetKind) {
      qb.andWhere('event.targetKind = :targetKind', {
        targetKind: extra.targetKind,
      });
    }
    if (extra?.actorKind) {
      qb.andWhere('event.actorKind = :actorKind', {
        actorKind: extra.actorKind,
      });
    }
    return qb.getCount();
  }

  /**
   * 精确求今日某类事件的 amountCents 总和（用于「今日累计收益」类任务进度）。
   */
  async sumTodayAmountOfKind(
    ownerId: string,
    kind: ParkingWarEventKind,
    since: Date,
    extra?: { actorKind?: 'player' | 'npc' },
  ): Promise<number> {
    const qb = this.repo
      .createQueryBuilder('event')
      .select('COALESCE(SUM(event.amountCents), 0)', 'total')
      .where('event.ownerId = :ownerId', { ownerId })
      .andWhere('event.kind = :kind', { kind })
      .andWhere('event.createdAt > :since', { since });
    if (extra?.actorKind) {
      qb.andWhere('event.actorKind = :actorKind', {
        actorKind: extra.actorKind,
      });
    }
    const row = await qb.getRawOne<{ total: string | number | null }>();
    return Number(row?.total ?? 0);
  }

  async pruneOldEvents(ownerId: string, keepDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - keepDays * 24 * 3600 * 1000);
    const result = await this.repo.delete({
      ownerId,
      createdAt: LessThan(cutoff),
    });
    return result.affected ?? 0;
  }

  toEventView(entity: ParkingWarEventLogEntity): ParkingWarEventView {
    return {
      id: entity.id,
      kind: entity.kind,
      actorKind: entity.actorKind,
      actorId: entity.actorId,
      actorName: entity.actorName,
      targetKind: entity.targetKind ?? null,
      targetId: entity.targetId ?? null,
      targetName: entity.targetName ?? null,
      amountCents: entity.amountCents ?? null,
      payload: entity.payloadJson ?? null,
      createdAt:
        entity.createdAt instanceof Date
          ? entity.createdAt.toISOString()
          : new Date(entity.createdAt).toISOString(),
    };
  }
}

function renderIncidentText(input: {
  character: CharacterEntity;
  kind: ParkingWarEventKind;
  targetName: string;
  carTier: ParkingWarCarTier;
  carRarity: ParkingWarRarity;
  amountCents?: number;
}): string {
  const carLabel = `${rarityLabel(input.carRarity)}${tierLabel(input.carTier)}`;
  const targetLabel = input.targetName || '世界主人';
  const moneyLabel = input.amountCents
    ? ` 罚了 ¥${(input.amountCents / 100).toFixed(2)}。`
    : '。';
  if (input.kind === 'tow') {
    return `今天巡到${targetLabel}家门口，${carLabel}超时占位，直接拖走了${moneyLabel}下次别想着白嫖我车位😈`;
  }
  if (input.kind === 'ticket') {
    return `给${targetLabel}停在我家的${carLabel}贴了张罚单${moneyLabel}还不挪车？再来一张。`;
  }
  if (input.kind === 'npc_visit') {
    return `溜达到${targetLabel}的车场，看到有空位顺手把${carLabel}停一会儿，挂机赚点小钱。`;
  }
  return `${input.character.name} 在抢车位有点动静（${input.kind}）。`;
}

function tierLabel(t: ParkingWarCarTier): string {
  return (
    {
      starter: '代步车',
      family: '家用车',
      business: '商务车',
      performance: '性能车',
      luxury: '豪华车',
      super: '超跑',
    } as Record<ParkingWarCarTier, string>
  )[t];
}

function rarityLabel(r: ParkingWarRarity): string {
  return (
    {
      common: '普通',
      rare: '稀有',
      epic: '史诗',
      legend: '传说',
    } as Record<ParkingWarRarity, string>
  )[r];
}
// i18n-ignore-end
