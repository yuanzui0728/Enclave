import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  CharacterBlueprintAiGenerationTraceValue,
  CharacterBlueprintRecipeValue,
  CharacterBlueprintSourceTypeValue,
  CharacterFactoryFieldSourceContract,
  CharacterFactorySnapshotContract,
} from './character-blueprint.types';
import { Repository } from 'typeorm';
import { DEFAULT_CHARACTER_IDS } from './default-characters';
import { CharacterBlueprintEntity } from './character-blueprint.entity';
import { CharacterBlueprintRevisionEntity } from './character-blueprint-revision.entity';
import { CharacterEntity } from './character.entity';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { PromptBuilderService } from '../ai/prompt-builder.service';

type RevisionChangeSource =
  | 'publish'
  | 'restore'
  | 'seed_backfill'
  | 'manual_snapshot';

type CharacterFieldMapping = {
  label: string;
  recipeField: string;
  targetField: string;
  readRecipe: (recipe: CharacterBlueprintRecipeValue) => unknown;
  readCharacter: (character: CharacterEntity) => unknown;
};

const CHARACTER_FIELD_MAPPINGS: CharacterFieldMapping[] = [
  {
    label: '名称',
    recipeField: 'identity.name',
    targetField: 'name',
    readRecipe: (recipe) => recipe.identity.name,
    readCharacter: (character) => character.name,
  },
  {
    label: '关系描述',
    recipeField: 'identity.relationship',
    targetField: 'relationship',
    readRecipe: (recipe) => recipe.identity.relationship,
    readCharacter: (character) => character.relationship,
  },
  {
    label: '关系类型',
    recipeField: 'identity.relationshipType',
    targetField: 'relationshipType',
    readRecipe: (recipe) => recipe.identity.relationshipType,
    readCharacter: (character) => character.relationshipType,
  },
  {
    label: '头像',
    recipeField: 'identity.avatar',
    targetField: 'avatar',
    readRecipe: (recipe) => recipe.identity.avatar,
    readCharacter: (character) => character.avatar,
  },
  {
    label: '简介',
    recipeField: 'identity.bio',
    targetField: 'bio',
    readRecipe: (recipe) => recipe.identity.bio,
    readCharacter: (character) => character.bio,
  },
  {
    label: '职业',
    recipeField: 'identity.occupation',
    targetField: 'profile.identity.occupation',
    readRecipe: (recipe) => recipe.identity.occupation,
    readCharacter: (character) => character.profile?.identity?.occupation ?? '',
  },
  {
    label: '背景',
    recipeField: 'identity.background',
    targetField: 'profile.identity.background',
    readRecipe: (recipe) => recipe.identity.background,
    readCharacter: (character) => character.profile?.identity?.background ?? '',
  },
  {
    label: '核心动机',
    recipeField: 'identity.motivation',
    targetField: 'profile.identity.motivation',
    readRecipe: (recipe) => recipe.identity.motivation,
    readCharacter: (character) => character.profile?.identity?.motivation ?? '',
  },
  {
    label: '世界观',
    recipeField: 'identity.worldview',
    targetField: 'profile.identity.worldview',
    readRecipe: (recipe) => recipe.identity.worldview,
    readCharacter: (character) => character.profile?.identity?.worldview ?? '',
  },
  {
    label: '擅长领域',
    recipeField: 'expertise.expertDomains',
    targetField: 'expertDomains',
    readRecipe: (recipe) => recipe.expertise.expertDomains,
    readCharacter: (character) => character.expertDomains,
  },
  {
    label: '专长描述',
    recipeField: 'expertise.expertiseDescription',
    targetField: 'profile.cognitiveBoundaries.expertiseDescription',
    readRecipe: (recipe) => recipe.expertise.expertiseDescription,
    readCharacter: (character) =>
      character.profile?.cognitiveBoundaries?.expertiseDescription ?? '',
  },
  {
    label: '知识边界',
    recipeField: 'expertise.knowledgeLimits',
    targetField: 'profile.cognitiveBoundaries.knowledgeLimits',
    readRecipe: (recipe) => recipe.expertise.knowledgeLimits,
    readCharacter: (character) =>
      character.profile?.cognitiveBoundaries?.knowledgeLimits ?? '',
  },
  {
    label: '拒绝方式',
    recipeField: 'expertise.refusalStyle',
    targetField: 'profile.cognitiveBoundaries.refusalStyle',
    readRecipe: (recipe) => recipe.expertise.refusalStyle,
    readCharacter: (character) =>
      character.profile?.cognitiveBoundaries?.refusalStyle ?? '',
  },
  {
    label: '说话习惯',
    recipeField: 'tone.speechPatterns',
    targetField: 'profile.traits.speechPatterns',
    readRecipe: (recipe) => recipe.tone.speechPatterns,
    readCharacter: (character) => character.profile?.traits?.speechPatterns ?? [],
  },
  {
    label: '口头禅',
    recipeField: 'tone.catchphrases',
    targetField: 'profile.traits.catchphrases',
    readRecipe: (recipe) => recipe.tone.catchphrases,
    readCharacter: (character) => character.profile?.traits?.catchphrases ?? [],
  },
  {
    label: '兴趣话题',
    recipeField: 'tone.topicsOfInterest',
    targetField: 'profile.traits.topicsOfInterest',
    readRecipe: (recipe) => recipe.tone.topicsOfInterest,
    readCharacter: (character) =>
      character.profile?.traits?.topicsOfInterest ?? [],
  },
  {
    label: '情绪基调',
    recipeField: 'tone.emotionalTone',
    targetField: 'profile.traits.emotionalTone',
    readRecipe: (recipe) => recipe.tone.emotionalTone,
    readCharacter: (character) => character.profile?.traits?.emotionalTone ?? '',
  },
  {
    label: '回复长度',
    recipeField: 'tone.responseLength',
    targetField: 'profile.traits.responseLength',
    readRecipe: (recipe) => recipe.tone.responseLength,
    readCharacter: (character) => character.profile?.traits?.responseLength ?? '',
  },
  {
    label: '表情使用',
    recipeField: 'tone.emojiUsage',
    targetField: 'profile.traits.emojiUsage',
    readRecipe: (recipe) => recipe.tone.emojiUsage,
    readCharacter: (character) => character.profile?.traits?.emojiUsage ?? '',
  },
  {
    label: '工作风格',
    recipeField: 'tone.workStyle',
    targetField: 'profile.behavioralPatterns.workStyle',
    readRecipe: (recipe) => recipe.tone.workStyle,
    readCharacter: (character) =>
      character.profile?.behavioralPatterns?.workStyle ?? '',
  },
  {
    label: '社交风格',
    recipeField: 'tone.socialStyle',
    targetField: 'profile.behavioralPatterns.socialStyle',
    readRecipe: (recipe) => recipe.tone.socialStyle,
    readCharacter: (character) =>
      character.profile?.behavioralPatterns?.socialStyle ?? '',
  },
  {
    label: '语言禁忌',
    recipeField: 'tone.taboos',
    targetField: 'profile.behavioralPatterns.taboos',
    readRecipe: (recipe) => recipe.tone.taboos,
    readCharacter: (character) => character.profile?.behavioralPatterns?.taboos ?? [],
  },
  {
    label: '个人癖好',
    recipeField: 'tone.quirks',
    targetField: 'profile.behavioralPatterns.quirks',
    readRecipe: (recipe) => recipe.tone.quirks,
    readCharacter: (character) => character.profile?.behavioralPatterns?.quirks ?? [],
  },
  {
    label: '基础提示词',
    recipeField: 'tone.basePrompt',
    targetField: 'profile.basePrompt',
    readRecipe: (recipe) => recipe.tone.basePrompt,
    readCharacter: (character) => character.profile?.basePrompt ?? '',
  },
  {
    label: '系统提示词',
    recipeField: 'tone.systemPrompt',
    targetField: 'profile.systemPrompt',
    readRecipe: (recipe) => recipe.tone.systemPrompt,
    readCharacter: (character) => character.profile?.systemPrompt ?? '',
  },
  {
    label: '记忆摘要',
    recipeField: 'memorySeed.memorySummary',
    targetField: 'profile.memorySummary',
    readRecipe: (recipe) => recipe.memorySeed.memorySummary,
    readCharacter: (character) => character.profile?.memorySummary ?? '',
  },
  {
    label: '核心记忆',
    recipeField: 'memorySeed.coreMemory',
    targetField: 'profile.memory.coreMemory',
    readRecipe: (recipe) => recipe.memorySeed.coreMemory,
    readCharacter: (character) => character.profile?.memory?.coreMemory ?? '',
  },
  {
    label: '近期摘要初始值',
    recipeField: 'memorySeed.recentSummarySeed',
    targetField: 'profile.memory.recentSummary',
    readRecipe: (recipe) => recipe.memorySeed.recentSummarySeed,
    readCharacter: (character) => character.profile?.memory?.recentSummary ?? '',
  },
  {
    label: '遗忘曲线',
    recipeField: 'memorySeed.forgettingCurve',
    targetField: 'profile.memory.forgettingCurve',
    readRecipe: (recipe) => recipe.memorySeed.forgettingCurve,
    readCharacter: (character) => character.profile?.memory?.forgettingCurve ?? 70,
  },
  {
    label: '启用链路推理',
    recipeField: 'reasoning.enableCoT',
    targetField: 'profile.reasoningConfig.enableCoT',
    readRecipe: (recipe) => recipe.reasoning.enableCoT,
    readCharacter: (character) =>
      character.profile?.reasoningConfig?.enableCoT ?? true,
  },
  {
    label: '启用反思',
    recipeField: 'reasoning.enableReflection',
    targetField: 'profile.reasoningConfig.enableReflection',
    readRecipe: (recipe) => recipe.reasoning.enableReflection,
    readCharacter: (character) =>
      character.profile?.reasoningConfig?.enableReflection ?? true,
  },
  {
    label: '启用路由',
    recipeField: 'reasoning.enableRouting',
    targetField: 'profile.reasoningConfig.enableRouting',
    readRecipe: (recipe) => recipe.reasoning.enableRouting,
    readCharacter: (character) =>
      character.profile?.reasoningConfig?.enableRouting ?? true,
  },
  {
    label: '活动频率',
    recipeField: 'lifeStrategy.activityFrequency',
    targetField: 'activityFrequency',
    readRecipe: (recipe) => recipe.lifeStrategy.activityFrequency,
    readCharacter: (character) => character.activityFrequency,
  },
  {
    label: '朋友圈频率',
    recipeField: 'lifeStrategy.momentsFrequency',
    targetField: 'momentsFrequency',
    readRecipe: (recipe) => recipe.lifeStrategy.momentsFrequency,
    readCharacter: (character) => character.momentsFrequency,
  },
  {
    label: '视频号频率',
    recipeField: 'lifeStrategy.feedFrequency',
    targetField: 'feedFrequency',
    readRecipe: (recipe) => recipe.lifeStrategy.feedFrequency,
    readCharacter: (character) => character.feedFrequency,
  },
  {
    label: '活跃开始小时',
    recipeField: 'lifeStrategy.activeHoursStart',
    targetField: 'activeHoursStart',
    readRecipe: (recipe) => recipe.lifeStrategy.activeHoursStart,
    readCharacter: (character) => character.activeHoursStart ?? null,
  },
  {
    label: '活跃结束小时',
    recipeField: 'lifeStrategy.activeHoursEnd',
    targetField: 'activeHoursEnd',
    readRecipe: (recipe) => recipe.lifeStrategy.activeHoursEnd,
    readCharacter: (character) => character.activeHoursEnd ?? null,
  },
  {
    label: '触发场景',
    recipeField: 'lifeStrategy.triggerScenes',
    targetField: 'triggerScenes',
    readRecipe: (recipe) => recipe.lifeStrategy.triggerScenes,
    readCharacter: (character) => character.triggerScenes ?? [],
  },
  {
    label: '模板标记',
    recipeField: 'publishMapping.isTemplate',
    targetField: 'isTemplate',
    readRecipe: (recipe) => recipe.publishMapping.isTemplate,
    readCharacter: (character) => character.isTemplate,
  },
  {
    label: '在线模式',
    recipeField: 'publishMapping.onlineModeDefault',
    targetField: 'onlineMode',
    readRecipe: (recipe) => recipe.publishMapping.onlineModeDefault,
    readCharacter: (character) => character.onlineMode ?? 'auto',
  },
  {
    label: '活动模式',
    recipeField: 'publishMapping.activityModeDefault',
    targetField: 'activityMode',
    readRecipe: (recipe) => recipe.publishMapping.activityModeDefault,
    readCharacter: (character) => character.activityMode ?? 'auto',
  },
  {
    label: '初始在线状态',
    recipeField: 'publishMapping.initialOnline',
    targetField: 'isOnline',
    readRecipe: (recipe) => recipe.publishMapping.initialOnline,
    readCharacter: (character) => character.isOnline,
  },
  {
    label: '初始活动',
    recipeField: 'publishMapping.initialActivity',
    targetField: 'currentActivity',
    readRecipe: (recipe) => recipe.publishMapping.initialActivity,
    readCharacter: (character) => character.currentActivity ?? null,
  },
];

