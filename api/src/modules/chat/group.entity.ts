import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('groups')
export class GroupEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  avatar?: string;

  @Column()
  creatorId: string;

  @Column({ default: 'user' })
  creatorType: string; // 'user' | 'character'

  @Column('text', { nullable: true })
  announcement?: string | null;

  @Column({ default: false })
  isMuted: boolean;

  @Column({ type: 'datetime', nullable: true })
  mutedAt?: Date | null;

  @Column({ default: false })
  isPinned: boolean;

  @Column({ type: 'datetime', nullable: true })
  pinnedAt?: Date | null;

  @Column({ default: false })
  savedToContacts: boolean;

  @Column({ type: 'datetime', nullable: true })
  savedToContactsAt?: Date | null;

  @Column({ default: true })
  showMemberNicknames: boolean;

  @Column({ default: true })
  notifyOnAtMe: boolean;

  @Column({ default: true })
  notifyOnAtAll: boolean;

  @Column({ default: true })
  notifyOnAnnouncement: boolean;

  @Column({ default: 'inherit' })
  chatBackgroundMode: string;

  @Column('text', { nullable: true })
  chatBackgroundPayload?: string | null;

  @Column({ type: 'datetime', nullable: true })
  lastClearedAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastReadAt?: Date | null;

  @Column({ default: false })
  isHidden: boolean;

  @Column({ type: 'datetime', nullable: true })
  hiddenAt?: Date | null;

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
