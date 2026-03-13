import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('conversations')
export class ConversationEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  userId: string;

  @Column({ default: 'direct' })
  type: string;

  @Column()
  title: string;

  @Column('simple-json')
  participants: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
