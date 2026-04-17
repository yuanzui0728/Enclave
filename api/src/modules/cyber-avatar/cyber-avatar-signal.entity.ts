import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('cyber_avatar_signals')
export class CyberAvatarSignalEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ownerId: string;

  @Column()
  signalType: string;

  @Column()
  sourceSurface: string;

  @Column()
  sourceEntityType: string;

  @Column()
  sourceEntityId: string;

  @Column({ type: 'text', nullable: true })
  dedupeKey?: string | null;

  @Column('text')
  summaryText: string;

  @Column('simple-json', { nullable: true })
  payload?: Record<string, unknown> | null;

  @Column({ type: 'float', default: 1 })
  weight: number;

  @Column({ default: 'pending' })
  status: string;

  @Column({
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  occurredAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

