// i18n-ignore-start: 平台级角色行为定义，非用户可见 UI 文案。
import { Injectable, Logger } from '@nestjs/common';
import { SystemConfigService } from '../config/config.service';
import type { PersonalityProfile } from '../ai/ai.types';
import {
  CHARACTER_BEHAVIOR_BLUEPRINTS_CONFIG_KEY,
  type BlueprintAddressableCharacter,
  type CharacterBehaviorBlueprintMap,
  type CharacterBehaviorDefinition,
} from './character-behavior-blueprint.types';

// 深克隆对象/数组字段：蓝图 map 是进程内共享缓存，叠加进 profile 后下游
// （mergeScenePrompts 等）可能就地改写 → 必须克隆，否则污染缓存、跨 owner 泄漏。
function clone<T>(value: T): T {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

@Injectable()
export class CharacterBehaviorBlueprintService {
  private readonly logger = new Logger(CharacterBehaviorBlueprintService.name);
  private cache: { value: CharacterBehaviorBlueprintMap; at: number } | null =
    null;
  // 短 TTL：平台编辑后最多 TTL 秒全网生效（:4100 单进程 + PUT 写穿 ≈ 强一致）；
  // 群聊批量 buildRuntimeProfile 共享同一份缓存，不每次打 DB。
  private static readonly TTL_MS = 30_000;
  private static readonly ALLOWED_SOURCE_TYPES = new Set([
    'preset_catalog',
    'default_seed',
  ]);

  constructor(private readonly systemConfig: SystemConfigService) {}

  private async readFromStore(): Promise<CharacterBehaviorBlueprintMap> {
    const raw = await this.systemConfig.getConfig(
      CHARACTER_BEHAVIOR_BLUEPRINTS_CONFIG_KEY,
    );
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as CharacterBehaviorBlueprintMap;
      }
    } catch {
      this.logger.warn(
        `Failed to parse ${CHARACTER_BEHAVIOR_BLUEPRINTS_CONFIG_KEY}, ignoring.`,
      );
    }
    return {};
  }

  async getBlueprints(): Promise<CharacterBehaviorBlueprintMap> {
    const now = Date.now();
    if (
      this.cache &&
      now - this.cache.at < CharacterBehaviorBlueprintService.TTL_MS
    ) {
      return this.cache.value;
    }
    const value = await this.readFromStore();
    this.cache = { value, at: now };
    return value;
  }

  async getBlueprint(
    key: string | null,
  ): Promise<CharacterBehaviorDefinition | null> {
    if (!key) return null;
    const all = await this.getBlueprints();
    return all[key] ?? null;
  }

  // 单条 upsert：读 DB 最新（绕缓存，防 stale clobber）→ 合并 → 写 → 刷新缓存。
  async setBlueprint(
    key: string,
    definition: CharacterBehaviorDefinition,
  ): Promise<CharacterBehaviorDefinition> {
    const normalized = normalizeBehaviorDefinition(definition);
    const fresh = await this.readFromStore();
    const next: CharacterBehaviorBlueprintMap = { ...fresh, [key]: normalized };
    await this.systemConfig.setConfig(
      CHARACTER_BEHAVIOR_BLUEPRINTS_CONFIG_KEY,
      JSON.stringify(next),
    );
    this.cache = { value: next, at: Date.now() };
    return normalized;
  }

  async deleteBlueprint(key: string): Promise<void> {
    const fresh = await this.readFromStore();
    if (!(key in fresh)) return;
    const next = { ...fresh };
    delete next[key];
    await this.systemConfig.setConfig(
      CHARACTER_BEHAVIOR_BLUEPRINTS_CONFIG_KEY,
      JSON.stringify(next),
    );
    this.cache = { value: next, at: Date.now() };
  }

  // 蓝图键：仅预设/系统种子角色参与（私有 wiki 角色不纳入，避免跨 owner 同名被强制统一）。
  // sourceType 作命名空间前缀，防 preset 与 default_seed 同 sourceKey 撞键。
  resolveBlueprintKey(
    character: BlueprintAddressableCharacter | null | undefined,
  ): string | null {
    const sourceType = character?.sourceType;
    const sourceKey = character?.sourceKey;
    if (
      typeof sourceType !== 'string' ||
      !CharacterBehaviorBlueprintService.ALLOWED_SOURCE_TYPES.has(sourceType)
    ) {
      return null;
    }
    if (typeof sourceKey !== 'string' || !sourceKey.trim()) {
      return null;
    }
    return `${sourceType}:${sourceKey.trim()}`;
  }

  // 白名单逐字段覆盖（绝不 spread merge）；黑名单字段（memory/realWorldContext/
  // name/relationship…）不在此处理 → 保留 base，结构性杜绝误伤个性化。
  applyBlueprintBehavior(
    base: PersonalityProfile,
    def: CharacterBehaviorDefinition,
  ): PersonalityProfile {
    const result: PersonalityProfile = { ...base };
    if (def.coreLogic !== undefined) result.coreLogic = def.coreLogic;
    if (def.scenePrompts !== undefined)
      result.scenePrompts = clone(def.scenePrompts);
    if (def.expertDomains !== undefined)
      result.expertDomains = clone(def.expertDomains);
    if (def.coreDirective !== undefined) result.coreDirective = def.coreDirective;
    if (def.basePrompt !== undefined) result.basePrompt = def.basePrompt;
    if (def.systemPrompt !== undefined) result.systemPrompt = def.systemPrompt;
    if (def.identity !== undefined) result.identity = clone(def.identity);
    if (def.behavioralPatterns !== undefined)
      result.behavioralPatterns = clone(def.behavioralPatterns);
    if (def.cognitiveBoundaries !== undefined)
      result.cognitiveBoundaries = clone(def.cognitiveBoundaries);
    if (def.reasoningConfig !== undefined)
      result.reasoningConfig = clone(def.reasoningConfig);
    // traits 子字段级覆盖（蓝图只给 emotionalTone 时不清空 speechPatterns）。
    if (def.traits !== undefined) {
      const merged = { ...base.traits };
      for (const [k, v] of Object.entries(def.traits)) {
        if (v !== undefined) {
          (merged as Record<string, unknown>)[k] = Array.isArray(v)
            ? [...v]
            : v;
        }
      }
      result.traits = merged;
    }
    return result;
  }

  // 从 code-seed / 现有 profile 抽出行为字段，供平台编辑器初始值与「恢复默认」。
  extractBlueprintFromProfile(
    profile: PersonalityProfile | null | undefined,
  ): CharacterBehaviorDefinition {
    const def: CharacterBehaviorDefinition = {};
    if (!profile) return def;
    if (profile.coreLogic !== undefined) def.coreLogic = profile.coreLogic;
    if (profile.scenePrompts !== undefined)
      def.scenePrompts = clone(profile.scenePrompts);
    if (profile.expertDomains !== undefined)
      def.expertDomains = clone(profile.expertDomains);
    if (profile.coreDirective !== undefined)
      def.coreDirective = profile.coreDirective;
    if (profile.basePrompt !== undefined) def.basePrompt = profile.basePrompt;
    if (profile.systemPrompt !== undefined)
      def.systemPrompt = profile.systemPrompt;
    if (profile.identity !== undefined) def.identity = clone(profile.identity);
    if (profile.behavioralPatterns !== undefined)
      def.behavioralPatterns = clone(profile.behavioralPatterns);
    if (profile.cognitiveBoundaries !== undefined)
      def.cognitiveBoundaries = clone(profile.cognitiveBoundaries);
    if (profile.reasoningConfig !== undefined)
      def.reasoningConfig = clone(profile.reasoningConfig);
    if (profile.traits !== undefined) def.traits = clone(profile.traits);
    return def;
  }
}

