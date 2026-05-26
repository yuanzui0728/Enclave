import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('feed_comments')
@Index('idx_feed_comments_postId_status', ['postId', 'status'])
export class FeedCommentEntity {
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

  @Column('text')
  text: string;

  @Column({ type: 'text', nullable: true })
  parentCommentId?: string | null;

  @Column({ type: 'text', nullable: true })
  replyToCommentId?: string | null;

  @Column({ type: 'text', nullable: true })
  replyToAuthorId?: string | null;

  @Column({ default: 0 })
  likeCount: number;

  @Column({ default: 'published' })
  status: string; // 'published' | 'hidden' | 'deleted'

  @CreateDateColumn()
  createdAt: Date;
}
