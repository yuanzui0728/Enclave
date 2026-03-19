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

  @Column('text')
  text: string;

  @Column({ nullable: true })
  mediaUrl?: string;

  @Column({ default: 'text' })
  mediaType: string; // 'text' | 'image' | 'video'

  @Column({ default: 0 })
  likeCount: number;

  @Column({ default: 0 })
  commentCount: number;

  @Column({ default: false })
  aiReacted: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
