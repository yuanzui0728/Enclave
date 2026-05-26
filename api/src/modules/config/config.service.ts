import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemConfigEntity } from './config.entity';
import { isSharedWorldMode, TenantContextStore } from '../tenancy/tenant-context';

// 「全局」配置键 = 平台/操作员级，所有用户共享同一份（per-owner 化反而会破坏功能）。
// 其余一律按 owner 隔离（用户态：定位/天气/收藏/搜索历史/提醒/摇一摇会话等——这些 per-owner
// 错标成 global 会跨用户泄漏 PII，所以默认 per-owner，只有明确的平台键进白名单）。
// 用模式匹配而非穷举，避免漏掉某个 provider_ 键导致全员 AI 断（provider 键必须全局）。
const GLOBAL_EXACT_CONFIG_KEYS = new Set<string>([
  'ai_model',
  'token_usage_platform_defaults',
  'token_pricing_catalog',
  'token_budget_config',
  'world_language',
  'world_language_changed_at',
  'need_discovery_config',
  'shake_discovery_config', // 注意：shake_discovery_sessions 是 per-owner（用户的摇一摇配额）
  'inference_multimodal_diagnostics_latest', // 平台 AI 能力诊断快照（boot 读，必须全局）
]);

function isGlobalConfigKey(key: string): boolean {
  if (key.startsWith('provider_')) return true; // 所有 LLM/TTS/转写 provider 配置
  if (key.startsWith('digital_human_')) return true; // 数字人 provider 配置
  if (key.endsWith('_rules')) return true; // *_runtime_rules + self_agent_rules（操作员策略）
  return GLOBAL_EXACT_CONFIG_KEYS.has(key);
}

@Injectable()
export class SystemConfigService {
  constructor(
    @InjectRepository(SystemConfigEntity)
    private readonly repo: Repository<SystemConfigEntity>,
  ) {}

  // 共享 world：per-owner 键用 owner 命名空间前缀做物理隔离（不同 owner = 不同行），
  // 不给 system_config 改复合主键/迁移。global 键与 LPP 都用裸 key（行为零变化）。
  // per-owner 键无租户帧即 fail-closed 抛 TENANT_CONTEXT_MISSING（绝不静默读到别人的）。
  private resolveStorageKey(key: string): string {
    if (!isSharedWorldMode()) return key;
    if (isGlobalConfigKey(key)) return key;
    return `o:${TenantContextStore.getOrThrow().ownerId}:${key}`;
  }

  async getConfig(key: string): Promise<string | null> {
    const record = await this.repo.findOne({
      where: { key: this.resolveStorageKey(key) },
    });
    return record?.value ?? null;
  }

  // 当前租户可见的全部配置（逻辑 key → value）：global 键（裸 key）+ 当前 owner 的
  // `o:<ownerId>:*` 键（剥前缀还原逻辑 key）。绝不返回别 owner 的 o:* 键。供 in-world
  // admin 的 getConfig 用。LPP：库里无 o: 前缀，原样全返（行为零变化）。
  async getAllForCurrentTenant(): Promise<Record<string, string>> {
    const entries = await this.repo.find();
    if (!isSharedWorldMode()) {
      return Object.fromEntries(entries.map((e) => [e.key, e.value]));
    }
    const ownerPrefix = `o:${TenantContextStore.getOrThrow().ownerId}:`;
    const result: Record<string, string> = {};
    for (const e of entries) {
      if (e.key.startsWith('o:')) {
        if (e.key.startsWith(ownerPrefix)) {
          result[e.key.slice(ownerPrefix.length)] = e.value;
        }
        // 别 owner 的 o:<other>:* 键：跳过（不泄漏）。
      } else {
        result[e.key] = e.value; // 裸 key = global
      }
    }
    return result;
  }

  async setConfig(key: string, value: string): Promise<void> {
    await this.repo.upsert({ key: this.resolveStorageKey(key), value }, ['key']);
  }

  async getAiModel(): Promise<string> {
    return (
      (await this.getConfig('provider_model'))?.trim() ||
      (await this.getConfig('ai_model'))?.trim() ||
      'deepseek-chat'
    );
  }

  async setAiModel(model: string): Promise<void> {
    const normalized = model.trim();
    await Promise.all([
      this.setConfig('provider_model', normalized),
      this.setConfig('ai_model', normalized),
    ]);
  }
}
