import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

// 内嵌定义而不是从 favorites.service 引入，避免循环依赖。语义需与
// FavoriteNoteAsset 保持一致。
type StoredFavoriteNoteAsset = {
  id: string;
  kind: 'image' | 'file';
  fileName: string;
  url: string;
  mimeType?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
};

@Entity('chat_favorite_notes')
@Index('idx_chat_favorite_notes_updatedAt', ['updatedAt'])
export class FavoriteNoteEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  excerpt: string;

  @Column({ type: 'text' })
  contentHtml: string;

  @Column({ type: 'text' })
  contentText: string;

  @Column('simple-json')
  tags: string[];

  @Column('simple-json')
  assets: StoredFavoriteNoteAsset[];

  @Column()
  createdAt: string;

  @Column()
  updatedAt: string;

  @CreateDateColumn({ name: 'rowCreatedAt' })
  rowCreatedAt: Date;
}
