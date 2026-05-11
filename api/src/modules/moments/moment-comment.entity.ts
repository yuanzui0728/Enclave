import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('moment_comments')
@Index('idx_moment_comments_postId', ['postId'])
export class MomentCommentEntity {
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

  @Column({ type: 'varchar', nullable: true })
  replyToCommentId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  replyToAuthorId?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
