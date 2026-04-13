import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type GroupReplyTaskStatus =
  | 'pending'
  | 'processing'
  | 'sent'
  | 'cancelled'
  | 'failed';

@Entity('group_reply_tasks')
@Index('idx_group_reply_tasks_group_status', ['groupId', 'status'])
@Index('idx_group_reply_tasks_status_execute_after', ['status', 'executeAfter'])
export class GroupReplyTaskEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  turnId: string;

  @Column()
  groupId: string;

  @Column()
  triggerMessageId: string;

  @Column('datetime')
  triggerMessageCreatedAt: Date;

  @Column()
  actorCharacterId: string;

  @Column()
  actorName: string;

  @Column()
  sequenceIndex: number;

  @Column({ default: 'pending' })
  status: GroupReplyTaskStatus;

  @Column('datetime')
  executeAfter: Date;

  @Column('text')
  conversationHistoryPayload: string;

  @Column('text')
  userPromptText: string;

  @Column('text', { nullable: true })
  userMessagePartsPayload?: string | null;

  @Column('text', { nullable: true })
  cancelReason?: string | null;

  @Column('text', { nullable: true })
  errorMessage?: string | null;

  @Column('datetime', { nullable: true })
  lastAttemptAt?: Date | null;

  @Column('datetime', { nullable: true })
  sentAt?: Date | null;

  @Column('datetime', { nullable: true })
  cancelledAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