function normalizeResponseLength(
  value: string,
): CharacterBlueprintRecipeValue['tone']['responseLength'] {
  return value === 'short' || value === 'long' || value === 'medium'
    ? value
    : 'medium';
}

function normalizeEmojiUsage(
  value: string,
): CharacterBlueprintRecipeValue['tone']['emojiUsage'] {
  return value === 'none' || value === 'frequent' || value === 'occasional'
    ? value
    : 'occasional';
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
}

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function cloneRecipe(
  recipe: CharacterBlueprintRecipeValue,
): CharacterBlueprintRecipeValue {
  const cloned = JSON.parse(JSON.stringify(recipe)) as CharacterBlueprintRecipeValue;
  return {
    ...cloned,
    reasoning: {
      enableCoT: cloned.reasoning?.enableCoT ?? true,
      enableReflection: cloned.reasoning?.enableReflection ?? true,
      enableRouting: cloned.reasoning?.enableRouting ?? true,
    },
  };
}

function cloneCharacter(
  character: CharacterEntity,
): CharacterEntity {
  return JSON.parse(JSON.stringify(character)) as CharacterEntity;
}

function deepMerge<T>(base: T, patch: Partial<T>): T {
  if (Array.isArray(base) || Array.isArray(patch)) {
    return (patch ?? base) as T;
  }

  if (
    typeof base !== 'object' ||
    base === null ||
    typeof patch !== 'object' ||
    patch === null
  ) {
    return (patch ?? base) as T;
  }

  const next: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }

    const current = next[key];
    next[key] =
      current &&
      value &&
      typeof current === 'object' &&
      typeof value === 'object' &&
      !Array.isArray(current) &&
      !Array.isArray(value)
        ? deepMerge(
            current as Record<string, unknown>,
            value as Record<string, unknown>,
          )
        : value;
  }

  return next as T;
}

