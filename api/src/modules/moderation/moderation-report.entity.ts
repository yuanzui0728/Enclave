import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('moderation_reports')
export class ModerationReportEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ownerId: string;

  @Column()
  targetType: string;

  @Column()
  targetId: string;

  @Column()
  reason: string;

  @Column('text', { nullable: true })
  details?: string | null;

  @Column({ default: 'open' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;
}
