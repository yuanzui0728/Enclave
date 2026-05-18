// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import {
  CELEBRITY_CHARACTER_PRESETS,
  type CelebrityCharacterPreset,
} from './celebrity-character-presets';
import { COMPANION_CHARACTER_PRESETS } from './companion-character-presets';
import { DATING_AIDE_CHARACTER_PRESETS } from './dating-aide-character-presets';
import { FIXED_WORLD_CHARACTER_PRESETS } from './fixed-world-character-presets';
import { INTELLIGENCE_COUNCIL_CHARACTER_PRESETS } from './intelligence-council-character-presets';
import { INTIMATE_COMPANION_CHARACTER_PRESETS } from './intimate-companion-character-presets';
import { LIFE_BUDDY_CHARACTER_PRESETS } from './life-buddy-character-presets';
import { LIFESTYLE_BUDDY_CHARACTER_PRESETS } from './lifestyle-buddy-character-presets';
import { SERVICE_EXPERT_CHARACTER_PRESETS } from './service-expert-character-presets';
import { TEACHER_CHARACTER_PRESETS } from './teacher-character-presets';

/**
 * 三层模型（2026-05-14 起的统一术语）：
 *
 * ① 居民（resident）= 这个世界里能被用户主动添加成好友的角色。
 *    住在 `characters` 表里。由两条路径塞进去：
 *      - `BUILT_IN_CHARACTER_PRESETS`（本文件，下面这个数组）：seed 时根据
 *        `autoSeed` 字段决定是否自动落库。`autoSeed: true`（默认）= 落库但
 *        `deletionPolicy: 'archive_allowed'`，不自动建 friendship；
 *        `autoSeed: false` = 不落库，目录里有，用户安装时再落。
 *      - `buildDefaultCharacters()`（default-characters.ts）：seed 时直接
 *        落库且 `deletionPolicy: 'protected'`。
 *
 * ② 默认好友（default friend）= 居民里被钉为"新 world 出厂就建好 friendship"
 *    的那一小批。住在 `friendships` 表里。由 `DEFAULT_CHARACTER_IDS` 列出，
 *    由 `social.service.ts` 的 `ensureDefaultFriendships()` 写入。
 *    它**不是一种角色，是一种关系**——同一个居民既可以是居民又可以是默认好友。
 *
 * ③ 候选好友（friend request）= 由场景匹配 / 摇一摇 / 雷达等逻辑挑出来的居民
 *    向用户发起的好友申请。住在 `friend_requests` 表，status=pending，
 *    用户同意后才写入 `friendships` 表。
 *
 * 简言之：居民是花名册，默认好友是出厂关系，候选好友是动态生成的关系。
 * 想"补充世界角色"通常指扩居民池（即扩本文件下面这个数组）。
 */
export const BUILT_IN_CHARACTER_PRESETS: CelebrityCharacterPreset[] = [
  ...FIXED_WORLD_CHARACTER_PRESETS,
  ...SERVICE_EXPERT_CHARACTER_PRESETS,
  ...TEACHER_CHARACTER_PRESETS,
  ...INTELLIGENCE_COUNCIL_CHARACTER_PRESETS,
  ...CELEBRITY_CHARACTER_PRESETS,
  ...COMPANION_CHARACTER_PRESETS,
  ...INTIMATE_COMPANION_CHARACTER_PRESETS,
  ...DATING_AIDE_CHARACTER_PRESETS,
  ...LIFESTYLE_BUDDY_CHARACTER_PRESETS,
  ...LIFE_BUDDY_CHARACTER_PRESETS,
];

export function listBuiltInCharacterPresets() {
  return BUILT_IN_CHARACTER_PRESETS;
}

export function shouldAutoSeedBuiltInCharacterPreset(
  preset: Pick<CelebrityCharacterPreset, 'autoSeed'>,
) {
  return preset.autoSeed !== false;
}

export function getBuiltInCharacterPreset(presetKey: string) {
  return BUILT_IN_CHARACTER_PRESETS.find(
    (preset) => preset.presetKey === presetKey,
  );
}
// i18n-ignore-end
