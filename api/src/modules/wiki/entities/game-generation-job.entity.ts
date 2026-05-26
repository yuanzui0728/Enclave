import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 游戏 AI 生成任务：把长时 LLM 调用（spec → code 两段，30~90s）从 HTTP 长连解绑，
 * 与角色的 ai_generation_jobs 同款异步设计但**独立成表**，避免和角色 job 的强类型
 * （AiGeneratedDraft / PrivateCharacterDto / SectionKey）耦合、污染线上角色生成流。
 *
 * scope：
 *   - game_create：从空白用自然语言一键造一个新游戏（建好 game_page 壳，gameId 入 input）
 *   - game_edit：对已有游戏发一条自然语言迭代指令（refine）
 *
 * status 状态机：generating → ready | failed。ready 时 resultGameId/resultRevisionId
 * 指向产物；前端据此 navigate。boot 即清 + 5 分钟 sweeper 兜孤立行（见 service）。
 */
@Entity('game_generation_jobs')
@Index(['ownerUserId', 'status'])
@Index(['status', 'startedAt'])
export class GameGenerationJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  ownerUserId: string;

  @Column()
  scope: 'game_create' | 'game_edit';

  /** 目标游戏（create 时是新建壳的 gameId，edit 时是被改的 gameId）。 */
  @Column()
  gameId: string;

  /**
   * 任务输入快照（JSON 字符串）：create 存 { prompt, title }，edit 存 { instruction }。
   */
  @Column({ type: 'text' })
  inputSnapshot: string;

  @Column({ default: 'generating' })
  status: 'generating' | 'ready' | 'failed';

  /** ready 时产物所在 revision。 */
  @Column({ type: 'text', nullable: true })
  resultRevisionId: string | null;

  @Column({ type: 'integer', nullable: true })
  resultVersion: number | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'datetime' })
  startedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
