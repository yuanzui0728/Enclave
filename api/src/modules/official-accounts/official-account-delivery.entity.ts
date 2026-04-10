import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('official_account_deliveries')
@Unique(['ownerId', 'articleId', 'deliveryKind'])
export class OfficialAccountDeliveryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ownerId: string;

  @Column()
  accountId: string;

  @Column()
  articleId: string;

  @Column({ default: 'subscription_digest' })
  deliveryKind: string;

  @Column({ type: 'datetime' })
  deliveredAt: Date;

  @Column({ type: 'datetime', nullable: true })
  readAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
