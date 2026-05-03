import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("user_subscriptions")
@Index("IDX_user_subscriptions_user_status_expires", ["userId", "status", "expiresAt"])
export class UserSubscriptionEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column()
  userId: string;

  @Column()
  planCode: string;

  @Column()
  source: string;

  @Index()
  @Column()
  status: string;

  @Column({ type: "datetime" })
  startsAt: Date;

  @Index()
  @Column({ type: "datetime" })
  expiresAt: Date;

  @Column({ type: "integer", default: 0 })
  amountCents: number;

  @Column({ type: "text", nullable: true })
  externalOrderId: string | null;

  @Column({ type: "text", nullable: true })
  note: string | null;

  @Column({ type: "text", nullable: true })
  createdBy: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
