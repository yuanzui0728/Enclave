import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('character_pages')
export class CharacterPageEntity {
  @PrimaryColumn()
  characterId: string;

  @Column({ type: 'text', nullable: true })
  currentRevisionId?: string | null;

  @Column({ default: 'none' })
  protectionLevel: string; // 'none' | 'semi' | 'full'

  @Column({ type: 'datetime', nullable: true })
  protectionExpiresAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  protectionReason?: string | null;

  @Column({ default: false })
  isPatrolled: boolean;

  @Column({ default: 0 })
  watcherCount: number;

  @Column({ default: 0 })
  editCount: number;

  @Column({ default: false })
  isDeleted: boolean;

  @Column({ type: 'datetime', nullable: true })
  deletedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  deletedBy?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
