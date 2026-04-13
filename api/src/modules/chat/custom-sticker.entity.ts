import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('chat_custom_stickers')
export class ChatCustomStickerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ownerId: string;

  @Column('text')
  label: string;

  @Column('text', { nullable: true })
  keywordsPayload?: string | null;

  @Column()
  fileName: string;

  @Column()
  storageFileName: string;

  @Column()
  mimeType: string;

  @Column('text')
  url: string;

  @Column({ default: 0 })
  sizeBytes: number;

  @Column('integer', { nullable: true })
  width?: number | null;

  @Column('integer', { nullable: true })
  height?: number | null;

  @Column()
  assetHash: string;

  @Column({ default: 'upload' })
  source: string;

  @Column('text', { nullable: true })
  sourceThreadType?: string | null;

  @Column('text', { nullable: true })
  sourceThreadId?: string | null;

  @Column('text', { nullable: true })
  sourceMessageId?: string | null;

  @Column({ type: 'datetime', nullable: true })
  lastUsedAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