function listDiffPaths(
  left: unknown,
  right: unknown,
  prefix = '',
): string[] {
  if (JSON.stringify(left) === JSON.stringify(right)) {
    return [];
  }

  const leftIsObject =
    typeof left === 'object' && left !== null && !Array.isArray(left);
  const rightIsObject =
    typeof right === 'object' && right !== null && !Array.isArray(right);

  if (!leftIsObject || !rightIsObject) {
    return [prefix || 'root'];
  }

  const keys = new Set([
    ...Object.keys(left as Record<string, unknown>),
    ...Object.keys(right as Record<string, unknown>),
  ]);

  const result: string[] = [];
  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;
    result.push(
      ...listDiffPaths(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
        path,
      ),
    );
  }

  return result;
}

function valuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function summarizeValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.length
      ? value.map((item) => String(item).trim()).filter(Boolean).join('、')
      : '未设置';
  }

  if (typeof value === 'boolean') {
    return value ? '是' : '否';
  }

  if (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && !value.trim())
  ) {
    return '未设置';
  }

  if (typeof value === 'object') {
    try {
      const serialized = JSON.stringify(value);
      if (!serialized) {
        return '复杂对象';
      }

      return serialized.length > 120
        ? `${serialized.slice(0, 117)}...`
        : serialized;
    } catch {
      return '复杂对象';
    }
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return `${value}`;
  }

  if (typeof value === 'symbol') {
    return value.description ? `Symbol(${value.description})` : 'Symbol';
  }

  if (typeof value === 'function') {
    return value.name ? `[Function ${value.name}]` : '[Function]';
  }

  return '复杂值';
}

