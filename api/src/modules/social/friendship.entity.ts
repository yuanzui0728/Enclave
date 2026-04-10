import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('friendships')
export class FriendshipEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'userId' })
  ownerId: string;

  @Column()
  characterId: string;

  @Column({ default: 0 })
  intimacyLevel: number; // 0-100

  @Column({ default: 'friend' })
  status: string; // 'friend' | 'close' | 'best'

  @Column({ default: false })
  isStarred: boolean;

  @Column({ nullable: true })
  starredAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  lastInteractedAt?: Date;
}
