import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { applyOwnerIdColumn } from '../tenancy/tenant-entity';

// i18n-ignore-start: data / seed / preset content — not user-facing UI.
@Entity('conversations')
export class ConversationEntity {
  @PrimaryColumn()
  id: string;

  // 列定义按运行模式应用（见文件末尾）：DB 列名是 userId。shared 模式下是复合主键
  // (userId,id) 的一部分（DB 由 step1b 建成复合主键）——会话 id 形如 direct_<charId>，
  // 跨租户重复，靠复合主键避免 save() 误覆盖别人的同 id 会话；LPP 为普通必填列。
  ownerId: string;

  @Column({ default: 'direct' })
  type: string;

  @Column()
  title: string;

  @Column('simple-json')
  participants: string[];

  @Column({ type: 'datetime', nullable: true })
  lastReadAt?: Date | null;

  @Column({ default: false })
  isPinned: boolean;

  @Column({ type: 'datetime', nullable: true })
  pinnedAt?: Date | null;

  @Column({ default: false })
  isHidden: boolean;

  @Column({ type: 'datetime', nullable: true })
  hiddenAt?: Date | null;

  @Column({ default: false })
  isMuted: boolean;

  @Column({ type: 'datetime', nullable: true })
  mutedAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  strongReminderUntil?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastClearedAt?: Date | null;

  @Column({ default: 'inherit' })
  chatBackgroundMode: string;

  @Column({ type: 'text', nullable: true })
  chatBackgroundPayload?: string | null;

  @Column({
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  lastActivityAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

// 模式感知主键：shared=复合 (userId,id)；LPP/wiki/prep=单 id + 普通必填 userId 列。
applyOwnerIdColumn(ConversationEntity.prototype, 'ownerId', {
  name: 'userId',
  type: 'varchar',
  nullable: false,
});
// i18n-ignore-end
