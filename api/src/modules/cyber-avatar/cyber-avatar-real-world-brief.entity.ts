import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('cyber_avatar_real_world_briefs')
export class CyberAvatarRealWorldBriefEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ownerId: string;

  @Column({ default: 'active' })
  status: string;

  @Column()
  briefDate: string;

  @Column('text')
  title: string;

  @Column('text')
  summary: string;

  @Column('simple-json', { nullable: true })
  bulletPoints?: string[] | null;

  @Column('simple-json', { nullable: true })
  queryHints?: string[] | null;

  @Column('simple-json', { nullable: true })
  needSignals?: string[] | null;

  @Column('simple-json', { nullable: true })
  relatedItemIds?: string[] | null;

  @Column('simple-json', { nullable: true })
  metadataPayload?: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
