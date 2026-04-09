import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('friend_requests')
export class FriendRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'userId' })
  ownerId: string;

  @Column()
  characterId: string;

  @Column()
  characterName: string;

  @Column()
  characterAvatar: string;

  @Column({ nullable: true })
  triggerScene?: string; // e.g. 'coffee_shop', 'gym'

  @Column({ nullable: true })
  greeting?: string; // AI's opening message

  @Column({ default: 'pending' })
  status: string; // 'pending' | 'accepted' | 'declined'

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  expiresAt?: Date; // daily expiry
}
