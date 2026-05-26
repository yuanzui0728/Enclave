import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { WikiGameArtifact } from '../wiki-game.types';

/**
 * 版本化的游戏产物，仿 CharacterRevisionEntity。每次 AI 创建 / 迭代修改 /
 * 手动保存 / 复刻都新增一条。artifact 存整份自包含 HTML + spec + 对话历史。
 *
 * 注意：artifact.html 可达几十~上百 KB，列表 / 历史查询**必须**显式 select
 * 轻量列、排除 artifact，否则列 N 条会把 N×几十KB 拉进内存。
 */
@Entity('game_revisions')
@Index(['gameId', 'version'], { unique: true })
export class GameRevisionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  gameId: string;

  /** 每个 game 单调递增，从 1 开始。 */
  @Column({ type: 'integer' })
  version: number;

  /** 上一版 revision（迭代修改 / Claude Code 回合链）。 */
  @Column({ type: 'text', nullable: true })
  parentRevisionId?: string | null;

  /** 整份 WikiGameArtifact（simple-json）。 */
  @Column({ type: 'simple-json' })
  artifact: WikiGameArtifact;

  /** 本轮的自然语言指令（初版为空）。 */
  @Column({ type: 'text', default: '' })
  instruction: string;

  /** 'ai_create' | 'ai_refine' | 'manual_edit' | 'clone' */
  @Column()
  changeSource: string;

  @Column()
  editorUserId: string;

  @CreateDateColumn()
  createdAt: Date;
}
