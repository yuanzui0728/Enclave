import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('followup_open_loops')
export class FollowupOpenLoopEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  topicKey: string;

  @Column({ default: 'open' })
  status: string;

  @Column('text')
  summary: string;

  @Column()
  sourceThreadId: string;

  @Column({ default: 'direct' })
  sourceThreadType: string;

  @Column('text', { nullable: true })
  sourceThreadTitle?: string | null;

  @Column('text', { nullable: true })
  sourceMessageId?: string | null;

  @Column('simple-json', { nullable: true })
  sourceCharacterIds?: string[] | null;

  @Column('simple-json', { nullable: true })
  domainHints?: string[] | null;

  @Column('text', { nullable: true })
  targetRelationshipType?: string | null;

  @Column({ type: 'float', default: 0 })
  urgencyScore: number;

  @Column({ type: 'float', default: 0 })
  closureScore: number;

  @Column({ type: 'float', default: 0 })
  handoffNeedScore: number;

  @Column('text', { nullable: true })
  reasonSummary?: string | null;

  @Column({ type: 'datetime' })
  lastMentionedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  recommendedAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  resolvedAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
