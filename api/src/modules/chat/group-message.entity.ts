import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('group_messages')
@Index(['senderType', 'createdAt'])
@Index(['groupId', 'createdAt'])
export class GroupMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  groupId: string;

  @Column()
  senderId: string;

  @Column({ default: 'character' })
  senderType: string; // 'user' | 'character'

  @Column()
  senderName: string;

  @Column({ nullable: true })
  senderAvatar?: string;

  @Column('text')
  text: string;

  @Column({ default: 'text' })
  type: string; // 'text' | 'system'

  @Column('text', { nullable: true })
  attachmentKind?: string | null;

  @Column('text', { nullable: true })
  attachmentPayload?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
