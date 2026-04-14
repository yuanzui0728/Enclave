import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('user_feed_interactions')
export class UserFeedInteractionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'userId' })
  ownerId: string;

  @Column()
  postId: string;

  @Column()
  type: string; // 'like' | 'favorite' | 'share' | 'view' | 'not_interested' | 'comment_like'

  @Column('simple-json', { nullable: true })
  payload?: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
