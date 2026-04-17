import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('cyber_avatar_real_world_items')
export class CyberAvatarRealWorldItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ownerId: string;

  @Column({ default: 'accepted' })
  status: string;

  @Column({ default: 'mock' })
  providerMode: string;

  @Column('text')
  queryText: string;

  @Column('text')
  sourceName: string;

  @Column({ type: 'text', nullable: true })
  sourceUrl?: string | null;

  @Column('text')
  title: string;

  @Column('text', { default: '' })
  snippet: string;

  @Column('text')
  normalizedSummary: string;

  @Column('simple-json', { nullable: true })
  topicTags?: string[] | null;

  @Column({ type: 'float', default: 0 })
  credibilityScore: number;

  @Column({ type: 'float', default: 0 })
  relevanceScore: number;

  @Column({ type: 'float', default: 0 })
  compositeScore: number;

  @Column({ type: 'text', nullable: true })
  dedupeHash?: string | null;

  @Column({ type: 'datetime', nullable: true })
  publishedAt?: Date | null;

  @Column({
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  capturedAt: Date;

  @Column('simple-json', { nullable: true })
  metadataPayload?: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
