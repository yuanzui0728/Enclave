import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('conversations')
export class ConversationEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  userId: string;

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

  @Column({ type: 'datetime', nullable: true })
  lastClearedAt?: Date | null;

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
