import { CreateDateColumn, Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from "typeorm";

@Entity("phone_verification_sessions")
export class PhoneVerificationSessionEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  phone: string;

  @Column()
  code: string;

  @Column({ default: "world_access" })
  purpose: string;

  @Column({ type: "datetime" })
  expiresAt: Date;

  @Column({ type: "datetime", nullable: true })
  verifiedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