// 落库前清洗：只保留白名单字段（防注入 memory 等黑名单字段进蓝图），深克隆去引用。
export function normalizeBehaviorDefinition(
  input: CharacterBehaviorDefinition | null | undefined,
): CharacterBehaviorDefinition {
  const out: CharacterBehaviorDefinition = {};
  if (!input || typeof input !== 'object') return out;
  const s = (v: unknown) => (typeof v === 'string' ? v : undefined);
  if (s(input.coreLogic) !== undefined) out.coreLogic = input.coreLogic;
  if (s(input.coreDirective) !== undefined)
    out.coreDirective = input.coreDirective;
  if (s(input.basePrompt) !== undefined) out.basePrompt = input.basePrompt;
  if (s(input.systemPrompt) !== undefined) out.systemPrompt = input.systemPrompt;
  if (input.scenePrompts && typeof input.scenePrompts === 'object')
    out.scenePrompts = clone(input.scenePrompts);
  if (Array.isArray(input.expertDomains))
    out.expertDomains = input.expertDomains.filter(
      (d): d is string => typeof d === 'string',
    );
  if (input.identity && typeof input.identity === 'object')
    out.identity = clone(input.identity);
  if (input.behavioralPatterns && typeof input.behavioralPatterns === 'object')
    out.behavioralPatterns = clone(input.behavioralPatterns);
  if (input.cognitiveBoundaries && typeof input.cognitiveBoundaries === 'object')
    out.cognitiveBoundaries = clone(input.cognitiveBoundaries);
  if (input.reasoningConfig && typeof input.reasoningConfig === 'object')
    out.reasoningConfig = clone(input.reasoningConfig);
  if (input.traits && typeof input.traits === 'object')
    out.traits = clone(input.traits);
  return out;
}
// i18n-ignore-end
