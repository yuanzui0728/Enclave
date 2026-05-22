// i18n-ignore-start: backend service, errors are domain codes (no user-facing zh strings).
import { Injectable, Logger } from '@nestjs/common';
import type { CharacterBlueprintRecipeValue as CharacterBlueprintRecipe } from '../../characters/character-blueprint.types';
import { AiOrchestratorService } from '../../ai/ai-orchestrator.service';
import { WebSearchService } from '../../ai/web-search.service';
import type { AiUsageContext } from '../../ai/ai.types';
import type { PrivateCharacterDto } from './wiki-private-character.service';
import {
  CharacterDraftService,
  type DraftKind,
} from './character-draft.service';
import { AiGenerationJobService } from './ai-generation-job.service';
import {
  SECTION_KEYS,
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
    private readonly jobService: AiGenerationJobService,
    private readonly webSearch: WebSearchService,
  ) {}

  /**
   * 纯函数版：跑 LLM + normalize，返回增量 updates。无副作用（不写 draft）。
   *
   * 由 `runJobInBackground` 调度；老的同步入口已下线（controller 现在统一走
   * enqueue + job 表）。
   *
   * 2026-05-22：section='all' 改成 5 个 per-section 并行子调用 + 合并。原本是单次
   * 大调用，但 MiniMax-M2.7 是 reasoning model，completionTokens 含 reasoning，
   * 5 节合起来生成时模型会"偷懒"漏字段（线上观察：coreLogic / chat 经常空，但
   * 单独再调 chat 一次又能稳定产出）。拆成并行小调用，每个 prompt 已被验证过
   * 能独立稳定填出对应字段；总延迟 ≈ 最慢一节的延迟。
   */
  async generateForSection(input: {
    section: SectionKey;
    currentDraft: PrivateCharacterDto;
    ownerId: string;
    /**
     * 优化模式：true 时 normalizer 不再"目标为空才填"，让 AI 覆盖整节。
     * sacred 字段 (name / relationship / bio) 后端兜底，即便 optimize=true 也不返回。
     */
    optimize?: boolean;
  }): Promise<AiGeneratedDraft> {
    const { section } = input;
    if (section === 'all') {
      return this.generateAllByFanout(input);
    }
    // 单 section 路径：basics / core_logic 自取 injection。其它节 (chat / scenes /
    // memory) 跳过——它们是行为/语言风格，搜外网帮助不大、还烧配额。
    const injection = sectionWantsWebSearch(section)
      ? await this.fetchWebSearchInjection(input.currentDraft)
      : null;
    return this.runSingleSection({ ...input, section, webSearchInjection: injection });
  }

  /**
   * 取一段可插入 system prompt 的 web_search markdown。
   * 收紧的守门（2026-05-22 走查）：必须 name + bio 都齐且 bio 实质性（≥4 字），
   * 否则拿一个泛人名搜出来全是噪音、白烧配额。任何失败安静返回 null。
   */
  private async fetchWebSearchInjection(
    currentDraft: PrivateCharacterDto,
  ): Promise<string | null> {
    const name = currentDraft.name?.trim() || '';
    const bio = currentDraft.bio?.trim() || '';
    if (!name || bio.length < 4) return null;
    const query = `${name} ${bio}`.slice(0, 80);
    const injection = await this.webSearch.searchAndFormat(query);
    return injection ? injection.markdown : null;
  }

  private async runSingleSection(input: {
    section: Exclude<SectionKey, 'all'>;
    currentDraft: PrivateCharacterDto;
    ownerId: string;
    optimize?: boolean;
    /**
     * 由 caller 预先取好的 web_search markdown，避免 fan-out 模式下 basics 和
     * core_logic 各自跑一次相同 query 烧两份 web-search 配额。null 表示该节
     * 不需要 / 不该有 injection；caller 已经决定。
     */
    webSearchInjection?: string | null;
  }): Promise<AiGeneratedDraft> {
    const template = SECTION_PROMPTS[input.section];
    const vars = buildTemplateVars(input.currentDraft);
    const userPrompt = renderPromptTemplate(template.userPromptTemplate, vars);
    let combinedPrompt = `${template.systemPrompt}\n\n---\n\n${userPrompt}`;
    if (input.webSearchInjection) {
      combinedPrompt = `${combinedPrompt}\n\n${input.webSearchInjection}`;
    }

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

    return normalizeAiOutput(
      input.section,
      raw,
      input.currentDraft,
      input.optimize === true,
    );
  }

  /**
   * section='all' 的扇出：N 个子 section 并行调 LLM，合并结果。
   * 子 section 之间天然有依赖（chat/scenes/memory 想引用 coreLogic 来保持自洽），
   * 但 reasoning model 单次大调用反而经常漏 coreLogic，所以这里把"自洽性"换成
   * "可靠性"——并行调用，coreLogic 与其它 section 同时基于同一份 sacred
   * (name/bio/relationship) 生成。
   *
   * 部分失败不阻断其它节：单节抛出会被 catch、记 warn、按"该节缺失"处理；
   * mergeDrafts 容忍部分缺失，这是为了避免"N 节里 1 节超时 → 整个一键生成失败"。
   * 但若全部失败 → 抛 ALL_FANOUT_FAILED 让 runJobInBackground markFailed，
   * 否则用户会拿到一个完全空的 draft 还以为成功了。
   */
  private async generateAllByFanout(input: {
    currentDraft: PrivateCharacterDto;
    ownerId: string;
    optimize?: boolean;
  }): Promise<AiGeneratedDraft> {
    const subsections = SECTION_KEYS.filter(
      (k): k is Exclude<SectionKey, 'all'> => k !== 'all',
    );
    // web_search 在 fan-out 内只取一次：basics 和 core_logic 之前各自调一次相同
    // query，重复烧配额（每天软上限 200/天）。提前共享给两节。
    const sharedInjection = subsections.some(sectionWantsWebSearch)
      ? await this.fetchWebSearchInjection(input.currentDraft)
      : null;
    const results = await Promise.all(
      subsections.map(async (section) => {
        try {
          return await this.runSingleSection({
            section,
            currentDraft: input.currentDraft,
            ownerId: input.ownerId,
            optimize: input.optimize,
            webSearchInjection: sectionWantsWebSearch(section)
              ? sharedInjection
              : null,
          });
        } catch (err) {
          this.logger.warn(
            `all-fanout subsection=${section} failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          return {} as AiGeneratedDraft;
        }
      }),
    );
    const merged = mergeDrafts(...results);
    // 检查"产出了实质内容"而不是"没抛异常"：runSingleSection 在 LLM 返回不可
    // 解析 JSON + plain-text fallback 也抓不到 JSON 时，会安静返回 {}，successCount
    // 仍 +1 但用户实际什么都没拿到。直接检查合并后的 merged 才是真信号。
    if (!isMeaningfulDraft(merged)) {
      throw new Error('AI 一键生成全部子任务都未产出内容，请稍后重试。');
    }
    return merged;
  }

  /**
   * 后台异步执行入口。controller 在同步阶段 enqueue 完立刻返回 jobId，本方法
   * 由 `setImmediate` 调度，与 HTTP 响应解耦。任何异常都吞掉并 markFailed，
   * 不能往上抛 —— 调用栈是 setImmediate，没人接错误。
   *
   * scope='private_create' && section='all' && status='ready' 时，额外把 merge
   * 后的完整 draft 写 character_drafts（保留"AI 一键生成完入 /my-drafts"语义），
   * 把 draftId 回填到 job.linkedDraftId 给前端 navigate 用。
   */
  async runJobInBackground(jobId: string): Promise<void> {
    let job: Awaited<ReturnType<AiGenerationJobService['getByIdInternal']>>;
    try {
      job = await this.jobService.getByIdInternal(jobId);
    } catch (err) {
      this.logger.error(
        `ai-generation-job ${jobId} lookup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
    if (!job) {
      this.logger.warn(`ai-generation-job ${jobId} not found, abort background run`);
      return;
    }

    let currentDraft: PrivateCharacterDto;
    try {
      const parsed = JSON.parse(job.currentDraftSnapshot);
      currentDraft = (parsed && typeof parsed === 'object'
        ? parsed
        : { name: '' }) as PrivateCharacterDto;
    } catch (err) {
      await this.jobService.markFailed(
        jobId,
        `currentDraft 反序列化失败: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    let updates: AiGeneratedDraft;
    try {
      updates = await this.generateForSection({
        section: job.section,
        currentDraft,
        ownerId: job.ownerUserId,
        optimize: job.optimize,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `ai-generation-job ${jobId} generateForSection failed: ${message}`,
      );
      await this.jobService.markFailed(jobId, message);
      return;
    }

    let linkedDraftId: string | null = null;
    if (job.scope === 'private_create' && job.section === 'all') {
      const merged = mergeDraftWithUpdates(currentDraft, updates);
      try {
        const draftKind: DraftKind = 'private';
        const draft = await this.draftService.createFromAi(
          job.ownerUserId,
          draftKind,
          merged,
        );
        linkedDraftId = draft.id;
      } catch (err) {
        // 草稿写失败不阻断 ready —— 前端拿 updates 仍可走 merge 路径；
        // 用户损失只是"刷新后丢草稿"，相比 markFailed 更可挽回。
        this.logger.warn(
          `ai-generation-job ${jobId} persist draft failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    try {
      await this.jobService.markReady(jobId, updates, linkedDraftId);
    } catch (err) {
      this.logger.error(
        `ai-generation-job ${jobId} markReady failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
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

// section='all' 走 generateAllByFanout 拆 N 个 per-section 调用，不会进这里；
// 这里只处理单 section 的扁平 raw。
function normalizeAiOutput(
  section: Exclude<SectionKey, 'all'>,
  raw: Record<string, unknown>,
  currentDraft: PrivateCharacterDto,
  optimize: boolean,
): AiGeneratedDraft {
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
    default: {
      const _exhaustive: never = section;
      void _exhaustive;
      return {};
    }
  }
}

/**
 * 合并多个 per-section normalizer 的输出。
 *
 * 关键不变量：normalizeChat / normalizeScenes 会回填 `coreLogic: ''` 与
 * `scenePrompts.<key>: ''` 占位（满足 typescript 的 Partial<scenePrompts> 形状），
 * 浅 spread 会让空串覆盖前一节真正产出的非空值（特别是 core_logic 节生成的
 * coreLogic 会被 scenes 节占位覆写成空）。这里跟 mergeDraftWithUpdates 一样做
 * "非空才覆盖"的深合并。
 */
function mergeDrafts(...parts: AiGeneratedDraft[]): AiGeneratedDraft {
  const out: AiGeneratedDraft = {};
  const recipe: AiGeneratedDraft['recipe'] = {};
  let mergedPrompting: Record<string, unknown> | undefined;
  let mergedScenePrompts: Record<string, string> | undefined;
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
        if (!mergedPrompting) mergedPrompting = {};
        const upPr = p.recipe.prompting as Record<string, unknown>;
        for (const [k, v] of Object.entries(upPr)) {
          if (k === 'scenePrompts' && v && typeof v === 'object') {
            if (!mergedScenePrompts) mergedScenePrompts = {};
            for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
              if (typeof sv === 'string' && sv.trim()) {
                mergedScenePrompts[sk] = sv;
              }
            }
          } else if (k === 'coreLogic' && typeof v === 'string' && !v.trim()) {
            // 跳过其它 normalizer 塞的空 coreLogic 占位。
            continue;
          } else if (v !== undefined) {
            mergedPrompting[k] = v;
          }
        }
      }
      if (p.recipe.memorySeed) {
        recipe.memorySeed = {
          ...(recipe.memorySeed ?? {}),
          ...p.recipe.memorySeed,
        };
      }
    }
  }
  if (mergedPrompting) {
    if (mergedScenePrompts) {
      mergedPrompting.scenePrompts = mergedScenePrompts;
    }
    recipe.prompting =
      mergedPrompting as Partial<CharacterBlueprintRecipe['prompting']>;
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

/**
 * 只有 basics（生成职业身份 / 专长领域 / avatar）和 core_logic（生成行为准则）
 * 真正受益于"真实背景资料"——其它节 (chat / scenes / memory) 是行为/语言风格，
 * 搜外网帮助不大。封装成一个独立断言，让 generateForSection / generateAllByFanout
 * 都用同一份逻辑判断，不会两边漂移。
 */
function sectionWantsWebSearch(section: Exclude<SectionKey, 'all'>): boolean {
  return section === 'basics' || section === 'core_logic';
}

/**
 * 判断一个 AiGeneratedDraft 是否带了实质字段。
 * "没抛异常"≠"产出了东西"——LLM 返回不可解析 JSON 且 plain-text fallback
 * 也抓不到 JSON 时 normalizer 会安静返回 {}。fan-out 用这个区分真假成功。
 */
function isMeaningfulDraft(d: AiGeneratedDraft): boolean {
  if (d.relationshipType !== undefined) return true;
  if (d.expertDomains !== undefined && d.expertDomains.length > 0) return true;
  if (d.recipe && Object.keys(d.recipe).length > 0) return true;
  return false;
}

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
