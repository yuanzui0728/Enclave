import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  CharacterVideoPublishState,
  CharacterVideoStatus,
} from '../character-video.types';

/**
 * wiki 私有角色「自然语言造视频」的持久化（住在 wiki.sqlite）。
 * 一行 = 一次用户发起的视频生成。生成走 MiniMax 视频 job（targetType=
 * 'wiki_character_video'，job.targetId 挂本行 id）；ready 后推到 cloud-api
 * 中心存储并扇出到所有导入了该私有角色的 world 视频号。
 */
@Entity('character_videos')
@Index('idx_character_videos_owner_updated', ['ownerWikiUserId', 'updatedAt'])
@Index('idx_character_videos_minimax_job', ['minimaxJobId'])
export class CharacterVideoEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** 创作者 wiki 用户 id。 */
  @Column()
  ownerWikiUserId!: string;

  /** 关联的私有角色 id（user_private_characters.id）= 扇出登记键 sourceCharacterId。 */
  @Column()
  privateCharacterId!: string;

  /** 生成当时的角色名 / 头像快照（角色后续改名也不影响已发视频归属）。 */
  @Column({ default: '' })
  characterName!: string;

  @Column({ default: '' })
  characterAvatar!: string;

  /** 角色定位（relationship 快照），用于拼视频提示词。 */
  @Column({ type: 'text', nullable: true })
  relationship?: string | null;

  /** 用户输入的自然语言。 */
  @Column('text')
  prompt!: string;

  /** 实际喂给 MiniMax 的终稿提示词（拼接后）。 */
  @Column({ type: 'text', nullable: true })
  refinedPrompt?: string | null;

  @Column({ default: 'generating' })
  status!: CharacterVideoStatus;

  @Column({ type: 'text', nullable: true })
  minimaxJobId?: string | null;

  /** ready 后的本地产物（wiki 进程 data/wiki/moments-media）。 */
  @Column({ type: 'text', nullable: true })
  videoFileName?: string | null;

  @Column({ type: 'text', nullable: true })
  localVideoUrl?: string | null;

  @Column({ type: 'text', nullable: true })
  coverUrl?: string | null;

  @Column({ type: 'integer', nullable: true })
  durationMs?: number | null;

  /** 中心发布 / 扇出状态。 */
  @Column({ default: 'not_published' })
  publishState!: CharacterVideoPublishState;

  /** cloud-api 侧 PublishedCharacterVideoEntity.id（发布成功后回填）。 */
  @Column({ type: 'text', nullable: true })
  publishedCloudVideoId?: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null;

  @Column({ default: false })
  isDeleted!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
