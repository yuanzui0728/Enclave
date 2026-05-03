import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity("cloud_configs")
export class CloudConfigEntity {
  @PrimaryColumn()
  key: string;

  @Column({ type: "text" })
  value: string;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ type: "text", nullable: true })
  updatedBy: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
