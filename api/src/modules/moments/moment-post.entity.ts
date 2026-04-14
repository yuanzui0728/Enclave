import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('moment_posts')
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

  @Column('text')
  text: string;

  @Column({ nullable: true })
  location?: string;

  @Column({ default: 'text' })
  contentType: string;

  @Column('text', { nullable: true })
  mediaPayload?: string;

  @Column({ default: 0 })
  likeCount: number;

  @Column({ default: 0 })
  commentCount: number;

  @CreateDateColumn()
  postedAt: Date;
}
