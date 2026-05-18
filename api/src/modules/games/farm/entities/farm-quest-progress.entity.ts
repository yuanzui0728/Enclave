import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { FarmQuestId } from '../farm.types';

@Entity('farm_quest_progress')
@Index('IDX_farm_quest_owner_quest', ['ownerId', 'questId'], { unique: true })
export class FarmQuestProgressEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ownerId: string;

  @Column({ type: 'text' })
  questId: FarmQuestId;

  @Column({ type: 'integer', default: 0 })
  progress: number;

  @Column({ type: 'boolean', default: false })
  claimed: boolean;

  // daily 任务的当前日期；achievement 则保持 null。每次 increment 前检查并重置。
  @Column({ type: 'text', nullable: true })
  dailyResetDate?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
