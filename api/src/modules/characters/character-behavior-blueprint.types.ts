// i18n-ignore-start: 平台级角色行为定义，非用户可见 UI 文案。
//
// 「平台级角色行为定义（蓝图）」的类型与字段白名单。
//
// 背景：角色是 per-owner 行（复合主键 (ownerId,id)），但同一预设角色的「行为定义」
// （底层逻辑/场景提示词/语气特征…）本应对全网用户一致。蓝图把这部分行为字段提到一个
// **全局** system_config 键（character_behavior_blueprints，已进 isGlobalConfigKey 白名单），
// 运行时在 buildRuntimeProfileFromCharacter 里叠加到 per-owner profile 之上。
//
// 命门：蓝图**只覆盖行为白名单字段**，绝不碰个性化字段（memory/intimacy/realWorldContext/
// name/relationship…）。个性化留 per-owner（CharacterEntity 标量列 + profile.memory + UserEntity）。
import type { PersonalityProfile, ScenePrompts } from '../ai/ai.types';

export const CHARACTER_BEHAVIOR_BLUEPRINTS_CONFIG_KEY =
  'character_behavior_blueprints';

/**
 * 一个角色的「行为定义」= PersonalityProfile 行为字段的可选子集。
 * 蓝图里出现的字段在运行时整字段覆盖 baseProfile 同名字段；未出现则保留 base
 * （平台可只定义 coreLogic 而不动 traits）。
 */
export interface CharacterBehaviorDefinition {
  coreLogic?: string;
  scenePrompts?: ScenePrompts;
  expertDomains?: string[];
  traits?: Partial<PersonalityProfile['traits']>;
  // 兼容期 deprecated 行为字段：蓝图覆盖 coreLogic 时一并覆盖，避免「新底层逻辑 + 旧 basePrompt」撕裂。
  coreDirective?: string;
  basePrompt?: string;
  systemPrompt?: string;
  identity?: PersonalityProfile['identity'];
  behavioralPatterns?: PersonalityProfile['behavioralPatterns'];
  cognitiveBoundaries?: PersonalityProfile['cognitiveBoundaries'];
  reasoningConfig?: PersonalityProfile['reasoningConfig'];
}

/** 蓝图全局键存的整体形态：blueprintKey → 行为定义。 */
export type CharacterBehaviorBlueprintMap = Record<
  string,
  CharacterBehaviorDefinition
>;

// 蓝图可覆盖的行为字段白名单（applyBlueprintBehavior 只按这些 key 赋值，绝不 spread merge）。
// traits 单独处理（子字段级合并），其余顶层字段整体覆盖。
export const BLUEPRINT_BEHAVIOR_FIELDS = [
  'coreLogic',
  'scenePrompts',
  'expertDomains',
  'coreDirective',
  'basePrompt',
  'systemPrompt',
  'identity',
  'behavioralPatterns',
  'cognitiveBoundaries',
  'reasoningConfig',
] as const;

// 蓝图寻址所需的 character 字段子集（避免依赖完整 CharacterEntity）。
export interface BlueprintAddressableCharacter {
  sourceType?: string | null;
  sourceKey?: string | null;
  wikiSourceCharacterId?: string | null;
}
// i18n-ignore-end
