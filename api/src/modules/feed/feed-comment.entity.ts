import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('feed_comments')
export class FeedCommentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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
