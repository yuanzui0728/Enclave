import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('messages')
@Index(['senderType', 'createdAt'])
@Index(['conversationId', 'createdAt'])
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

  @Column('text', { nullable: true })
  attachmentKind?: string | null;

  @Column('text', { nullable: true })
  attachmentPayload?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
