import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('feed_posts')
export class FeedPostEntity {
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

  @Column({ default: 'feed' })
  surface: string; // 'feed' | 'channels'

  @Column('text')
  text: string;

  @Column({ type: 'text', nullable: true })
  title?: string | null;

  @Column({ nullable: true })
  mediaUrl?: string;

  @Column({ type: 'text', nullable: true })
  coverUrl?: string | null;

  @Column({ default: 'text' })
  mediaType: string; // 'text' | 'image' | 'video'

  @Column({ type: 'integer', nullable: true })
  durationMs?: number | null;

  @Column({ type: 'float', nullable: true })
  aspectRatio?: number | null;

  @Column('simple-json', { nullable: true })
  topicTags?: string[] | null;

  @Column({ default: 'published' })
  publishStatus: string; // 'draft' | 'published' | 'hidden' | 'deleted'

  @Column({ default: 0 })
  likeCount: number;

  @Column({ default: 0 })
  commentCount: number;

  @Column({ default: 0 })
  shareCount: number;

  @Column({ default: 0 })
  favoriteCount: number;

  @Column({ default: 0 })
  viewCount: number;

  @Column({ default: 0 })
  watchCount: number;

  @Column({ default: 0 })
  completeCount: number;

  @Column({ default: false })
  aiReacted: boolean;

  @Column({ default: 'owner_upload' })
  sourceKind: string; // 'seed' | 'ai_generated' | 'owner_upload' | 'character_generated' | 'live_clip'

  @Column({ type: 'float', default: 0 })
  recommendationScore: number;

  @Column('simple-json', { nullable: true })
  statsPayload?: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
