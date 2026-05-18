import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

// 每个 user world 独占一个 SQLite 业务库，所以这里不需要 ownerId 列。
// sourceId 是业务幂等键（chat-message-xxx / favorite-note-xxx 等），保证同一来源
// 不会重复插入；旧版本把所有收藏塞 system_config JSON blob，多端并发就丢，本表
// 替换那条路径。
@Entity('chat_favorites')
@Index('idx_chat_favorites_collectedAt', ['collectedAt'])
export class FavoriteEntity {
  @PrimaryColumn()
  sourceId: string;

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