@Injectable()
export class CharacterBlueprintService {
  constructor(
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(CharacterBlueprintEntity)
    private readonly blueprintRepo: Repository<CharacterBlueprintEntity>,
    @InjectRepository(CharacterBlueprintRevisionEntity)
    private readonly revisionRepo: Repository<CharacterBlueprintRevisionEntity>,
    private readonly ai: AiOrchestratorService,
    private readonly promptBuilder: PromptBuilderService,
  ) {}

  async getFactorySnapshot(
    characterId: string,
  ): Promise<CharacterFactorySnapshotContract> {
    const blueprint = await this.ensureBlueprint(characterId);
    const character = await this.getCharacterOrThrow(characterId);
    const draftCharacter = this.applyRecipeToCharacter(
      cloneCharacter(character),
      cloneRecipe(blueprint.draftRecipe),
    );
    const publishedCharacter = blueprint.publishedRecipe
      ? this.applyRecipeToCharacter(
          cloneCharacter(character),
          cloneRecipe(blueprint.publishedRecipe),
        )
      : null;

    return {
      character: this.toCharacterContract(character),
      blueprint: this.toBlueprintContract(blueprint),
      diffSummary: this.buildDiffSummary(
        blueprint.draftRecipe,
        blueprint.publishedRecipe ?? null,
      ),
      fieldSources: this.buildFieldSources(
        character,
        draftCharacter,
        publishedCharacter,
      ),
      publishDiff: this.buildPublishDiff(character, draftCharacter),
    };
  }

  async listRevisions(characterId: string) {
    const blueprint = await this.ensureBlueprint(characterId);
    const revisions = await this.revisionRepo.find({
      where: { blueprintId: blueprint.id },
      order: { version: 'DESC', createdAt: 'DESC' },
    });
    return revisions.map((revision) => this.toRevisionContract(revision));
  }

  async updateDraft(
    characterId: string,
    patch: Partial<CharacterBlueprintRecipeValue>,
  ): Promise<CharacterFactorySnapshotContract> {
    const blueprint = await this.ensureBlueprint(characterId);
    blueprint.draftRecipe = deepMerge(blueprint.draftRecipe, patch);
    if (!blueprint.publishedRevisionId) {
      blueprint.status = 'draft';
    }
    await this.blueprintRepo.save(blueprint);
    return this.getFactorySnapshot(characterId);
  }

