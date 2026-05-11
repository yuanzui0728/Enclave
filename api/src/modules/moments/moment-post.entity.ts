import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('moment_posts')
@Index('idx_moment_posts_postedAt', ['postedAt'])
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
