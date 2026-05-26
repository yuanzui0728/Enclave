import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * wiki 用户用自然语言创作的「游戏」页（头指针），仿 CharacterPageEntity。
 * 实际可玩产物（HTML + spec + 对话历史）落在 game_revisions，每次 AI 生成 /
 * 迭代修改 / 复刻都新增一条 revision；本表只存头指针 + 元信息。
 */
@Entity('game_pages')
export class GamePageEntity {
  /** uuid-like，同时作为发布到隐界板块时的 proposed catalog id 的来源。 */
  @PrimaryColumn()
  gameId: string;

  @Column()
  @Index()
  ownerUserId: string;

  /** 创建时从 JWT username 冗余下来，公共画廊展示作者名免去跨 owner join。 */
  @Column({ type: 'text', nullable: true })
  authorDisplayName?: string | null;

  @Column({ type: 'text', nullable: true })
  title?: string | null;

  /** 从 artifact.spec 冗余，列表卡免加载 html 大字段即可展示。 */
  @Column({ type: 'text', nullable: true })
  pitch?: string | null;

  @Column({ type: 'text', nullable: true })
  genre?: string | null;

  /** 'private' | 'public'：public 才出现在 /games 公共画廊、才可被他人复刻。 */
  @Column({ default: 'private' })
  visibility: string;

  /** 当前展示 / 已发布的 revision。 */
  @Column({ type: 'text', nullable: true })
  currentRevisionId?: string | null;

  /** 最新创作的 revision（可能是尚未发布的草稿）。 */
  @Column({ type: 'text', nullable: true })
  latestRevisionId?: string | null;

  /** 一键复刻血缘。 */
  @Column({ type: 'text', nullable: true })
  @Index()
  forkedFromGameId?: string | null;

  @Column({ type: 'text', nullable: true })
  forkedFromRevisionId?: string | null;

  /** 已发布到隐界游戏板块的 catalog id（null = 未发布）。 */
  @Column({ type: 'text', nullable: true })
  publishedCatalogGameId?: string | null;

  @Column({ type: 'integer', nullable: true })
  publishedVersion?: number | null;

  @Column({ type: 'datetime', nullable: true })
  lastPublishedAt?: Date | null;

  /**
   * 跨进程上推 cloud-api 的同步状态：'synced' | 'pending'（上推失败留待 sweeper
   * 重试）。null = 从未发布。
   */
  @Column({ type: 'text', nullable: true })
  syncState?: string | null;

  @Column({ default: false })
  isDeleted: boolean;

  @Column({ type: 'datetime', nullable: true })
  deletedAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
