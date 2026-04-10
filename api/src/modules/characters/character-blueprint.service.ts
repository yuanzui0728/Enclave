import { randomUUID } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  CharacterBlueprintRecipeValue,
  CharacterBlueprintSourceTypeValue,
  CharacterFactorySnapshotContract,
} from './character-blueprint.types';
import { Repository } from 'typeorm';
import { DEFAULT_CHARACTER_IDS } from './default-characters';
import { CharacterBlueprintEntity } from './character-blueprint.entity';
import { CharacterBlueprintRevisionEntity } from './character-blueprint-revision.entity';
import { CharacterEntity } from './character.entity';

type RevisionChangeSource =
  | 'publish'
  | 'restore'
  | 'seed_backfill'
  | 'manual_snapshot';

function normalizeResponseLength(value: string) {
  return value === 'short' || value === 'long' || value === 'medium'
    ? value
    : 'medium';
}

function normalizeEmojiUsage(value: string) {
  return value === 'none' || value === 'frequent' || value === 'occasional'
    ? value
    : 'occasional';
}

function cloneRecipe(
  recipe: CharacterBlueprintRecipeValue,
): CharacterBlueprintRecipeValue {
  return JSON.parse(JSON.stringify(recipe)) as CharacterBlueprintRecipeValue;
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

@Injectable()
export class CharacterBlueprintService {
  constructor(
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(CharacterBlueprintEntity)
    private readonly blueprintRepo: Repository<CharacterBlueprintEntity>,
    @InjectRepository(CharacterBlueprintRevisionEntity)
    private readonly revisionRepo: Repository<CharacterBlueprintRevisionEntity>,
  ) {}

  async getFactorySnapshot(
    characterId: string,
  ): Promise<CharacterFactorySnapshotContract> {
    const blueprint = await this.ensureBlueprint(characterId);
    const character = await this.getCharacterOrThrow(characterId);
    return {
      character: this.toCharacterContract(character),
      blueprint: this.toBlueprintContract(blueprint),
      diffSummary: this.buildDiffSummary(
        blueprint.draftRecipe,
        blueprint.publishedRecipe ?? null,
      ),
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
        enableCoT:
          character.profile?.reasoningConfig?.enableCoT ?? true,
        enableReflection:
          character.profile?.reasoningConfig?.enableReflection ?? true,
        enableRouting:
          character.profile?.reasoningConfig?.enableRouting ?? true,
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
