// i18n-ignore-start: internal service — no user-facing strings.
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MomentPostEntity } from './moment-post.entity';
import { CharactersService } from '../characters/characters.service';
import { todayInShanghai } from '../minimax/minimax-quota.service';

// 单 world 的"角色朋友圈自动配图"日上限。cloud-api dispatcher 启动 child 时按
// 全 world 数均分 100 张/天注入 env；未注入时回落到 100（视作单 world 部署）。
// 2026-05-18: 50 → 100，对齐 dispatcher FEED_IMAGE_DAILY_GLOBAL_DEFAULT。
const MOMENT_IMAGE_WORLD_DAILY_SHARE_FALLBACK = 100;

// "今天"窗口的起点向前再退 30 分钟，覆盖 generateMomentForChar 那里把
// postedAt 抖动到过去 0-15 分钟带来的跨日漏算（凌晨 0:00-0:15 创建的帖子
// postedAt 会落到昨晚 23:45-24:00）。30min 缓冲足够+保险。
const POSTED_AT_JITTER_BUFFER_MS = 30 * 60 * 1000;

function readWorldDailyShare(): number {
  // dispatcher 注入的 env 名（local-process-compute-provider 那边写入）。
  const raw = process.env.FEED_IMAGE_WORLD_DAILY_SHARE;
  if (raw !== undefined && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return MOMENT_IMAGE_WORLD_DAILY_SHARE_FALLBACK;
}

@Injectable()
export class MomentImageBudgetService {
  private readonly logger = new Logger(MomentImageBudgetService.name);

  constructor(
    @InjectRepository(MomentPostEntity)
    private readonly postRepo: Repository<MomentPostEntity>,
    private readonly characters: CharactersService,
  ) {}

  // 动态优先级均分准入：仅当 `characterId` 今天配图数 == 候选 NPC 中的最小配图数
  // 时才放行。这样保证：配额够用时每个 active NPC 至少 1 张；配额不够时
  // "今天还没配过图的角色"优先；全员各拿 1 张后才开放第 2 轮。
  //
  // 返回 true 不预留计数——后续 image-01 reserve / API call / save 自己串行。
  // 高并发下"准入 + 实际生图"非事务，允许总数轻微超出 worldShare 1-2 张。
  async tryAllocate(characterId: string): Promise<boolean> {
    const worldShare = readWorldDailyShare();
    if (worldShare <= 0) return false;

    const dayStart = new Date(`${todayInShanghai()}T00:00:00+08:00`);
    const windowStart = new Date(
      dayStart.getTime() - POSTED_AT_JITTER_BUFFER_MS,
    );

    // 今日本 world 各 NPC 已生成的带图 moment_post（按 authorId 聚合）。
    // contentType='image_album' 表示这条 moment 挂了图（generateMomentForChar
    // 写入时严格设置）；这里不查 mediaPayload IS NOT NULL，因为视频/音频
    // moment 也会写 mediaPayload。
    const cntRows = await this.postRepo
      .createQueryBuilder('post')
      .select('post.authorId', 'authorId')
      .addSelect('COUNT(*)', 'cnt')
      .where('post.authorType = :ct', { ct: 'character' })
      .andWhere('post.contentType = :c', { c: 'image_album' })
      .andWhere('post.postedAt >= :start', { start: windowStart })
      .groupBy('post.authorId')
      .getRawMany<{ authorId: string; cnt: string | number }>();

    const cntByAuthor = new Map<string, number>();
    let totalUsed = 0;
    for (const row of cntRows) {
      const c = Number(row.cnt) || 0;
      cntByAuthor.set(row.authorId, c);
      totalUsed += c;
    }

    if (totalUsed >= worldShare) {
      this.logger.debug?.(
        `moment image budget exhausted: totalUsed=${totalUsed} >= worldShare=${worldShare}`,
      );
      return false;
    }

    const selfCount = cntByAuthor.get(characterId) ?? 0;

    // 候选集 = feedFrequency>0 的 NPC ∪ 今天发过任意 moment 的 NPC，
    // 再 ∪ 当前请求的 character 本身（确保被纳入比较）。
    // 用 feedFrequency 作为"会自动发朋友圈"的 proxy——和 scheduler.service
    // 用 momentsFrequency 门控发帖的语义略有差异，但 feedFrequency=0 的角色
    // 通常本来也不会被 cron 触发到这里。
    const visibleChars = await this.characters.findAllVisibleToOwner();
    const candidateIds = new Set<string>();
    for (const ch of visibleChars) {
      if (ch.feedFrequency > 0 || ch.momentsFrequency > 0) {
        candidateIds.add(ch.id);
      }
    }
    const todayAuthorRows = await this.postRepo
      .createQueryBuilder('post')
      .select('DISTINCT post.authorId', 'authorId')
      .where('post.authorType = :ct', { ct: 'character' })
      .andWhere('post.postedAt >= :start', { start: windowStart })
      .getRawMany<{ authorId: string }>();
    for (const row of todayAuthorRows) candidateIds.add(row.authorId);
    candidateIds.add(characterId);

    if (candidateIds.size === 0) return false;

    let minCount = Number.POSITIVE_INFINITY;
    for (const id of candidateIds) {
      const c = cntByAuthor.get(id) ?? 0;
      if (c < minCount) minCount = c;
    }

    return selfCount === minCount;
  }
}
// i18n-ignore-end
