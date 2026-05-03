import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('wiki_edit_submissions')
@Index(['decision', 'createdAt'])
export class EditSubmissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  revisionId: string;

  @Column()
  characterId: string;

  @Column()
  submitterId: string;

  @Column({ type: 'text', nullable: true })
  decision?: string | null; // 'approve' | 'reject' | 'request_changes'

  @Column({ type: 'text', nullable: true })
  reviewerId?: string | null;

  @Column({ type: 'datetime', nullable: true })
  decidedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  reviewerNote?: string | null;

  @Column({ default: 0 })
  priority: number;

  @CreateDateColumn()
  createdAt: Date;
}
