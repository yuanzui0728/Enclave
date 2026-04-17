import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('followup_recommendations')
export class FollowupRecommendationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  openLoopId: string;

  @Column({ type: 'text', nullable: true })
  runId?: string | null;

  @Column({ default: 'draft' })
  status: string;

  @Column()
  recommenderCharacterId: string;

  @Column()
  recommenderCharacterName: string;

  @Column()
  targetCharacterId: string;

  @Column()
  targetCharacterName: string;

  @Column('text', { nullable: true })
  targetCharacterAvatar?: string | null;

  @Column('text', { nullable: true })
  targetCharacterRelationship?: string | null;

  @Column({ default: 'not_friend' })
  relationshipState: string;

  @Column('text')
  reasonSummary: string;

  @Column('text', { nullable: true })
  handoffSummary?: string | null;

  @Column()
  sourceThreadId: string;

  @Column({ default: 'direct' })
  sourceThreadType: string;

  @Column('text', { nullable: true })
  sourceThreadTitle?: string | null;

  @Column('text', { nullable: true })
  sourceMessageId?: string | null;

  @Column('text', { nullable: true })
  messageConversationId?: string | null;

  @Column('text', { nullable: true })
  messageId?: string | null;

  @Column('text', { nullable: true })
  cardMessageId?: string | null;

  @Column('text', { nullable: true })
  friendRequestId?: string | null;

  @Column({ type: 'datetime', nullable: true })
  openedAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  friendRequestStartedAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  friendAddedAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  chatStartedAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  resolvedAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  dismissedAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
