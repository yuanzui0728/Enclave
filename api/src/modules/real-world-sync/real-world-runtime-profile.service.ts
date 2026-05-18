import { Injectable } from '@nestjs/common';
import type {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  PersonalityProfile,
  SceneKey,
  ScenePrompts,
} from '../ai/ai.types';
import type { CharacterEntity } from '../characters/character.entity';
import { RealWorldSyncService } from './real-world-sync.service';

const SCENE_KEYS: SceneKey[] = [
  'chat',
  'moments_post',
  'moments_comment',
  'feed_post',
  'channel_post',
  'feed_comment',
  'greeting',
  'proactive',
];

function mergeScenePromptText(basePrompt?: string, overlayPrompt?: string) {
  const normalizedBase = basePrompt?.trim() ?? '';
  const normalizedOverlay = overlayPrompt?.trim() ?? '';

  if (!normalizedBase && !normalizedOverlay) {
    return '';
  }
  if (!normalizedBase) {
    return normalizedOverlay;
  }
  if (!normalizedOverlay) {
    return normalizedBase;
  }

  return `${normalizedBase}\n\n【今日现实补丁】\n${normalizedOverlay}`;
}

function cloneScenePrompts(
  scenePrompts?: ScenePrompts,
): ScenePrompts | undefined {
  if (!scenePrompts) {
    return undefined;
  }

  return {
    ...scenePrompts,
  };
}

function cloneProfile(profile: PersonalityProfile): PersonalityProfile {
  return {
    ...profile,
    expertDomains: [...(profile.expertDomains ?? [])],
    scenePrompts: cloneScenePrompts(profile.scenePrompts),
    traits: {
      ...profile.traits,
      speechPatterns: [...(profile.traits?.speechPatterns ?? [])],
      catchphrases: [...(profile.traits?.catchphrases ?? [])],
      topicsOfInterest: [...(profile.traits?.topicsOfInterest ?? [])],
    },
    identity: profile.identity
      ? {
          ...profile.identity,
        }
      : undefined,
    behavioralPatterns: profile.behavioralPatterns
      ? {
          ...profile.behavioralPatterns,
          taboos: [...(profile.behavioralPatterns.taboos ?? [])],
          quirks: [...(profile.behavioralPatterns.quirks ?? [])],
        }
      : undefined,
    cognitiveBoundaries: profile.cognitiveBoundaries
      ? {
          ...profile.cognitiveBoundaries,
        }
      : undefined,
    reasoningConfig: profile.reasoningConfig
      ? {
          ...profile.reasoningConfig,
        }
      : undefined,
    memory: profile.memory
      ? {
          ...profile.memory,
        }
      : undefined,
    realWorldContext: profile.realWorldContext
      ? {
          ...profile.realWorldContext,
          sceneOverlays: cloneScenePrompts(
            profile.realWorldContext.sceneOverlays,
          ),
          signalTitles: [...(profile.realWorldContext.signalTitles ?? [])],
        }
      : undefined,
  };
}

function mergeScenePrompts(
  baseScenePrompts?: ScenePrompts,
  overlayScenePrompts?: ScenePrompts,
) {
  if (!baseScenePrompts && !overlayScenePrompts) {
    return undefined;
  }

  const nextScenePrompts: ScenePrompts = {
    ...(baseScenePrompts ?? {}),
  };
  let changed = false;

  for (const sceneKey of SCENE_KEYS) {
    const mergedPrompt = mergeScenePromptText(
      baseScenePrompts?.[sceneKey],
      overlayScenePrompts?.[sceneKey],
    );
    if (!mergedPrompt) {
      continue;
    }

    nextScenePrompts[sceneKey] = mergedPrompt;
    if (mergedPrompt !== baseScenePrompts?.[sceneKey]) {
      changed = true;
    }
  }

  return changed ? nextScenePrompts : baseScenePrompts;
}

