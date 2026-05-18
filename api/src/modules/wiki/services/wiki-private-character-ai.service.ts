// i18n-ignore-start: backend service, errors are domain codes (no user-facing zh strings).
import { Injectable, Logger } from '@nestjs/common';
import type { CharacterBlueprintRecipeValue as CharacterBlueprintRecipe } from '../../characters/character-blueprint.types';
import { AiOrchestratorService } from '../../ai/ai-orchestrator.service';
import type { AiUsageContext } from '../../ai/ai.types';
import type { PrivateCharacterDto } from './wiki-private-character.service';
import {
  CharacterDraftService,
  type DraftKind,
} from './character-draft.service';
import {
  SECTION_PROMPTS,
  type SectionKey,
  buildTemplateVars,
  renderPromptTemplate,
} from './wiki-private-character-ai.prompts';

const VALID_RELATIONSHIP_TYPES = new Set([
  'friend',
  'family',
  'mentor',
  'expert',
  'custom',
]);
/**
 * AI 生成的返回结构：扁平化后再交给前端。
 * 用 Partial 因为只填空字段，sacred 和已填字段不在结果里。
 *
 * 2026-05-15 重构：与 admin character-editor-page 对齐后，AI 只生成 admin 可见字段。
 * 旧字段（identity.occupation/background/motivation/worldview、expertise.{description,limits,refusal}、
 * tone.* 全部、memorySeed.{memorySummary,coreMemory,recentSummarySeed}、personality）
 * 不再返回；类型上保留嵌套 recipe 结构以便前端按 section 分发。
 */
export type AiGeneratedDraft = {
  // 顶层 DTO 字段
  relationshipType?: string;
  expertDomains?: string[];
  // 嵌套 recipe（只含 admin 编辑器读取的子字段；life / lifeStrategy 已下线）
  recipe?: {
    identity?: { avatar?: string };
    prompting?: Partial<CharacterBlueprintRecipe['prompting']>;
    memorySeed?: {
      forgettingCurve?: number;
      recentSummaryPrompt?: string;
      coreMemoryPrompt?: string;
    };
  };
};

@Injectable()
export class WikiPrivateCharacterAiService {
  private readonly logger = new Logger(WikiPrivateCharacterAiService.name);

  constructor(
    private readonly orchestrator: AiOrchestratorService,
    private readonly draftService: CharacterDraftService,
  ) {}

