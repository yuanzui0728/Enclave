import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import { WorldOwnerService } from '../auth/world-owner.service';
import { SELF_CHARACTER_ID } from '../characters/default-characters';
import { REMINDER_CHARACTER_ID } from '../characters/reminder-character';
import { FriendshipEntity } from '../social/friendship.entity';
import { TenantRepository } from '../tenancy/tenant-scoped.repository';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { HongbaoCloudClient } from './hongbao-cloud.client';
import { MessageEntity } from './message.entity';

// i18n-ignore-start: 角色发出的祝福语属世界内生成内容，非 UI 文案。
const GREETINGS = [
  '恭喜发财，大吉大利',
  '愿你今天好运连连',
  '一点小心意，请收下',
  '谢谢你一直都在，红包拿去花',
  '今天也要开开心心的呀',
];
// i18n-ignore-end

type AutoSendOptions = {
  minIntimacy: number;
  cooldownMs: number;
  probability: number;
  minCents: number;
  maxCents: number;
};

// AI 好友按亲密度 + 冷却 + 概率「主动」给用户发系统红包。默认关闭（真金发放，
// 由运营经 HONGBAO_AUTO_SEND_ENABLED 开启）。同时承载过期红包清扫 cron。
@Injectable()
export class RedPacketAutoSendService {
  private readonly logger = new Logger(RedPacketAutoSendService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
    private readonly hongbaoCloud: HongbaoCloudClient,
    @InjectRepository(FriendshipEntity)
    private readonly friendshipRepo: Repository<FriendshipEntity>,
    @InjectRepository(MessageEntity)
    private readonly msgRepo: Repository<MessageEntity>,
  ) {}

  private num(key: string, fallback: number): number {
    const raw = this.config.get<string>(key);
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private isEnabled(): boolean {
    return (
      (this.config.get<string>('HONGBAO_AUTO_SEND_ENABLED') ?? '')
        .trim()
        .toLowerCase() === 'true'
    );
  }

  @Cron('0 17 * * * *')
  async runAutoSendCron(): Promise<void> {
    if (!this.isEnabled()) return;
    const opts: AutoSendOptions = {
      minIntimacy: this.num('HONGBAO_AUTO_SEND_MIN_INTIMACY', 60),
      cooldownMs: this.num('HONGBAO_AUTO_SEND_COOLDOWN_DAYS', 7) * 86_400_000,
      probability: Math.min(1, this.num('HONGBAO_AUTO_SEND_PROBABILITY', 0.15)),
      minCents: Math.round(this.num('HONGBAO_AUTO_SEND_MIN_CENTS', 66)),
      maxCents: Math.round(this.num('HONGBAO_AUTO_SEND_MAX_CENTS', 666)),
    };
    await this.worldOwnerService.forEachOwner(async () => {
      try {
        await this.runForCurrentOwner(opts);
      } catch (err) {
        this.logger.warn(`auto-send failed: ${(err as Error).message}`);
      }
    }, 'hongbao auto-send');
  }

  private async runForCurrentOwner(opts: AutoSendOptions): Promise<void> {
    // 每 owner 每轮先按概率决定是否发，命中后最多发 1 个（控真金给付节奏）。
    if (Math.random() > opts.probability) return;
    const friendships = await new TenantRepository(this.friendshipRepo).find({
      where: { status: In(['friend', 'close', 'best']) },
    });
    const eligible = friendships
      .filter(
        (f) =>
          (f.intimacyLevel ?? 0) >= opts.minIntimacy &&
          // 排除「我自己」/提醒等功能角色——它们发系统红包毫无语义。
          f.characterId !== SELF_CHARACTER_ID &&
          f.characterId !== REMINDER_CHARACTER_ID,
      )
      .sort(() => Math.random() - 0.5);

    for (const friendship of eligible) {
      const convId = `direct_${friendship.characterId}`;
      const since = new Date(Date.now() - opts.cooldownMs);
      const recent = await new TenantRepository(this.msgRepo).findOne({
        where: {
          conversationId: convId,
          senderType: 'character',
          type: 'red_packet',
          createdAt: MoreThan(since),
        },
      });
      if (recent) continue; // 冷却中，换下一位

      const span = Math.max(1, opts.maxCents - opts.minCents + 1);
      const amountCents = opts.minCents + Math.floor(Math.random() * span);
      const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
      try {
        const conv = await this.chatService.getOrCreateConversation(
          friendship.characterId,
          convId,
        );
        const message = await this.chatService.issueIncomingRedPacket({
          conversationId: conv.id,
          characterId: friendship.characterId,
          characterName: conv.title,
          amountCents,
          message: greeting,
        });
        this.chatGateway.emitThreadMessage(conv.id, message);
        this.logger.log(
          `auto-sent red packet → ${friendship.characterId} (¥${(amountCents / 100).toFixed(2)})`,
        );
      } catch (err) {
        // 预算超限 / 服务不可用 → 跳过本 owner（不再换人，避免连发）。
        this.logger.warn(
          `issue red packet skipped (${friendship.characterId}): ${(err as Error).message}`,
        );
      }
      return; // 每 owner 每轮只发一个
    }
  }

  @Cron('0 */30 * * * *')
  async runSweepCron(): Promise<void> {
    try {
      const res = await this.hongbaoCloud.sweepExpired();
      if (res.refundedOutgoing || res.expiredIncoming) {
        this.logger.log(
          `hongbao sweep: refunded=${res.refundedOutgoing} expired=${res.expiredIncoming}`,
        );
      }
    } catch (err) {
      this.logger.warn(`hongbao sweep failed: ${(err as Error).message}`);
    }
  }
}