  async generateDraftFromSample(
    characterId: string,
    input: { chatSample?: string | null; personName?: string | null },
  ): Promise<CharacterFactorySnapshotContract> {
    const blueprint = await this.ensureBlueprint(characterId);
    const character = await this.getCharacterOrThrow(characterId);
    const chatSample = input.chatSample?.trim();
    if (!chatSample) {
      throw new BadRequestException('Chat sample is required');
    }

    const personName =
      input.personName?.trim() ||
      blueprint.draftRecipe.identity.name.trim() ||
      character.name;
    const prompt = await this.promptBuilder.buildPersonalityExtractionPrompt(
      chatSample,
      personName,
    );
    const extractedRaw = await this.ai.extractPersonality(chatSample, personName);
    const extracted = {
      speechPatterns: normalizeStringList(extractedRaw.speechPatterns),
      catchphrases: normalizeStringList(extractedRaw.catchphrases),
      topicsOfInterest: normalizeStringList(extractedRaw.topicsOfInterest),
      emotionalTone:
        normalizeOptionalString(extractedRaw.emotionalTone) || 'grounded',
      responseLength: normalizeResponseLength(
        normalizeOptionalString(extractedRaw.responseLength),
      ),
      emojiUsage: normalizeEmojiUsage(
        normalizeOptionalString(extractedRaw.emojiUsage),
      ),
      memorySummary: normalizeOptionalString(extractedRaw.memorySummary),
    };

    const patch: Partial<CharacterBlueprintRecipeValue> = {};
    const appliedFields: string[] = [];

    if (input.personName?.trim()) {
      patch.identity = {
        ...blueprint.draftRecipe.identity,
        name: personName,
      };
      appliedFields.push('identity.name');
    }

    patch.tone = {
      ...blueprint.draftRecipe.tone,
      speechPatterns: extracted.speechPatterns.length
        ? extracted.speechPatterns
        : blueprint.draftRecipe.tone.speechPatterns,
      catchphrases: extracted.catchphrases.length
        ? extracted.catchphrases
        : blueprint.draftRecipe.tone.catchphrases,
      topicsOfInterest: extracted.topicsOfInterest.length
        ? extracted.topicsOfInterest
        : blueprint.draftRecipe.tone.topicsOfInterest,
      emotionalTone: extracted.emotionalTone,
      responseLength: extracted.responseLength,
      emojiUsage: extracted.emojiUsage,
    };

    if (extracted.speechPatterns.length) {
      appliedFields.push('tone.speechPatterns');
    }
    if (extracted.catchphrases.length) {
      appliedFields.push('tone.catchphrases');
    }
    if (extracted.topicsOfInterest.length) {
      appliedFields.push('tone.topicsOfInterest');
    }
    appliedFields.push('tone.emotionalTone');
    appliedFields.push('tone.responseLength');
    appliedFields.push('tone.emojiUsage');

    if (extracted.memorySummary) {
      patch.memorySeed = {
        ...blueprint.draftRecipe.memorySeed,
        memorySummary: extracted.memorySummary,
      };
      appliedFields.push('memorySeed.memorySummary');
    }

    blueprint.draftRecipe = deepMerge(blueprint.draftRecipe, patch);
    blueprint.lastAiGeneration = {
      requestedAt: new Date().toISOString(),
      personName,
      chatSample,
      prompt,
      extractedProfile: extracted,
      appliedFields,
    };
    if (blueprint.sourceType === 'manual_admin') {
      blueprint.sourceType = 'ai_generated';
    }

    await this.blueprintRepo.save(blueprint);
    return this.getFactorySnapshot(characterId);
  }

  async publish(characterId: string, summary?: string | null) {
    const blueprint = await this.ensureBlueprint(characterId);
    const character = await this.getCharacterOrThrow(characterId);
    const nextVersion = (blueprint.publishedVersion ?? 0) + 1;
    const publishedRecipe = cloneRecipe(blueprint.draftRecipe);
    const revision = await this.createRevision(
      blueprint,
      publishedRecipe,
      nextVersion,
      'publish',
      summary,
    );

    blueprint.publishedRecipe = cloneRecipe(publishedRecipe);
    blueprint.publishedRevisionId = revision.id;
    blueprint.publishedVersion = nextVersion;
    blueprint.status = 'published';
    await this.blueprintRepo.save(blueprint);

    await this.characterRepo.save(
      this.applyRecipeToCharacter(character, publishedRecipe),
    );

    return this.getFactorySnapshot(characterId);
  }

  async restoreRevisionToDraft(characterId: string, revisionId: string) {
    const blueprint = await this.ensureBlueprint(characterId);
    const revision = await this.revisionRepo.findOneBy({
      id: revisionId,
      blueprintId: blueprint.id,
    });
    if (!revision) {
      throw new NotFoundException(`Blueprint revision ${revisionId} not found`);
    }

    blueprint.draftRecipe = cloneRecipe(revision.recipe);
    await this.blueprintRepo.save(blueprint);
    return this.getFactorySnapshot(characterId);
  }

