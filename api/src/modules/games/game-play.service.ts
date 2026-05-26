// i18n-ignore-start: backend service; model-facing prompts + domain errors (not UI strings).
import { Injectable, Logger } from '@nestjs/common';
import { CharactersService } from '../characters/characters.service';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import type { AiUsageContext } from '../ai/ai.types';

export interface GamePlayCharacter {
  id: string;
  name: string;
  avatar?: string;
  personaHint?: string;
}

export interface GameAiTurnInput {
  prompt: string;
  characterId?: string;
  context?: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
  maxTokens?: number;
}

export interface GameAiTurnResult {
  text: string;
  characterId: string;
  characterName: string;
}

const MAX_TURN_TOKENS = 500;

/**
 * 「和世界里的 AI 角色一起玩」运行时：embedded_web 游戏经 postMessage 桥请求某个
 * 角色的回合回应，宿主打到 world child 的本服务，用租户自己的角色 + AiOrchestrator
 * 生成扮演式回复。角色集合由 tenant 上下文自动隔离（findAllVisibleToOwner 走 ALS）。
 */
@Injectable()
export class GamePlayService {
  private readonly logger = new Logger(GamePlayService.name);

  constructor(
    private readonly characters: CharactersService,
    private readonly orchestrator: AiOrchestratorService,
  ) {}

  /** 当前世界里可作为陪玩 NPC 的角色（裁剪投影，不漏隐私字段）。 */
  async listPlayCharacters(): Promise<GamePlayCharacter[]> {
    const all = await this.characters.findAllVisibleToOwner();
    return all.slice(0, 30).map((c) => ({
      id: c.id,
      name: c.name,
      avatar: c.avatar,
      personaHint: (c.personality || c.bio || '').slice(0, 40),
    }));
  }

  /** 让某个角色用「角色口吻」回应游戏中的一句输入。 */
  async aiTurn(input: GameAiTurnInput): Promise<GameAiTurnResult> {
    const prompt = (input.prompt ?? '').trim();
    if (!prompt) throw new Error('缺少 prompt');

    const all = await this.characters.findAllVisibleToOwner();
    if (all.length === 0) throw new Error('当前世界没有可陪玩的角色');
    const character =
      (input.characterId && all.find((c) => c.id === input.characterId)) ||
      all[0];

    const persona = (character.personality || character.bio || '').slice(0, 600);
    const system = [
      `你正在隐界的一个小游戏里扮演角色「${character.name}」与玩家一起玩。`,
      persona ? `你的人设：${persona}` : '',
      input.context ? `当前游戏局面：${input.context.slice(0, 800)}` : '',
      '要求：用第一人称、贴合角色口吻，简短自然地回应玩家这一步的输入，1-3 句即可，不要旁白、不要解释规则。',
    ]
      .filter(Boolean)
      .join('\n');

    const history = Array.isArray(input.history)
      ? input.history
          .filter(
            (m) =>
              m &&
              (m.role === 'user' || m.role === 'assistant') &&
              typeof m.content === 'string',
          )
          .slice(-8)
          .map((m) => ({ role: m.role, content: m.content.slice(0, 800) }))
      : [];

    const usageContext: AiUsageContext = {
      surface: 'app',
      scene: 'game_ai_turn',
      scopeType: 'character',
      scopeId: character.id,
      characterId: character.id,
      characterName: character.name,
    };

    const text = await this.orchestrator.generateWithMessages({
      messages: [
        { role: 'system', content: system },
        ...history,
        { role: 'user', content: prompt.slice(0, 1500) },
      ],
      usageContext,
      temperature: 0.7,
      maxTokens: Math.min(input.maxTokens ?? 300, MAX_TURN_TOKENS),
      fallback: '（这一回合我没接上话，再试一次吧）',
    });

    return {
      text: text.trim() || '……',
      characterId: character.id,
      characterName: character.name,
    };
  }
}
// i18n-ignore-end
