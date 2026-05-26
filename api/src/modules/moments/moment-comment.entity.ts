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

  @Column({ type: 'varchar', nullable: true })
  replyToCommentId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  replyToAuthorId?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
