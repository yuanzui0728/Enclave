import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * AI 生成任务：把"长时 LLM 调用"从 HTTP 长连上解绑。
 *
 * 背景：私有/世界角色 ai-generate 调用 LLM 30~60s，公网经隧道（yinjieai.top
 * → Oray ~60s timeout）容易丢响应；用户看 503 但后端实际成功。改为 enqueue
 * 后立即返回 jobId，前端短轮询；隧道超时只会丢"轮询单跳"，不丢结果。
 *
 * scope 区分三种用法：
 *   - private_create：/my-characters/new + section='all' + persistAsDraft=true
 *     完成时额外把 merge 后的 draft 写 character_drafts（保留"AI 一键生成完
 *     入 /my-drafts"语义），character_drafts.id 回填 linkedDraftId
 *   - private_edit：编辑已有私有角色时的 ai-generate（per-section 或 all）；
 *     结果仅留在本表，前端拉到后 merge 到表单内存，不写库
 *   - world_edit：wiki 公开角色编辑器调用 /wiki/ai-generate-character-fields；
 *     行为与 private_edit 对称
 *
 * status 状态机：generating → ready | failed（无中间态）。sweeper 5 分钟扫一次，
 * 把 aiStartedAt 早于 now-5min 仍 generating 的标 failed，避免僵尸行。
 *
 * resultJson：status='ready' 时存 AiGeneratedDraft（normalize 后的增量字段）。
 * 前端 generation.done 拿到后走原 applyUpdatesFillEmptyOnly / Overwrite 逻辑。
 */
@Entity('ai_generation_jobs')
@Index(['ownerUserId', 'status'])
@Index(['status', 'aiStartedAt'])
export class AiGenerationJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  ownerUserId: string;

  @Column()
  scope: 'private_create' | 'private_edit' | 'world_edit';

  @Column({ type: 'varchar', nullable: true })
  targetCharacterId: string | null;

  @Column()
  section: 'basics' | 'core_logic' | 'chat' | 'scenes' | 'memory' | 'all';

  @Column({ default: false })
  optimize: boolean;

  // 用户提交的 currentDraft 快照（JSON 字符串）。
  // normalizeAiOutput 需要它来决定 "fill empty only" / "optimize 覆盖" 行为。
  @Column({ type: 'text' })
  currentDraftSnapshot: string;

  @Column({ default: 'generating' })
  status: 'generating' | 'ready' | 'failed';

  // AI 生成的增量字段（AiGeneratedDraft 序列化）。failed 时为 null。
  @Column({ type: 'text', nullable: true })
  resultJson: string | null;

  // scope='private_create' && section='all' && status='ready' 时，
  // 同步把 merged draft 写 character_drafts，把 id 回填这里供前端 navigate。
  @Column({ type: 'varchar', nullable: true })
  linkedDraftId: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'datetime' })
  aiStartedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