  private async ensureBlueprint(characterId: string) {
    const existing = await this.blueprintRepo.findOneBy({ characterId });
    if (existing) {
      return existing;
    }

    const character = await this.getCharacterOrThrow(characterId);
    const recipe = this.createRecipeFromCharacter(character);
    const sourceType: CharacterBlueprintSourceTypeValue =
      DEFAULT_CHARACTER_IDS.includes(
        character.id as (typeof DEFAULT_CHARACTER_IDS)[number],
      )
        ? 'default_seed'
        : character.sourceType === 'preset_catalog'
          ? 'preset_catalog'
        : 'manual_admin';
    const blueprint = this.blueprintRepo.create({
      id: `blueprint_${character.id}`,
      characterId: character.id,
      sourceType,
      status: 'published',
      draftRecipe: cloneRecipe(recipe),
      publishedRecipe: cloneRecipe(recipe),
      publishedVersion: 1,
    });
    await this.blueprintRepo.save(blueprint);

    const revision = await this.createRevision(
      blueprint,
      recipe,
      1,
      'seed_backfill',
      'Auto-generated from current character runtime state.',
    );
    blueprint.publishedRevisionId = revision.id;
    await this.blueprintRepo.save(blueprint);
    return blueprint;
  }

  private async getCharacterOrThrow(characterId: string) {
    const character = await this.characterRepo.findOneBy({ id: characterId });
    if (!character) {
      throw new NotFoundException(`Character ${characterId} not found`);
    }

    return character;
  }

  private async createRevision(
    blueprint: CharacterBlueprintEntity,
    recipe: CharacterBlueprintRecipeValue,
    version: number,
    changeSource: RevisionChangeSource,
    summary?: string | null,
  ) {
    const revision = this.revisionRepo.create({
      id: `blueprint_revision_${randomUUID()}`,
      blueprintId: blueprint.id,
      characterId: blueprint.characterId,
      version,
      recipe: cloneRecipe(recipe),
      summary: summary?.trim() || null,
      changeSource,
    });
    return this.revisionRepo.save(revision);
  }

  private createRecipeFromCharacter(
    character: CharacterEntity,
  ): CharacterBlueprintRecipeValue {
    return {
      identity: {
        name: character.name ?? '',
        relationship: character.relationship ?? '',
        relationshipType: character.relationshipType ?? 'custom',
        avatar: character.avatar ?? '',
        bio: character.bio ?? '',
        occupation: character.profile?.identity?.occupation ?? '',
        background: character.profile?.identity?.background ?? '',
        motivation: character.profile?.identity?.motivation ?? '',
        worldview: character.profile?.identity?.worldview ?? '',
      },
      expertise: {
        expertDomains:
          character.expertDomains?.length
            ? [...character.expertDomains]
            : ['general'],
        expertiseDescription:
          character.profile?.cognitiveBoundaries?.expertiseDescription ?? '',
        knowledgeLimits:
          character.profile?.cognitiveBoundaries?.knowledgeLimits ?? '',
        refusalStyle: character.profile?.cognitiveBoundaries?.refusalStyle ?? '',
      },
      tone: {
        speechPatterns: [...(character.profile?.traits?.speechPatterns ?? [])],
        catchphrases: [...(character.profile?.traits?.catchphrases ?? [])],
        topicsOfInterest: [
          ...(character.profile?.traits?.topicsOfInterest ?? []),
        ],
        emotionalTone: character.profile?.traits?.emotionalTone ?? 'grounded',
        responseLength: character.profile?.traits?.responseLength ?? 'medium',
        emojiUsage: character.profile?.traits?.emojiUsage ?? 'occasional',
        workStyle: character.profile?.behavioralPatterns?.workStyle ?? '',
        socialStyle: character.profile?.behavioralPatterns?.socialStyle ?? '',
        taboos: [...(character.profile?.behavioralPatterns?.taboos ?? [])],
        quirks: [...(character.profile?.behavioralPatterns?.quirks ?? [])],
        basePrompt: character.profile?.basePrompt ?? '',
        systemPrompt: character.profile?.systemPrompt ?? '',
      },
      memorySeed: {
        memorySummary: character.profile?.memorySummary ?? '',
        coreMemory: character.profile?.memory?.coreMemory ?? '',
        recentSummarySeed: character.profile?.memory?.recentSummary ?? '',
        forgettingCurve: character.profile?.memory?.forgettingCurve ?? 70,
      },
      reasoning: {
        enableCoT: character.profile?.reasoningConfig?.enableCoT ?? true,
        enableReflection:
          character.profile?.reasoningConfig?.enableReflection ?? true,
        enableRouting: character.profile?.reasoningConfig?.enableRouting ?? true,
      },
      lifeStrategy: {
        activityFrequency: character.activityFrequency ?? 'normal',
        momentsFrequency: character.momentsFrequency ?? 1,
        feedFrequency: character.feedFrequency ?? 1,
        activeHoursStart: character.activeHoursStart ?? null,
        activeHoursEnd: character.activeHoursEnd ?? null,
        triggerScenes: [...(character.triggerScenes ?? [])],
      },
      publishMapping: {
        isTemplate: character.isTemplate ?? false,
        onlineModeDefault:
          character.onlineMode === 'manual' ? 'manual' : 'auto',
        activityModeDefault:
          character.activityMode === 'manual' ? 'manual' : 'auto',
        initialOnline: character.isOnline ?? false,
        initialActivity: character.currentActivity ?? null,
      },
    };
  }

