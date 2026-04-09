import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('user_feed_interactions')
export class UserFeedInteractionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'userId' })
  ownerId: string;

  @Column()
  postId: string;

  @Column()
  type: string; // 'like' | 'comment' | 'view'

  @CreateDateColumn()
  createdAt: Date;
}
