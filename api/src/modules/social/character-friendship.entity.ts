import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { applyOwnerIdColumn } from '../tenancy/tenant-entity';

@Entity('character_friendships')
// LPP（synchronize:true）用这个 2 列 unique 索引。shared 模式（synchronize:false）下它在
// 启动时被运行时替换成含 ownerId 的 3 列版本（见 CharacterFriendshipService 的 boot 钩子），
// 否则多 owner 的同角色对会撞 unique。
@Index('idx_character_friendship_pair', ['characterAId', 'characterBId'], {
  unique: true,
})
export class CharacterFriendshipEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 共享 world 多租户归属用户。列定义按模式应用（见文件末尾）：shared 下是复合主键
  // (ownerId,id) 的一部分——模板播种的关系 id 跨租户重复，靠复合主键避免 save(loadedRow)
  // 误覆盖其他租户同 id 行；配套的 (characterAId,characterBId) unique 索引在 shared 启动时
  // 运行时改成含 ownerId 的 3 列版。LPP 为普通可空列 + 2 列 unique。
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

// 模式感知主键：shared=复合 (ownerId,id)；LPP/wiki/prep=单 id（生成 uuid）+ 普通可空列。
applyOwnerIdColumn(CharacterFriendshipEntity.prototype, 'ownerId', {
  type: 'text',
  nullable: true,
});
