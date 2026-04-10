import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('official_account_service_messages')
export class OfficialAccountServiceMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ownerId: string;

  @Column()
  accountId: string;

  @Column({ default: 'text' })
  type: string;

  @Column({ type: 'text', default: '' })
  text: string;

  @Column('text', { nullable: true })
  attachmentKind?: string | null;

  @Column({ type: 'text', nullable: true })
  attachmentPayload?: string | null;

  @Column({ type: 'datetime', nullable: true })
  readAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
