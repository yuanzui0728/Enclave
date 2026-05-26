import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

// sourceId 是业务幂等键（chat-message-xxx / favorite-note-xxx 等），保证同一来源
// 不会重复插入；旧版本把所有收藏塞 system_config JSON blob，多端并发就丢，本表
// 替换那条路径。
// 共享 world 多租户：原本靠每库独占隔离，现加 ownerId 列。注意 PK 仍是 sourceId，
// 多 owner 下 sourceId 会跨 owner 撞——PK 改 (ownerId, sourceId) 属迁移期 Phase 8。
@Entity('chat_favorites')
@Index('idx_chat_favorites_collectedAt', ['collectedAt'])
export class FavoriteEntity {
  @PrimaryColumn()
  sourceId: string;

  // 共享 world 多租户归属用户。LPP 为 NULL，shared 模式盖当前 owner。
  @Column({ type: 'text', nullable: true })
  ownerId: string | null;

  @Column()
  recordId: string;

  @Column()
  category: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column()
  meta: string;

  @Column({ type: 'text' })
  to: string;

  @Column()
  badge: string;

  @Column({ type: 'text', nullable: true })
  avatarName: string | null;

  @Column({ type: 'text', nullable: true })
  avatarSrc: string | null;

  @Column()
  collectedAt: string;

  @CreateDateColumn()
  createdAt: Date;
}
