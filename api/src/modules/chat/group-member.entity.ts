import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

// 走查第三批 R1：getMembers(groupId) / addMember 的去重 findOne / removeMember
// 都用 (groupId, memberId) 当 WHERE 走，原 entity 只有 PK 索引（sqlite_autoindex
// _group_members_1），每次 hot path 都是 O(n) 扫表。打开群详情、@提及候选、
// 成员 picker 都吃这条；50+ 人的群和反复打开/关闭群详情把这条放大成微秒级
// 抖动。补普通 @Index 让 SQLite 直查；不是 unique（memory: entity 级 unique
// 索引是陷阱，synchronize 早于 onModuleInit），重复行兼容旧库。
@Entity('group_members')
@Index(['groupId', 'memberId'])
@Index(['groupId', 'memberType'])
export class GroupMemberEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  groupId: string;

  @Column()
  memberId: string;

  @Column({ default: 'character' })
  memberType: string; // 'user' | 'character'

  @Column({ nullable: true })
  memberName?: string;

  @Column({ nullable: true })
  memberAvatar?: string;

  @Column({ default: 'member' })
  role: string; // 'owner' | 'member'

  @CreateDateColumn()
  joinedAt: Date;
}
