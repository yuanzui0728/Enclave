// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOptionsWhere,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { WorldOwnerService } from '../auth/world-owner.service';
import { CharacterEntity } from '../characters/character.entity';
import { MomentPostEntity } from '../moments/moment-post.entity';
import { MomentCommentEntity } from '../moments/moment-comment.entity';
import { MomentLikeEntity } from '../moments/moment-like.entity';
import { FeedPostEntity } from '../feed/feed-post.entity';
import { FeedCommentEntity } from '../feed/feed-comment.entity';
import { VideoChannelFollowEntity } from '../feed/video-channel-follow.entity';
import { UserFeedInteractionEntity } from '../analytics/user-feed-interaction.entity';

type BehaviorSurface = 'moments' | 'feed' | 'channels';

type BehaviorType =
  | 'comment'
  | 'like'
  | 'share'
  | 'forward_to_chat'
  | 'favorite'
  | 'view'
  | 'follow'
  | 'not_interested'
  | 'comment_like';

type BehaviorSourceTable =
  | 'moment_comments'
  | 'moment_likes'
  | 'feed_comments'
  | 'user_feed_interactions'
  | 'video_channel_follows';

type BehaviorRecordExportFormat = 'markdown' | 'json';

type BehaviorRecord = {
  id: string;
  surface: BehaviorSurface;
  behaviorType: BehaviorType;
  sourceTable: BehaviorSourceTable;
  sourceId: string;
  targetPostId: string | null;
  targetPostExcerpt: string | null;
  targetPostMediaType: string | null;
  targetAuthorId: string | null;
  targetAuthorName: string | null;
  targetAuthorType: 'user' | 'character' | null;
  text: string | null;
  payload: Record<string, unknown> | null;
  postMissing: boolean;
  createdAt: string;
};

type BehaviorRecordListQuery = {
  surface?: string;
  behaviorType?: string;
  dateFrom?: string;
  dateTo?: string;
  includeHiddenComments?: boolean | string;
  page?: number | string;
  pageSize?: number | string;
};