  private applyRecipeToCharacter(
    character: CharacterEntity,
    recipe: CharacterBlueprintRecipeValue,
  ): CharacterEntity {
    character.name = recipe.identity.name.trim();
    character.relationship = recipe.identity.relationship.trim();
    character.relationshipType = recipe.identity.relationshipType.trim();
    character.avatar = recipe.identity.avatar.trim();
    character.bio = recipe.identity.bio.trim();
    character.expertDomains = recipe.expertise.expertDomains.length
      ? recipe.expertise.expertDomains.map((item) => item.trim()).filter(Boolean)
      : ['general'];
    character.activityFrequency = recipe.lifeStrategy.activityFrequency.trim() || 'normal';
    character.momentsFrequency = recipe.lifeStrategy.momentsFrequency;
    character.feedFrequency = recipe.lifeStrategy.feedFrequency;
    character.activeHoursStart =
      recipe.lifeStrategy.activeHoursStart ?? undefined;
    character.activeHoursEnd = recipe.lifeStrategy.activeHoursEnd ?? undefined;
    character.triggerScenes = recipe.lifeStrategy.triggerScenes
      .map((item) => item.trim())
      .filter(Boolean);
    character.isTemplate = recipe.publishMapping.isTemplate;
    character.onlineMode = recipe.publishMapping.onlineModeDefault;
    character.activityMode = recipe.publishMapping.activityModeDefault;
    character.isOnline = recipe.publishMapping.initialOnline;
    character.currentActivity =
      recipe.publishMapping.initialActivity ?? undefined;
    character.profile = {
      ...character.profile,
      characterId: character.id,
      name: character.name,
      relationship: character.relationship,
      expertDomains: [...character.expertDomains],
      basePrompt: recipe.tone.basePrompt.trim(),
      systemPrompt: recipe.tone.systemPrompt.trim(),
      memorySummary: recipe.memorySeed.memorySummary.trim(),
      traits: {
        speechPatterns: recipe.tone.speechPatterns.map((item) => item.trim()).filter(Boolean),
        catchphrases: recipe.tone.catchphrases.map((item) => item.trim()).filter(Boolean),
        topicsOfInterest: recipe.tone.topicsOfInterest.map((item) => item.trim()).filter(Boolean),
        emotionalTone: recipe.tone.emotionalTone.trim() || 'grounded',
        responseLength: normalizeResponseLength(
          recipe.tone.responseLength.trim(),
        ),
        emojiUsage: normalizeEmojiUsage(recipe.tone.emojiUsage.trim()),
      },
      identity: {
        occupation: recipe.identity.occupation.trim(),
        background: recipe.identity.background.trim(),
        motivation: recipe.identity.motivation.trim(),
        worldview: recipe.identity.worldview.trim(),
      },
      behavioralPatterns: {
        workStyle: recipe.tone.workStyle.trim(),
        socialStyle: recipe.tone.socialStyle.trim(),
        taboos: recipe.tone.taboos.map((item) => item.trim()).filter(Boolean),
        quirks: recipe.tone.quirks.map((item) => item.trim()).filter(Boolean),
      },
      cognitiveBoundaries: {
        expertiseDescription: recipe.expertise.expertiseDescription.trim(),
        knowledgeLimits: recipe.expertise.knowledgeLimits.trim(),
        refusalStyle: recipe.expertise.refusalStyle.trim(),
      },
      reasoningConfig: {
        enableCoT: recipe.reasoning.enableCoT,
        enableReflection: recipe.reasoning.enableReflection,
        enableRouting: recipe.reasoning.enableRouting,
      },
      memory: {
        coreMemory: recipe.memorySeed.coreMemory.trim(),
        recentSummary: recipe.memorySeed.recentSummarySeed.trim(),
        forgettingCurve: Math.min(
          Math.max(Math.round(recipe.memorySeed.forgettingCurve), 0),
          100,
        ),
      },
    };

    return character;
  }

  private buildDiffSummary(
    draftRecipe: CharacterBlueprintRecipeValue,
    publishedRecipe?: CharacterBlueprintRecipeValue | null,
  ) {
    const changedFields = publishedRecipe
      ? listDiffPaths(publishedRecipe, draftRecipe)
      : ['root'];
    return {
      hasUnpublishedChanges: changedFields.length > 0,
      changedFields,
    };
  }

