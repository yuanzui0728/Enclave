import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { ReminderRecurrenceRule } from './reminder-runtime.types';

@Entity('reminder_tasks')
export class ReminderTaskEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ownerId: string;

  @Column()
  characterId: string;

  @Column('text', { nullable: true })
  sourceConversationId?: string | null;

  @Column('text', { nullable: true })
  sourceMessageId?: string | null;

  @Column('text')
  title: string;

  @Column('text', { nullable: true })
  detail?: string | null;

  @Column({ default: 'general' })
  category: string;

  @Column({ default: 'one_time' })
  kind: string;

  @Column({ default: 'active' })
  status: string;

  @Column({ default: 'soft' })
  priority: string;

  @Column({ default: 'Asia/Shanghai' })
  timezone: string;

  @Column({ type: 'datetime', nullable: true })
  dueAt?: Date | null;

  @Column('simple-json', { nullable: true })
  recurrenceRule?: ReminderRecurrenceRule | null;

  @Column({ type: 'datetime', nullable: true })
  nextTriggerAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastTriggeredAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastDeliveredAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  snoozedUntil?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastCompletedAt?: Date | null;

  @Column({ default: 0 })
  completionCount: number;

  @Column({ type: 'datetime', nullable: true })
  completedAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  cancelledAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
