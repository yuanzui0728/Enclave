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
  isPinned: boolean;

  @Column({ type: 'datetime', nullable: true })
  pinnedAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastClearedAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
