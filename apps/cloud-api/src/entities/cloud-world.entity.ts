import { CreateDateColumn, Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Index } from "typeorm";

@Entity("cloud_worlds")
export class CloudWorldEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index({ unique: true })
  @Column()
  phone: string;

  @Column()
  name: string;

  @Column()
  status: string;

  @Column({ type: "text", nullable: true })
  apiBaseUrl: string | null;

  @Column({ type: "text", nullable: true })
  adminUrl: string | null;

  @Column({ type: "text", nullable: true })
  note: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
