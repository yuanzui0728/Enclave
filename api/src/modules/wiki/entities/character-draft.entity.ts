import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 角色草稿：当前用户在新建角色（私有 / wiki 公开）时点「AI 一键生成全部」后，
 * 后端把"用户已填字段 + AI 生成结果"合并成一份 PrivateCharacterDto 落到本表。
 *
 * 关键语义：草稿写入由后端在 AI 生成完成后同步执行，不依赖响应是否送达
 * 客户端 —— 用户在生成中关 tab、切走、断网都不影响草稿持久化。
 *
 * 仅 ownerUserId 自己可见；列表查询强制 WHERE ownerUserId = currentUser.id。
 *
 * 多草稿模型：每次 AI 一键生成 = 一条新行，不去重不覆盖；name 字段从 payload
 * 里 json_extract 取，无需反范式。
 */
@Entity('character_drafts')
@Index(['ownerUserId', 'updatedAt'])
export class CharacterDraftEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  ownerUserId: string;

  @Column()
  kind: 'private' | 'world';

  @Column({ type: 'text' })
  payload: string;

  @Column({ default: 'ai_one_click' })
  source: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
