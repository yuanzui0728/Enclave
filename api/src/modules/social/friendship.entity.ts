import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

// i18n-ignore-start: data / seed / preset content — not user-facing UI.
@Entity('friendships')
@Index(['ownerId'])
@Index(['ownerId', 'characterId'])
export class FriendshipEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'userId' })
  ownerId: string;

  @Column()
  characterId: string;

  @Column({ default: 0 })
  intimacyLevel: number; // 0-100

  @Column({ default: 'friend' })
  status: string; // 'friend' | 'close' | 'best' | 'blocked' | 'removed'

  @Column({ default: false })
  isStarred: boolean;

  @Column({ type: 'datetime', nullable: true })
  starredAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  remarkName?: string | null;

  @Column({ type: 'text', nullable: true })
  region?: string | null;

  @Column({ type: 'text', nullable: true })
  source?: string | null;

  @Column('simple-json', { nullable: true })
  tags?: string[] | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true })
  lastInteractedAt?: Date;

  @Column({ type: 'int', default: 0 })
  sparkStreak: number;

  @Column({ type: 'datetime', nullable: true })
  sparkStartedAt?: Date | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  sparkLastDay?: string | null;

  @Column({ default: false })
  momentsHiddenFromMe: boolean;

  @Column({ default: false })
  momentsHiddenFromThem: boolean;

  @Column({ default: false })
  chatOnly: boolean;
}
// i18n-ignore-end
