import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('moment_posts')
@Index('idx_moment_posts_postedAt', ['postedAt'])
// (authorId, postedAt) 复合索引在 MomentsService.ensureMomentUniqueIndexes() 里
// 运行时创建（idx_moment_posts_author_postedAt）。直接在 entity 上挂 @Index 也行，
// 但走 runtime CREATE INDEX IF NOT EXISTS 跟其它索引补建路径对称、幂等。
// 用途：getFeed({ ownerOnly })、getFeed({ characterAuthorId }) 走 authorId 过滤，
// 之前只有 (postedAt) 单列索引会退化成全表扫；典型世界几百到几千条 moment_posts
// 量级上"我的朋友圈"和单角色朋友圈页能省 50ms+ 的扫描。
export class MomentPostEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  authorId: string;

  @Column()
  authorName: string;

  @Column()
  authorAvatar: string;

  @Column({ default: 'character' })
  authorType: string; // 'user' | 'character'

  @Column({ default: 'public' })
  visibility: string; // 'public' | 'friends' | 'private'

  @Column('text')
  text: string;

  @Column({ nullable: true })
  location?: string;

  @Column({ default: 'text' })
  contentType: string;

  @Column('text', { nullable: true })
  mediaPayload?: string;

  @Column({ default: 'routine_ai' })
  generationKind: string;

  @Column('simple-json', { nullable: true })
  generationMetadata?: Record<string, unknown> | null;

  @Column({ default: 0 })
  likeCount: number;

  @Column({ default: 0 })
  commentCount: number;

  @CreateDateColumn()
  postedAt: Date;
}
