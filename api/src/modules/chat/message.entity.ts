import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('messages')
export class MessageEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  conversationId: string;

  @Column()
  senderType: string;

  @Column()
  senderId: string;

  @Column()
  senderName: string;

  @Column({ default: 'text' })
  type: string;

  @Column('text')
  text: string;

  @CreateDateColumn()
  createdAt: Date;
}
