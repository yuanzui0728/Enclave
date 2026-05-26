import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('messages')
@Index(['senderType', 'createdAt'])
@Index(['conversationId', 'createdAt'])
export class MessageEntity {
  @PrimaryColumn()
  id: string;

  // 共享 world 多租户归属用户（子表冗余 ownerId，经 conversationId→conversation.ownerId）。
  // LPP 为 NULL，shared 模式由 TenantRepository/subscriber 盖当前 owner。
  @Column({ type: 'text', nullable: true })
  ownerId: string | null;

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
