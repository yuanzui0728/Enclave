import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { applyOwnerIdColumn } from '../tenancy/tenant-entity';

// i18n-ignore-start: data / seed / preset content — not user-facing UI.
@Entity('friendships')
@Index(['ownerId'])
@Index(['ownerId', 'characterId'])
export class FriendshipEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 模式感知复合主键的 owner 部分（列名 userId）。默认好友（reminder/self/news-desk）等
  // 种子 friendship 的 id 跨租户重复（实测 id=41d40825 重复 31 个 owner），DB 迁移已建成
  // PRIMARY KEY("userId","id")；若实体仍声明单 id 主键，TypeORM save(loadedRow) 会按
  // `WHERE id IN (?)` reload，命中所有 owner 的同 id 行 → afterLoad 读守卫抛（GET
  // /api/social/friends 等 500）。声明为复合主键后 save/reload/delete 都按 (userId,id) 定位。
  // 同 ConversationEntity。LPP 透传为普通列。
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

// shared：ownerId(列 userId) 进复合主键 (userId,id)；LPP/wiki/prep：普通列、单 id 主键不变。
applyOwnerIdColumn(FriendshipEntity.prototype, 'ownerId', { name: 'userId' });
// i18n-ignore-end