  private buildFieldSources(
    character: CharacterEntity,
    draftCharacter: CharacterEntity,
    publishedCharacter?: CharacterEntity | null,
  ): CharacterFactoryFieldSourceContract[] {
    return CHARACTER_FIELD_MAPPINGS.map((mapping) => {
      const runtimeValue = mapping.readCharacter(character);
      const draftValue = mapping.readCharacter(draftCharacter);
      const publishedValue = publishedCharacter
        ? mapping.readCharacter(publishedCharacter)
        : null;
      const runtimeMatchesPublished =
        publishedCharacter !== null &&
        publishedCharacter !== undefined &&
        valuesEqual(runtimeValue, publishedValue);
      const runtimeMatchesDraft = valuesEqual(runtimeValue, draftValue);

      if (!publishedCharacter) {
        return {
          label: mapping.label,
          targetField: mapping.targetField,
          recipeField: mapping.recipeField,
          status: 'draft_only' as const,
          runtimeValue: summarizeValue(runtimeValue),
          publishedValue: '未发布',
          draftValue: summarizeValue(draftValue),
          note: '当前字段仅由草稿配方定义，尚未发布到运行时。',
        };
      }

      return {
        label: mapping.label,
        targetField: mapping.targetField,
        recipeField: mapping.recipeField,
        status: runtimeMatchesPublished
          ? ('published_sync' as const)
          : ('runtime_drift' as const),
        runtimeValue: summarizeValue(runtimeValue),
        publishedValue: summarizeValue(publishedValue),
        draftValue: summarizeValue(draftValue),
        note: runtimeMatchesPublished
          ? runtimeMatchesDraft
            ? '当前运行时与已发布版本一致，草稿也保持同步。'
            : '当前运行时仍来自已发布版本，下一次发布会按草稿更新。'
          : '当前运行时已偏离上次发布结果，下一次发布会按草稿重新覆盖。',
      };
    }).sort((left, right) => {
      const weight = (value: CharacterFactoryFieldSourceContract['status']) => {
        switch (value) {
          case 'runtime_drift':
            return 0;
          case 'draft_only':
            return 1;
          default:
            return 2;
        }
      };
      return weight(left.status) - weight(right.status);
    });
  }

  private buildPublishDiff(
    character: CharacterEntity,
    draftCharacter: CharacterEntity,
  ) {
    const items = CHARACTER_FIELD_MAPPINGS.map((mapping) => {
      const currentValue = mapping.readCharacter(character);
      const nextValue = mapping.readCharacter(draftCharacter);
      return {
        label: mapping.label,
        targetField: mapping.targetField,
        recipeField: mapping.recipeField,
        changed: !valuesEqual(currentValue, nextValue),
        currentValue: summarizeValue(currentValue),
        nextValue: summarizeValue(nextValue),
      };
    }).sort((left, right) => Number(right.changed) - Number(left.changed));

    return {
      changedCount: items.filter((item) => item.changed).length,
      items,
    };
  }

  private toBlueprintContract(blueprint: CharacterBlueprintEntity) {
    return {
      id: blueprint.id,
      characterId: blueprint.characterId,
      sourceType: blueprint.sourceType as CharacterBlueprintSourceTypeValue,
      status: blueprint.status as 'draft' | 'published' | 'archived',
      draftRecipe: cloneRecipe(blueprint.draftRecipe),
      publishedRecipe: blueprint.publishedRecipe
        ? cloneRecipe(blueprint.publishedRecipe)
        : null,
      publishedRevisionId: blueprint.publishedRevisionId ?? null,
      publishedVersion: blueprint.publishedVersion ?? 0,
      lastAiGeneration: blueprint.lastAiGeneration
        ? ({ ...blueprint.lastAiGeneration } as CharacterBlueprintAiGenerationTraceValue)
        : null,
      createdAt: blueprint.createdAt.toISOString(),
      updatedAt: blueprint.updatedAt.toISOString(),
    };
  }

  private toRevisionContract(revision: CharacterBlueprintRevisionEntity) {
    return {
      id: revision.id,
      blueprintId: revision.blueprintId,
      characterId: revision.characterId,
      version: revision.version,
      recipe: cloneRecipe(revision.recipe),
      summary: revision.summary ?? null,
      changeSource: revision.changeSource as RevisionChangeSource,
      createdAt: revision.createdAt.toISOString(),
    };
  }

  private toCharacterContract(character: CharacterEntity) {
    return {
      id: character.id,
      name: character.name,
      avatar: character.avatar,
      relationship: character.relationship,
      relationshipType: character.relationshipType,
      personality: character.personality,
      bio: character.bio,
      isOnline: character.isOnline,
      onlineMode:
        character.onlineMode === 'manual'
          ? ('manual' as const)
          : ('auto' as const),
      isTemplate: character.isTemplate,
      expertDomains: [...character.expertDomains],
      profile: character.profile,
      activityFrequency: character.activityFrequency,
      momentsFrequency: character.momentsFrequency,
      feedFrequency: character.feedFrequency,
      activeHoursStart: character.activeHoursStart ?? null,
      activeHoursEnd: character.activeHoursEnd ?? null,
      triggerScenes: [...(character.triggerScenes ?? [])],
      intimacyLevel: character.intimacyLevel,
      lastActiveAt: character.lastActiveAt?.toISOString() ?? null,
      aiRelationships: character.aiRelationships ?? null,
      currentStatus: character.currentStatus ?? null,
      currentActivity: character.currentActivity ?? null,
      activityMode:
        character.activityMode === 'manual'
          ? ('manual' as const)
          : ('auto' as const),
    };
  }
}