  async generateForSection(input: {
    section: SectionKey;
    currentDraft: PrivateCharacterDto;
    ownerId: string;
    /**
     * 优化模式：true 时 normalizer 不再"目标为空才填"，让 AI 覆盖整节。
     * sacred 字段 (name / relationship / bio) 后端兜底，即便 optimize=true 也不返回。
     */
    optimize?: boolean;
    /**
     * 仅在「新建」场景下由 controller 注入。section='all' 完成后会把
     * currentDraft 与 AI 输出合并，写入 character_drafts 表。
     *
     * 关键：写库在 await orchestrator 之后同步执行，与本次响应是否能送达
     * 客户端无关 —— 用户在生成中关 tab 也能保留草稿。
     */
    persistAsDraft?: { kind: DraftKind } | undefined;
  }): Promise<AiGeneratedDraft> {
    const template = SECTION_PROMPTS[input.section];
    const vars = buildTemplateVars(input.currentDraft);
    const userPrompt = renderPromptTemplate(template.userPromptTemplate, vars);
    const combinedPrompt = `${template.systemPrompt}\n\n---\n\n${userPrompt}`;

    const usageContext: AiUsageContext = {
      surface: 'app',
      scene: `wiki_private_character_generate_${input.section}`,
      scopeType: 'character',
      scopeLabel: input.currentDraft.name?.trim() || 'wiki-private-character',
      ownerId: input.ownerId,
    };

    let raw = await this.orchestrator.generateJsonObject({
      prompt: combinedPrompt,
      usageContext,
      temperature: template.temperature,
      maxTokens: template.maxTokens,
      fallback: template.fallback,
    });

    if (!raw || Object.keys(raw).length === 0) {
      this.logger.warn(
        `generateJsonObject returned empty for section=${input.section}; retrying via plain text + manual extraction`,
      );
      const text = await this.orchestrator.generatePlainText({
        prompt: combinedPrompt,
        usageContext,
        temperature: template.temperature,
        maxTokens: template.maxTokens,
        fallback: '',
      });
      const parsed = parseJsonAfterThink(text);
      if (parsed) raw = parsed;
    }

    const updates = normalizeAiOutput(
      input.section,
      raw,
      input.currentDraft,
      input.optimize === true,
    );

    // 创建场景下，把"用户已填 + AI 生成"merge 后落草稿。失败只 log，不影响
    // AI 结果返回 —— 用户哪怕看到错误也比丢内容强。
    if (input.persistAsDraft && input.section === 'all') {
      const merged = mergeDraftWithUpdates(input.currentDraft, updates);
      try {
        await this.draftService.createFromAi(
          input.ownerId,
          input.persistAsDraft.kind,
          merged,
        );
      } catch (err) {
        this.logger.warn(
          `failed to persist character draft for owner=${input.ownerId} kind=${input.persistAsDraft.kind}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return updates;
  }
}

/**
 * 把 AI 返回的增量字段 merge 进当前表单 draft 形成完整的 PrivateCharacterDto。
 * AiGeneratedDraft 经过 normalizer 已经只含"应该填"的字段（fill-empty-only 或
 * optimize 覆盖），所以这里只做"非 undefined 即覆盖"的浅 merge，但 recipe
 * 子树要深 merge。
 */
function mergeDraftWithUpdates(
  current: PrivateCharacterDto,
  updates: AiGeneratedDraft,
): PrivateCharacterDto {
  const out: PrivateCharacterDto = { ...current };
  if (updates.relationshipType !== undefined) {
    out.relationshipType = updates.relationshipType;
  }
  if (updates.expertDomains !== undefined) {
    out.expertDomains = updates.expertDomains;
  }
  if (updates.recipe) {
    const curRecipe = (current.recipe ?? {}) as Partial<CharacterBlueprintRecipe>;
    const nextRecipe: Record<string, unknown> = { ...curRecipe };
    if (updates.recipe.identity) {
      nextRecipe.identity = {
        ...((curRecipe.identity ?? {}) as Record<string, unknown>),
        ...updates.recipe.identity,
      };
    }
    if (updates.recipe.prompting) {
      const curPr = (curRecipe.prompting ?? {}) as Record<string, unknown>;
      const upPr = updates.recipe.prompting as Record<string, unknown>;
      const mergedPr: Record<string, unknown> = { ...curPr };
      for (const [k, v] of Object.entries(upPr)) {
        if (k === 'scenePrompts' && v && typeof v === 'object') {
          // scenePrompts 全字段 normalizer 会回填空串占位；只覆盖非空。
          const curSp = (curPr.scenePrompts ?? {}) as Record<string, string>;
          const upSp = v as Record<string, string>;
          const nextSp: Record<string, string> = { ...curSp };
          for (const [sk, sv] of Object.entries(upSp)) {
            if (typeof sv === 'string' && sv.trim()) nextSp[sk] = sv;
          }
          mergedPr.scenePrompts = nextSp;
        } else if (k === 'coreLogic' && typeof v === 'string' && !v.trim()) {
          // normalizer 在 chat / scenes 子结果里塞了空 coreLogic 占位，跳过。
          continue;
        } else if (v !== undefined) {
          mergedPr[k] = v;
        }
      }
      nextRecipe.prompting = mergedPr;
    }
    if (updates.recipe.memorySeed) {
      nextRecipe.memorySeed = {
        ...((curRecipe.memorySeed ?? {}) as Record<string, unknown>),
        ...updates.recipe.memorySeed,
      };
    }
    out.recipe = nextRecipe as unknown as CharacterBlueprintRecipe;
  }
  return out;
}

/**
 * 把模型输出里 `<think>...</think>` reasoning 块剥掉，然后抓 JSON。
 */
function parseJsonAfterThink(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const stripped = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  const lastThinkEnd = stripped.lastIndexOf('</think>');
  const body =
    lastThinkEnd >= 0 ? stripped.slice(lastThinkEnd + 8) : stripped;
  const firstBrace = body.indexOf('{');
  const lastBrace = body.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;
  const candidate = body.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// 输出归一化 + 用户已填字段过滤
// ─────────────────────────────────────────────────────────────

function normalizeAiOutput(
  section: SectionKey,
  raw: Record<string, unknown>,
  currentDraft: PrivateCharacterDto,
  optimize: boolean,
): AiGeneratedDraft {
  // 'all' 返回嵌套 section 结构，分发到对应 normalizer。
  if (section === 'all') {
    return mergeDrafts(
      normalizeBasics(asObj(raw.basics), currentDraft, optimize),
      normalizeCoreLogic(asObj(raw.core_logic), currentDraft, optimize),
      normalizeChat(asObj(raw.chat), currentDraft, optimize),
      normalizeScenes(asObj(raw.scenes), currentDraft, optimize),
      normalizeMemory(asObj(raw.memory), currentDraft, optimize),
    );
  }

  switch (section) {
    case 'basics':
      return normalizeBasics(raw, currentDraft, optimize);
    case 'core_logic':
      return normalizeCoreLogic(raw, currentDraft, optimize);
    case 'chat':
      return normalizeChat(raw, currentDraft, optimize);
    case 'scenes':
      return normalizeScenes(raw, currentDraft, optimize);
    case 'memory':
      return normalizeMemory(raw, currentDraft, optimize);
    default:
      return {};
  }
}

function asObj(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
}

function mergeDrafts(...parts: AiGeneratedDraft[]): AiGeneratedDraft {
  const out: AiGeneratedDraft = {};
  const recipe: AiGeneratedDraft['recipe'] = {};
  for (const p of parts) {
    if (p.relationshipType !== undefined) {
      out.relationshipType = p.relationshipType;
    }
    if (p.expertDomains !== undefined) out.expertDomains = p.expertDomains;
    if (p.recipe) {
      if (p.recipe.identity) {
        recipe.identity = { ...(recipe.identity ?? {}), ...p.recipe.identity };
      }
      if (p.recipe.prompting) {
        recipe.prompting = {
          ...(recipe.prompting ?? {}),
          ...p.recipe.prompting,
        };
      }
      if (p.recipe.memorySeed) {
        recipe.memorySeed = {
          ...(recipe.memorySeed ?? {}),
          ...p.recipe.memorySeed,
        };
      }
    }
  }
  if (Object.keys(recipe).length > 0) out.recipe = recipe;
  return out;
}

// ───── per-section normalizers ─────

function normalizeBasics(
  raw: Record<string, unknown>,
  current: PrivateCharacterDto,
  optimize: boolean,
): AiGeneratedDraft {
  const out: AiGeneratedDraft = {};

  // avatar：取第一个 emoji；非空且（optimize 或 current.avatar 为空）才填。
  const avatar = takeFirstEmoji(trimStr(raw.avatar));
  if (avatar && (optimize || !current.avatar?.trim())) {
    out.recipe = { identity: { avatar } };
  }

  // expertDomains：3-5 项，去重、trim。
  const expertDomains = cleanStringArray(raw.expertDomains);
  if (
    expertDomains.length > 0 &&
    (optimize || (current.expertDomains ?? []).length === 0)
  ) {
    out.expertDomains = expertDomains;
  }

  // relationshipType：枚举白名单收敛，前端决定覆盖时机。
  const relationshipType = trimStr(raw.relationshipType);
  if (relationshipType && VALID_RELATIONSHIP_TYPES.has(relationshipType)) {
    out.relationshipType = relationshipType;
  }

  return out;
}

function normalizeCoreLogic(
  raw: Record<string, unknown>,
  current: PrivateCharacterDto,
  optimize: boolean,
): AiGeneratedDraft {
  const pr: Partial<CharacterBlueprintRecipe['prompting']> = {};
  const curRecipe = (current.recipe ?? {}) as Partial<CharacterBlueprintRecipe>;
  const curPr = (curRecipe.prompting ?? {}) as Partial<
    CharacterBlueprintRecipe['prompting']
  >;

  const coreLogic = trimStr(raw.coreLogic);
  if (coreLogic && (optimize || !curPr.coreLogic?.trim())) {
    pr.coreLogic = coreLogic;
  }

  // forgettingCurve 是带默认值的数字（前端初始 70）；AI 返回则交给前端
  // applyUpdatesFillEmptyOnly 决定覆盖时机，这里只做范围 clamp。
  const forgettingCurve = clampInt(raw.forgettingCurve, 0, 100);

  const recipeOut: AiGeneratedDraft['recipe'] = {};
  if (Object.keys(pr).length > 0) recipeOut.prompting = pr;
  if (forgettingCurve !== null) {
    recipeOut.memorySeed = { forgettingCurve };
  }
  if (Object.keys(recipeOut).length === 0) return {};
  return { recipe: recipeOut };
}

function normalizeChat(
  raw: Record<string, unknown>,
  current: PrivateCharacterDto,
  optimize: boolean,
): AiGeneratedDraft {
  const curRecipe = (current.recipe ?? {}) as Partial<CharacterBlueprintRecipe>;
  const curSp = ((curRecipe.prompting ?? {}).scenePrompts ?? {}) as Partial<
    CharacterBlueprintRecipe['prompting']['scenePrompts']
  >;
  const chat = trimStr(raw.chat);
  if (!chat) return {};
  if (!optimize && curSp.chat?.trim()) return {};
  return {
    recipe: {
      prompting: {
        coreLogic: '',
        scenePrompts: {
          chat,
          moments_post: '',
          moments_comment: '',
          feed_post: '',
          channel_post: '',
          feed_comment: '',
          greeting: '',
          proactive: '',
        },
      },
    },
  };
}

function normalizeScenes(
  raw: Record<string, unknown>,
  current: PrivateCharacterDto,
  optimize: boolean,
): AiGeneratedDraft {
  const curRecipe = (current.recipe ?? {}) as Partial<CharacterBlueprintRecipe>;
  const curSp = ((curRecipe.prompting ?? {}).scenePrompts ?? {}) as Partial<
    CharacterBlueprintRecipe['prompting']['scenePrompts']
  >;
  // 7 个非 chat 场景（chat 走单独 section）
  const sceneKeys: Array<
    Exclude<
      keyof CharacterBlueprintRecipe['prompting']['scenePrompts'],
      'chat'
    >
  > = [
    'moments_post',
    'moments_comment',
    'feed_post',
    'channel_post',
    'feed_comment',
    'greeting',
    'proactive',
  ];
  const scenes: Partial<CharacterBlueprintRecipe['prompting']['scenePrompts']> =
    {};
  for (const k of sceneKeys) {
    const v = trimStr(raw[k]);
    if (v && (optimize || !curSp[k]?.trim())) scenes[k] = v;
  }
  if (Object.keys(scenes).length === 0) return {};
  return {
    recipe: {
      prompting: {
        coreLogic: '',
        scenePrompts: {
          chat: '',
          moments_post: '',
          moments_comment: '',
          feed_post: '',
          channel_post: '',
          feed_comment: '',
          greeting: '',
          proactive: '',
          ...scenes,
        },
      },
    },
  };
}

function normalizeMemory(
  raw: Record<string, unknown>,
  current: PrivateCharacterDto,
  optimize: boolean,
): AiGeneratedDraft {
  const curRecipe = (current.recipe ?? {}) as Partial<CharacterBlueprintRecipe>;
  const curMs = (curRecipe.memorySeed ?? {}) as Partial<
    CharacterBlueprintRecipe['memorySeed']
  >;
  const ms: { recentSummaryPrompt?: string; coreMemoryPrompt?: string } = {};
  const recentSummaryPrompt = trimStr(raw.recentSummaryPrompt);
  if (recentSummaryPrompt && (optimize || !curMs.recentSummaryPrompt?.trim())) {
    ms.recentSummaryPrompt = recentSummaryPrompt;
  }
  const coreMemoryPrompt = trimStr(raw.coreMemoryPrompt);
  if (coreMemoryPrompt && (optimize || !curMs.coreMemoryPrompt?.trim())) {
    ms.coreMemoryPrompt = coreMemoryPrompt;
  }
  if (Object.keys(ms).length === 0) return {};
  return { recipe: { memorySeed: ms } };
}

// normalizeLife removed 2026-05-15 along with the wiki life section.

// ───── helpers ─────

function trimStr(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 从字符串里抓第一个 emoji。AI 偶尔会输出 "🪷 心理咨询师" 这样的混合串。
 */
function takeFirstEmoji(s: string | null): string | null {
  if (!s) return null;
  const match = s.match(
    /\p{Extended_Pictographic}️?(‍\p{Extended_Pictographic}️?)*/u,
  );
  if (match) return match[0];
  return s;
}

function cleanStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of v) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function clampInt(v: unknown, min: number, max: number): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Math.max(min, Math.min(max, Math.round(v)));
  }
  if (typeof v === 'string' && v.trim()) {
    const n = Number.parseInt(v, 10);
    if (Number.isFinite(n)) return Math.max(min, Math.min(max, n));
  }
  return null;
}

// i18n-ignore-end