// 私有角色导入 / 历史脏数据 → DB 里可能落了 profile={}（空对象，不是 null）。
// 旧逻辑直接 cloneProfile({}) 出来一个缺 name/relationship/traits 等必填项的壳，
// 走到 prompt-builder 里渲染时 system_prompt 出来的是 "你是 undefined，与用户的关系是 undefined" ——
// AI 调用既不报错也答不出像样的话，gateway 抓到 generateReply 抛的错就把
// "对方暂时无法回复" 直接发回客户端。
//
// 这里做防御性回填：profile 空对象 / 缺关键字段时，从 character 标量列
// (name/relationship/expertDomains/personality/bio) 合成最小可用 profile，
// 保证 chat 必走通；已有 profile 的字段优先保留。
type CharacterEntityForRuntimeProfile = Pick<
  CharacterEntity,
  | 'id'
  | 'profile'
  | 'name'
  | 'relationship'
  | 'relationshipType'
  | 'expertDomains'
  | 'bio'
  | 'personality'
>;

/**
 * 用来判断一份 profile 是不是已经"够用"——name 或任意一种 prompt 文本里至少
 * 有一个非空。CharactersService.importPersonalCharacter 同名 re-import / chat
 * memory compression / runtime backfill 都按这个判定决定要不要覆盖。
 */
export function hasMeaningfulProfile(
  profile: PersonalityProfile | null | undefined,
): profile is PersonalityProfile {
  if (!profile || typeof profile !== 'object') return false;
  return Boolean(
    profile.name?.trim() ||
      profile.coreLogic?.trim() ||
      profile.basePrompt?.trim() ||
      profile.systemPrompt?.trim() ||
      profile.scenePrompts?.chat?.trim(),
  );
}

function backfillProfileFromCharacterScalars(
  profile: PersonalityProfile | undefined,
  character: CharacterEntityForRuntimeProfile,
): PersonalityProfile {
  const base = profile ?? ({} as PersonalityProfile);
  const name = base.name?.trim() || character.name?.trim() || '';
  const relationship =
    base.relationship?.trim() || character.relationship?.trim() || '';
  const expertDomains =
    base.expertDomains && base.expertDomains.length > 0
      ? [...base.expertDomains]
      : [...(character.expertDomains ?? [])];
  const personalityNote = character.personality?.trim() ?? '';
  const bioNote = character.bio?.trim() ?? '';
  const basePrompt =
    base.basePrompt?.trim() ||
    [
      name ? `你是${name}` : '',
      relationship ? `用户的${relationship}` : '',
      personalityNote ? `性格：${personalityNote}` : '',
      bioNote ? `简介：${bioNote}` : '',
    ]
      .filter(Boolean)
      .join('，') ||
    '';
  return {
    ...base,
    characterId: base.characterId ?? character.id,
    name,
    relationship,
    expertDomains,
    basePrompt,
    memorySummary: base.memorySummary ?? '',
    traits: {
      speechPatterns: base.traits?.speechPatterns ?? [],
      catchphrases: base.traits?.catchphrases ?? [],
      topicsOfInterest: base.traits?.topicsOfInterest ?? [],
      emotionalTone: base.traits?.emotionalTone ?? '自然真实',
      responseLength: base.traits?.responseLength ?? 'medium',
      emojiUsage: base.traits?.emojiUsage ?? 'occasional',
    },
  };
}

@Injectable()
export class RealWorldRuntimeProfileService {
  constructor(private readonly realWorldSync: RealWorldSyncService) {}

  async buildRuntimeProfileFromCharacter(
    character: CharacterEntityForRuntimeProfile | null | undefined,
  ): Promise<PersonalityProfile | undefined> {
    if (!character) {
      return undefined;
    }

    const rawProfile = character.profile as
      | PersonalityProfile
      | null
      | undefined;
    const baseProfile = hasMeaningfulProfile(rawProfile)
      ? cloneProfile(rawProfile)
      : backfillProfileFromCharacterScalars(
          rawProfile ? cloneProfile(rawProfile) : undefined,
          character,
        );
    const runtimeContext = await this.realWorldSync.resolveRuntimeContext(
      character.id,
    );
    if (!runtimeContext) {
      return baseProfile;
    }

    return {
      ...baseProfile,
      realWorldContext: runtimeContext,
      scenePrompts: mergeScenePrompts(
        baseProfile.scenePrompts,
        runtimeContext.sceneOverlays,
      ),
    };
  }
}
// i18n-ignore-end
