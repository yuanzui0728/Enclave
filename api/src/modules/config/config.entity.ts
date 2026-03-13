import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('system_config')
export class SystemConfigEntity {
  @PrimaryColumn()
  key: string;

  @Column()
  value: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
