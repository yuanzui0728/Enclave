import { CreateDateColumn, Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Index } from "typeorm";

@Entity("cloud_world_requests")
export class CloudWorldRequestEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column()
  phone: string;

  @Column()
  worldName: string;

  @Column()
  status: string;

  @Column({ nullable: true })
  note: string | null;

  @Column({ default: "app" })
  source: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
