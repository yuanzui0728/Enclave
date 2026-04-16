import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('admin_conversation_reviews')
@Index(['ownerId'])
export class AdminConversationReviewEntity {
  @PrimaryColumn()
  conversationId: string;

  @Column()
  ownerId: string;

  @Column({ default: 'backlog' })
  status: string;

  @Column('simple-json', { nullable: true })
  tags?: string[] | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