type BehaviorRecordListResponse = {
  items: BehaviorRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type BehaviorCountBucket = { key: string; count: number };

type BehaviorTrendPoint = {
  date: string;
  total: number;
  comment: number;
  like: number;
  share: number;
  forwardToChat: number;
  favorite: number;
  view: number;
  follow: number;
  notInterested: number;
  commentLike: number;
};

type BehaviorTargetRank = {
  authorId: string | null;
  authorName: string;
  authorType: 'user' | 'character' | null;
  count: number;
};

type BehaviorPostRank = {
  postId: string;
  surface: BehaviorSurface;
  excerpt: string | null;
  authorName: string | null;
  count: number;
};

type BehaviorOwnerSummary = {
  id: string;
  username: string;
  avatar: string | null;
};

type BehaviorOverview = {
  owner: BehaviorOwnerSummary;
  totalBehaviorCount: number;
  behaviorCount7d: number;
  behaviorCount30d: number;
  countsByType: BehaviorCountBucket[];
  countsBySurface: BehaviorCountBucket[];
  trend7d: BehaviorTrendPoint[];
  trend30d: BehaviorTrendPoint[];
  activeDays7d: number;
  activeDays30d: number;
  mostActiveDay: string | null;
  mostActiveWeekday: string | null;
  topAuthors: BehaviorTargetRank[];
  topPosts: BehaviorPostRank[];
};

type BehaviorRecordExportQuery = {
  format?: string;
  surface?: string;
  behaviorType?: string;
  dateFrom?: string;
  dateTo?: string;
  includeHiddenComments?: boolean | string;
};

type BehaviorRecordExportPayload = {
  exportedAt: string;
  owner: BehaviorOwnerSummary;
  filters: {
    surface: BehaviorSurface | null;
    behaviorType: BehaviorType | null;
    dateFrom: string | null;
    dateTo: string | null;
    includeHiddenComments: boolean;
  };
  total: number;
  records: BehaviorRecord[];
};

type BehaviorRecordExportResponse = {
  format: BehaviorRecordExportFormat;
  fileName: string;
  contentType: string;
  content: string;
  payload: BehaviorRecordExportPayload;
};

const DEFAULT_LIST_PAGE_SIZE = 24;
const MAX_LIST_PAGE_SIZE = 100;
const EXCERPT_MAX_LENGTH = 120;
const TOP_RANK_LIMIT = 8;

const BEHAVIOR_TYPES: BehaviorType[] = [
  'comment',
  'like',
  'share',
  'forward_to_chat',
  'favorite',
  'view',
  'follow',
  'not_interested',
  'comment_like',
];

const BEHAVIOR_SURFACES: BehaviorSurface[] = ['moments', 'feed', 'channels'];

// user_feed_interactions.type 中属于"互动"的取值（feed 点赞也走这里，不再读
// legacy feed_post_likes，避免重复计数）。
const INTERACTION_TYPES = new Set<BehaviorType>([
  'like',
  'favorite',
  'share',
  'forward_to_chat',
  'view',
  'not_interested',
  'comment_like',
]);

@Injectable()
export class BehaviorRecordsAdminService {
  constructor(
    private readonly worldOwnerService: WorldOwnerService,
    @InjectRepository(MomentPostEntity)
    private readonly momentPostRepo: Repository<MomentPostEntity>,
    @InjectRepository(MomentCommentEntity)
    private readonly momentCommentRepo: Repository<MomentCommentEntity>,
    @InjectRepository(MomentLikeEntity)
    private readonly momentLikeRepo: Repository<MomentLikeEntity>,
    @InjectRepository(FeedPostEntity)
    private readonly feedPostRepo: Repository<FeedPostEntity>,
    @InjectRepository(FeedCommentEntity)
    private readonly feedCommentRepo: Repository<FeedCommentEntity>,
    @InjectRepository(VideoChannelFollowEntity)
    private readonly followRepo: Repository<VideoChannelFollowEntity>,
    @InjectRepository(UserFeedInteractionEntity)
    private readonly interactionRepo: Repository<UserFeedInteractionEntity>,
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
  ) {}

  async getOverview(): Promise<BehaviorOverview> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const records = await this.collectOwnerRecords(owner.id);

    const countsByType = BEHAVIOR_TYPES.map((type) => ({
      key: type,
      count: records.filter((record) => record.behaviorType === type).length,
    }));
    const countsBySurface = BEHAVIOR_SURFACES.map((surface) => ({
      key: surface,
      count: records.filter((record) => record.surface === surface).length,
    }));

    const trend7d = this.buildTrendPoints(records, 7);
    const trend30d = this.buildTrendPoints(records, 30);
    // 用趋势桶（本地日）求和得到 7d/30d，保证与 activeDays / 趋势图严格自洽，
    // 不用 rolling 7*24h 时间戳口径（会与按本地日分桶的趋势在边界处对不上）。
    const sumTrend = (points: BehaviorTrendPoint[]) =>
      points.reduce((total, point) => total + point.total, 0);

    return {
      owner: this.serializeOwner(owner),
      totalBehaviorCount: records.length,
      behaviorCount7d: sumTrend(trend7d),
      behaviorCount30d: sumTrend(trend30d),
      countsByType,
      countsBySurface,
      trend7d,
      trend30d,
      activeDays7d: trend7d.filter((point) => point.total > 0).length,
      activeDays30d: trend30d.filter((point) => point.total > 0).length,
      mostActiveDay: this.resolveMostActiveDay(trend30d),
      mostActiveWeekday: this.resolveMostActiveWeekday(records),
      topAuthors: this.resolveTopAuthors(records),
      topPosts: this.resolveTopPosts(records),
    };
  }

  async listRecords(
    query: BehaviorRecordListQuery,
  ): Promise<BehaviorRecordListResponse> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const surface = this.normalizeSurface(query.surface);
    const behaviorType = this.normalizeBehaviorType(query.behaviorType);
    const dateFrom = this.parseRangeBound(query.dateFrom, 'start');
    const dateTo = this.parseRangeBound(query.dateTo, 'end');
    const includeHiddenComments = this.normalizeBoolean(
      query.includeHiddenComments,
    );

    const all = await this.collectOwnerRecords(owner.id, {
      dateFrom,
      dateTo,
      includeHiddenComments,
    });

    const filtered = all.filter((record) => {
      if (surface && record.surface !== surface) {
        return false;
      }
      if (behaviorType && record.behaviorType !== behaviorType) {
        return false;
      }
      return true;
    });

    const page = this.normalizePositiveInteger(query.page, 1);
    const pageSize = Math.min(
      this.normalizePositiveInteger(query.pageSize, DEFAULT_LIST_PAGE_SIZE),
      MAX_LIST_PAGE_SIZE,
    );
    const total = filtered.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    const safePage = totalPages === 0 ? 1 : Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);

    return { items, total, page: safePage, pageSize, totalPages };
  }

  async exportRecords(
    query: BehaviorRecordExportQuery,
  ): Promise<BehaviorRecordExportResponse> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const format = this.normalizeExportFormat(query.format);
    const surface = this.normalizeSurface(query.surface);
    const behaviorType = this.normalizeBehaviorType(query.behaviorType);
    const dateFrom = this.parseRangeBound(query.dateFrom, 'start');
    const dateTo = this.parseRangeBound(query.dateTo, 'end');
    const includeHiddenComments = this.normalizeBoolean(
      query.includeHiddenComments,
    );

    const all = await this.collectOwnerRecords(owner.id, {
      dateFrom,
      dateTo,
      includeHiddenComments,
    });
    const records = all.filter((record) => {
      if (surface && record.surface !== surface) {
        return false;
      }
      if (behaviorType && record.behaviorType !== behaviorType) {
        return false;
      }
      return true;
    });

    const payload: BehaviorRecordExportPayload = {
      exportedAt: new Date().toISOString(),
      owner: this.serializeOwner(owner),
      filters: {
        surface: surface ?? null,
        behaviorType: behaviorType ?? null,
        dateFrom: dateFrom ? dateFrom.toISOString() : null,
        dateTo: dateTo ? dateTo.toISOString() : null,
        includeHiddenComments,
      },
      total: records.length,
      records,
    };

    const stamp = new Date().toISOString().slice(0, 10);
    if (format === 'json') {
      return {
        format,
        fileName: `behavior-records-${stamp}.json`,
        contentType: 'application/json',
        content: JSON.stringify(payload, null, 2),
        payload,
      };
    }

    return {
      format,
      fileName: `behavior-records-${stamp}.md`,
      contentType: 'text/markdown',
      content: this.renderRecordsMarkdown(payload),
      payload,
    };
  }

  // ---- 数据归一化 ---------------------------------------------------------

  private async collectOwnerRecords(
    ownerId: string,
    options: {
      dateFrom?: Date;
      dateTo?: Date;
      includeHiddenComments?: boolean;
    } = {},
  ): Promise<BehaviorRecord[]> {
    const createdAtWhere = this.dateRangeWhere(
      options.dateFrom,
      options.dateTo,
    );
    const commentStatuses = options.includeHiddenComments
      ? ['published', 'hidden']
      : ['published'];

    const momentCommentWhere: FindOptionsWhere<MomentCommentEntity> = {
      authorId: ownerId,
      authorType: 'user',
    };
    const momentLikeWhere: FindOptionsWhere<MomentLikeEntity> = {
      authorId: ownerId,
      authorType: 'user',
    };
    const feedCommentWhere: FindOptionsWhere<FeedCommentEntity> = {
      authorId: ownerId,
      authorType: 'user',
      status: In(commentStatuses),
    };
    const interactionWhere: FindOptionsWhere<UserFeedInteractionEntity> = {
      ownerId,
    };
    const followWhere: FindOptionsWhere<VideoChannelFollowEntity> = {
      ownerId,
    };
    if (createdAtWhere) {
      momentCommentWhere.createdAt = createdAtWhere;
      momentLikeWhere.createdAt = createdAtWhere;
      feedCommentWhere.createdAt = createdAtWhere;
      interactionWhere.createdAt = createdAtWhere;
      followWhere.createdAt = createdAtWhere;
    }

    const [
      momentComments,
      momentLikes,
      feedComments,
      interactions,
      follows,
    ] = await Promise.all([
      this.momentCommentRepo.find({ where: momentCommentWhere }),
      this.momentLikeRepo.find({ where: momentLikeWhere }),
      this.feedCommentRepo.find({ where: feedCommentWhere }),
      this.interactionRepo.find({ where: interactionWhere }),
      this.followRepo.find({ where: followWhere }),
    ]);

    // 批量补帖子上下文，避免逐行查询。
    const momentPostIds = new Set<string>();
    for (const comment of momentComments) momentPostIds.add(comment.postId);
    for (const like of momentLikes) momentPostIds.add(like.postId);
    const feedPostIds = new Set<string>();
    for (const comment of feedComments) feedPostIds.add(comment.postId);
    for (const interaction of interactions) {
      if (interaction.postId) feedPostIds.add(interaction.postId);
    }

    const [momentPosts, feedPosts] = await Promise.all([
      momentPostIds.size
        ? this.momentPostRepo.find({
            where: { id: In([...momentPostIds]) },
          })
        : Promise.resolve([]),
      feedPostIds.size
        ? this.feedPostRepo.find({ where: { id: In([...feedPostIds]) } })
        : Promise.resolve([]),
    ]);
    const momentPostMap = new Map(momentPosts.map((post) => [post.id, post]));
    const feedPostMap = new Map(feedPosts.map((post) => [post.id, post]));

    // follow 行只有 authorId，批量补角色名。
    const followAuthorIds = follows
      .filter((follow) => follow.authorType === 'character')
      .map((follow) => follow.authorId);
    const characterMap = new Map<string, CharacterEntity>();
    if (followAuthorIds.length) {
      const characters = await this.characterRepo.find({
        where: { id: In(followAuthorIds) },
      });
      for (const character of characters) {
        characterMap.set(character.id, character);
      }
    }

    const records: BehaviorRecord[] = [];

    for (const comment of momentComments) {
      const post = momentPostMap.get(comment.postId);
      records.push({
        id: `mc:${comment.id}`,
        surface: 'moments',
        behaviorType: 'comment',
        sourceTable: 'moment_comments',
        sourceId: comment.id,
        targetPostId: comment.postId,
        targetPostExcerpt: post ? this.truncate(post.text) : null,
        targetPostMediaType: post ? post.contentType ?? null : null,
        targetAuthorId: post ? post.authorId : null,
        targetAuthorName: post ? post.authorName : null,
        targetAuthorType: post ? this.normalizeAuthorType(post.authorType) : null,
        text: comment.text,
        payload: comment.replyToCommentId
          ? {
              replyToCommentId: comment.replyToCommentId,
              replyToAuthorId: comment.replyToAuthorId ?? null,
            }
          : null,
        postMissing: !post,
        createdAt: this.toIso(comment.createdAt),
      });
    }

    for (const like of momentLikes) {
      const post = momentPostMap.get(like.postId);
      records.push({
        id: `ml:${like.id}`,
        surface: 'moments',
        behaviorType: 'like',
        sourceTable: 'moment_likes',
        sourceId: like.id,
        targetPostId: like.postId,
        targetPostExcerpt: post ? this.truncate(post.text) : null,
        targetPostMediaType: post ? post.contentType ?? null : null,
        targetAuthorId: post ? post.authorId : null,
        targetAuthorName: post ? post.authorName : null,
        targetAuthorType: post ? this.normalizeAuthorType(post.authorType) : null,
        text: null,
        payload: null,
        postMissing: !post,
        createdAt: this.toIso(like.createdAt),
      });
    }

    for (const comment of feedComments) {
      const post = feedPostMap.get(comment.postId);
      records.push({
        id: `fc:${comment.id}`,
        surface: this.resolveFeedSurface(post?.surface),
        behaviorType: 'comment',
        sourceTable: 'feed_comments',
        sourceId: comment.id,
        targetPostId: comment.postId,
        targetPostExcerpt: post ? this.feedExcerpt(post) : null,
        targetPostMediaType: post ? post.mediaType ?? null : null,
        targetAuthorId: post ? post.authorId : null,
        targetAuthorName: post ? post.authorName : null,
        targetAuthorType: post ? this.normalizeAuthorType(post.authorType) : null,
        text: comment.text,
        payload: comment.replyToCommentId
          ? {
              replyToCommentId: comment.replyToCommentId,
              replyToAuthorId: comment.replyToAuthorId ?? null,
            }
          : null,
        postMissing: !post,
        createdAt: this.toIso(comment.createdAt),
      });
    }

    for (const interaction of interactions) {
      const behaviorType = this.normalizeInteractionType(interaction.type);
      if (!behaviorType) {
        continue;
      }
      // forward_to_chat 由 forwardChannelPostToChat 写入，owner 主动转发与 AI 角色
      // 主动转发（runChannelProactiveForwardTick）共用同一写入路径、都挂 ownerId=主人。
      // 仅 payload.viaActorType==='user' 才是真人主动转发；角色发起的"推给我"不是
      // 主人行为，按"仅真人用户行为"口径排除。
      if (
        behaviorType === 'forward_to_chat' &&
        this.readPayloadString(interaction.payload, 'viaActorType') !== 'user'
      ) {
        continue;
      }
      const post = interaction.postId
        ? feedPostMap.get(interaction.postId)
        : undefined;
      records.push({
        id: `fi:${interaction.id}`,
        surface: this.resolveFeedSurface(post?.surface),
        behaviorType,
        sourceTable: 'user_feed_interactions',
        sourceId: interaction.id,
        targetPostId: interaction.postId ?? null,
        targetPostExcerpt: post ? this.feedExcerpt(post) : null,
        targetPostMediaType: post ? post.mediaType ?? null : null,
        targetAuthorId: post ? post.authorId : null,
        targetAuthorName: post ? post.authorName : null,
        targetAuthorType: post ? this.normalizeAuthorType(post.authorType) : null,
        text: null,
        payload: interaction.payload ?? null,
        postMissing: Boolean(interaction.postId) && !post,
        createdAt: this.toIso(interaction.createdAt),
      });
    }

    for (const follow of follows) {
      const character =
        follow.authorType === 'character'
          ? characterMap.get(follow.authorId)
          : undefined;
      records.push({
        id: `vf:${follow.id}`,
        surface: 'channels',
        behaviorType: 'follow',
        sourceTable: 'video_channel_follows',
        sourceId: follow.id,
        targetPostId: null,
        targetPostExcerpt: null,
        targetPostMediaType: null,
        targetAuthorId: follow.authorId,
        targetAuthorName: character?.name ?? follow.authorId,
        targetAuthorType: this.normalizeAuthorType(follow.authorType),
        text: null,
        payload: follow.muted ? { muted: true } : null,
        postMissing: false,
        createdAt: this.toIso(follow.createdAt),
      });
    }

    records.sort(
      (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
    );
    return records;
  }

  // ---- 聚合 ---------------------------------------------------------------

  private buildTrendPoints(
    records: BehaviorRecord[],
    days: number,
  ): BehaviorTrendPoint[] {
    const startDate = this.startOfLocalDay(this.daysAgo(days - 1));
    const buckets = new Map<string, BehaviorTrendPoint>();

    for (let offset = 0; offset < days; offset += 1) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + offset);
      const key = this.formatLocalDayKey(currentDate);
      buckets.set(key, {
        date: key,
        total: 0,
        comment: 0,
        like: 0,
        share: 0,
        forwardToChat: 0,
        favorite: 0,
        view: 0,
        follow: 0,
        notInterested: 0,
        commentLike: 0,
      });
    }

    for (const record of records) {
      const key = this.formatLocalDayKey(new Date(record.createdAt));
      const bucket = buckets.get(key);
      if (!bucket) {
        continue;
      }
      bucket.total += 1;
      switch (record.behaviorType) {
        case 'comment':
          bucket.comment += 1;
          break;
        case 'like':
          bucket.like += 1;
          break;
        case 'share':
          bucket.share += 1;
          break;
        case 'forward_to_chat':
          bucket.forwardToChat += 1;
          break;
        case 'favorite':
          bucket.favorite += 1;
          break;
        case 'view':
          bucket.view += 1;
          break;
        case 'follow':
          bucket.follow += 1;
          break;
        case 'not_interested':
          bucket.notInterested += 1;
          break;
        case 'comment_like':
          bucket.commentLike += 1;
          break;
      }
    }

    return Array.from(buckets.values());
  }

  private resolveMostActiveDay(trend: BehaviorTrendPoint[]): string | null {
    let best: BehaviorTrendPoint | null = null;
    for (const point of trend) {
      if (point.total > 0 && (!best || point.total > best.total)) {
        best = point;
      }
    }
    return best ? best.date : null;
  }

  private resolveMostActiveWeekday(records: BehaviorRecord[]): string | null {
    if (!records.length) {
      return null;
    }
    const weekdayCounts = new Map<number, number>();
    const lastThirtyDays = this.daysAgo(30).getTime();
    for (const record of records) {
      const time = Date.parse(record.createdAt);
      if (time < lastThirtyDays) {
        continue;
      }
      const weekday = new Date(time).getDay();
      weekdayCounts.set(weekday, (weekdayCounts.get(weekday) ?? 0) + 1);
    }
    if (!weekdayCounts.size) {
      return null;
    }
    const [weekdayIndex] = [...weekdayCounts.entries()].sort(
      (left, right) => right[1] - left[1] || left[0] - right[0],
    )[0];
    return (
      ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][weekdayIndex] ??
      null
    );
  }

  private resolveTopAuthors(records: BehaviorRecord[]): BehaviorTargetRank[] {
    const map = new Map<string, BehaviorTargetRank>();
    for (const record of records) {
      if (!record.targetAuthorId) {
        continue;
      }
      const existing = map.get(record.targetAuthorId);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(record.targetAuthorId, {
          authorId: record.targetAuthorId,
          authorName: record.targetAuthorName ?? record.targetAuthorId,
          authorType: record.targetAuthorType,
          count: 1,
        });
      }
    }
    return [...map.values()]
      .sort((left, right) => right.count - left.count)
      .slice(0, TOP_RANK_LIMIT);
  }

  private resolveTopPosts(records: BehaviorRecord[]): BehaviorPostRank[] {
    const map = new Map<string, BehaviorPostRank>();
    for (const record of records) {
      if (!record.targetPostId || record.postMissing) {
        continue;
      }
      const existing = map.get(record.targetPostId);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(record.targetPostId, {
          postId: record.targetPostId,
          surface: record.surface,
          excerpt: record.targetPostExcerpt,
          authorName: record.targetAuthorName,
          count: 1,
        });
      }
    }
    return [...map.values()]
      .sort((left, right) => right.count - left.count)
      .slice(0, TOP_RANK_LIMIT);
  }

  // ---- 渲染 ---------------------------------------------------------------

  private renderRecordsMarkdown(payload: BehaviorRecordExportPayload): string {
    const lines: string[] = [];
    lines.push('# 用户行为记录导出');
    lines.push('');
    lines.push(`- 世界主人：${payload.owner.username || payload.owner.id}`);
    lines.push(`- 导出时间：${payload.exportedAt}`);
    lines.push(`- 记录条数：${payload.total}`);
    const filterParts: string[] = [];
    if (payload.filters.surface) filterParts.push(`面=${payload.filters.surface}`);
    if (payload.filters.behaviorType)
      filterParts.push(`类型=${payload.filters.behaviorType}`);
    if (payload.filters.dateFrom)
      filterParts.push(`起=${payload.filters.dateFrom}`);
    if (payload.filters.dateTo) filterParts.push(`止=${payload.filters.dateTo}`);
    if (filterParts.length) {
      lines.push(`- 过滤：${filterParts.join('，')}`);
    }
    lines.push('');
    lines.push('| 时间 | 面 | 行为 | 目标作者 | 摘要/内容 |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const record of payload.records) {
      const detail = (record.text ?? record.targetPostExcerpt ?? '')
        .replace(/\|/g, '\\|')
        .replace(/\n+/g, ' ')
        .trim();
      lines.push(
        `| ${record.createdAt} | ${record.surface} | ${record.behaviorType} | ${
          record.targetAuthorName ?? '-'
        } | ${detail || '-'} |`,
      );
    }
    lines.push('');
    return lines.join('\n');
  }

  // ---- helpers ------------------------------------------------------------

  private serializeOwner(owner: {
    id: string;
    username: string;
    avatar?: string | null;
  }): BehaviorOwnerSummary {
    return {
      id: owner.id,
      username: owner.username ?? '',
      avatar: owner.avatar?.trim() ? owner.avatar : null,
    };
  }

  private resolveFeedSurface(surface: string | undefined): BehaviorSurface {
    return surface === 'channels' ? 'channels' : 'feed';
  }

  private feedExcerpt(post: FeedPostEntity): string | null {
    const base = post.title?.trim() ? post.title : post.text;
    return this.truncate(base);
  }

  private normalizeAuthorType(value: string): 'user' | 'character' {
    return value === 'user' ? 'user' : 'character';
  }

  private normalizeInteractionType(value: string): BehaviorType | null {
    return INTERACTION_TYPES.has(value as BehaviorType)
      ? (value as BehaviorType)
      : null;
  }

  private normalizeSurface(value: string | undefined): BehaviorSurface | null {
    return BEHAVIOR_SURFACES.includes(value as BehaviorSurface)
      ? (value as BehaviorSurface)
      : null;
  }

  private normalizeBehaviorType(
    value: string | undefined,
  ): BehaviorType | null {
    return BEHAVIOR_TYPES.includes(value as BehaviorType)
      ? (value as BehaviorType)
      : null;
  }

  private normalizeExportFormat(
    value: string | undefined,
  ): BehaviorRecordExportFormat {
    return value === 'json' ? 'json' : 'markdown';
  }

  private normalizeBoolean(value: boolean | string | undefined) {
    return value === true || value === 'true' || value === '1';
  }

  private normalizePositiveInteger(
    value: number | string | undefined,
    fallback: number,
  ) {
    const parsed =
      typeof value === 'number' && Number.isFinite(value)
        ? value
        : Number(value);
    return parsed > 0 ? Math.floor(parsed) : fallback;
  }

  // 解析日期筛选边界。前端 <input type="date"> 传裸 'YYYY-MM-DD'，若直接
  // new Date() 会按 UTC 零点解析，在 UTC+8 下 dateTo=今天会把今天几乎整天都排除。
  // 这里把裸日期按"本地日"解释：start=本地当天 00:00:00.000，end=本地当天
  // 23:59:59.999，与趋势/分组用的本地日口径一致；带时分秒的完整时间戳则原样解析。
  private parseRangeBound(
    value: string | undefined,
    bound: 'start' | 'end',
  ): Date | undefined {
    const trimmed = value?.trim();
    if (!trimmed) {
      return undefined;
    }
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (dateOnly) {
      const year = Number(dateOnly[1]);
      const month = Number(dateOnly[2]) - 1;
      const day = Number(dateOnly[3]);
      return bound === 'end'
        ? new Date(year, month, day, 23, 59, 59, 999)
        : new Date(year, month, day, 0, 0, 0, 0);
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  private readPayloadString(
    payload: Record<string, unknown> | null | undefined,
    key: string,
  ): string | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    const value = (payload as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : null;
  }

  private dateRangeWhere(from?: Date, to?: Date) {
    if (from && to) {
      return Between(from, to);
    }
    if (from) {
      return MoreThanOrEqual(from);
    }
    if (to) {
      return LessThanOrEqual(to);
    }
    return undefined;
  }

  private truncate(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    if (!trimmed) {
      return null;
    }
    return trimmed.length > EXCERPT_MAX_LENGTH
      ? `${trimmed.slice(0, EXCERPT_MAX_LENGTH)}...`
      : trimmed;
  }

  private toIso(value: Date): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }

  private startOfLocalDay(value: Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  private formatLocalDayKey(value: Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private daysAgo(days: number) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  }
}
// i18n-ignore-end
