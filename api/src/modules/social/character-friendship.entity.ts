import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('character_friendships')
@Index('idx_character_friendship_pair', ['characterAId', 'characterBId'], {
  unique: true,
})
export class CharacterFriendshipEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 共享 world 多租户归属用户。注意 (characterAId, characterBId) 的 unique 索引需改成
  // 含 ownerId（否则多 owner 撞）——属迁移期 Phase 8，不在实体装饰器改（synchronize 陷阱）。
  @Column({ type: 'text', nullable: true })
  ownerId: string | null;

  @Column()
  characterAId: string;

  @Column()
  characterBId: string;

  @Column({ type: 'float', default: 0 })
  intimacy: number; // 0-100

  @Column({ default: 'friend' })
  relationshipType: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true })
  lastInteractedAt?: Date | null;
}
