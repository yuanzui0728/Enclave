import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('feed_post_likes')
@Index('idx_feed_post_likes_postId', ['postId'])
export class FeedPostLikeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 共享 world 多租户归属用户（子表冗余 ownerId）。LPP 为 NULL，shared 模式盖当前 owner。
  @Column({ type: 'text', nullable: true })
  ownerId: string | null;

  @Column()
  postId: string;

  @Column()
  authorId: string;

  @Column()
  authorName: string;

  @Column()
  authorAvatar: string;

  @Column({ default: 'character' })
  authorType: string; // 'user' | 'character'

  @CreateDateColumn()
  createdAt: Date;
}
