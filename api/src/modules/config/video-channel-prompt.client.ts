// i18n-ignore-start: backend prompt template defaults — fed to MiniMax, not user-facing UI.
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const VIDEO_CHANNEL_PROMPT_CONFIG_KEY = 'video_channel_prompt';

export interface VideoChannelPromptConfig {
  // 主模板，可用占位符 {characterName} / {persona} / {scene}
  promptTemplate: string;
  // 角色定位片段模板（relationship 非空时拼入），占位符 {relationship}
  personaTemplate: string;
  // 用户未填画面描述时的兜底主题
  fallbackScene: string;
}

// 默认值 = 迁移前 composeChannelVideoPrompt / composeCharacterVideoPrompt 的硬编码字符串，
// 保证零配置（cloud-api 不可达 / 键未设置）时输出与旧实现逐字节一致。
// 模板里「9:16 / 6 秒」仅是给 MiniMax 的文字描述：真实分辨率由 resolution:'768P' 决定、
// 版式比例由 CHANNEL_VIDEO_ASPECT_RATIO=9/16 决定，改这段文字不会改实际视频尺寸。
export const DEFAULT_VIDEO_CHANNEL_PROMPT: VideoChannelPromptConfig = {
  promptTemplate:
    '{characterName} 的视频号短片，9:16 竖屏，6 秒。 {persona}画面主题：{scene}。 风格：电影感、低饱和、柔和光线、轻微镜头运动。',
  personaTemplate: '角色定位：{relationship}。',
  fallbackScene: '城市夜景慢镜头，空气中带着 AI 隐界的氛围',
};

const CACHE_TTL_MS = 60 * 1000;
const PERSONA_MAX = 120;
const SCENE_MAX = 300;

/** 全局字面量替换（用函数替换器，规避 relationship/scene 含 `$` 被当成替换模式）。 */
function fill(template: string, token: string, value: string): string {
  return template.replaceAll(token, () => value);
}

/**
 * 纯函数：按配置拼出视频号生成提示词。无配置时传 DEFAULT_VIDEO_CHANNEL_PROMPT
 * 即复现旧 composeChannelVideoPrompt 的逐字节输出（含分段空格）。
 */
export function renderVideoChannelPrompt(
  config: VideoChannelPromptConfig,
  characterName: string,
  relationship: string | null | undefined,
  text: string | null | undefined,
): string {
  const rawRel = relationship ?? '';
  // 与旧实现一致：truthy 判定用 trim()，截断 slice 用原始值
  const persona = rawRel.trim()
    ? `${fill(config.personaTemplate, '{relationship}', rawRel.slice(0, PERSONA_MAX))} `
    : '';
  const scene =
    (text ?? '').replace(/\s+/g, ' ').trim().slice(0, SCENE_MAX) ||
    config.fallbackScene;
  let out = fill(config.promptTemplate, '{characterName}', characterName);
  out = fill(out, '{persona}', persona);
  out = fill(out, '{scene}', scene);
  return out;
}

function normalizeConfig(value: unknown): VideoChannelPromptConfig | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const pick = (key: keyof VideoChannelPromptConfig): string => {
    const candidate = v[key];
    return typeof candidate === 'string' && candidate.trim()
      ? candidate
      : DEFAULT_VIDEO_CHANNEL_PROMPT[key];
  };
  return {
    promptTemplate: pick('promptTemplate'),
    personaTemplate: pick('personaTemplate'),
    fallbackScene: pick('fallbackScene'),
  };
}

/**
 * 视频号生成提示词模板拉取 + 拼装。模板存 cloud-api 的 cloud_configs（运营在
 * cloud-console 编辑），本 client 带 60s 进程内缓存，失败/缺省回落内置默认。
 * 复用 CloudSubscriptionClient 同款鉴权：CLOUD_API_BASE_URL + X-Service-Token。
 */
@Injectable()
export class VideoChannelPromptClient {
  private readonly logger = new Logger(VideoChannelPromptClient.name);
  private cache: { value: VideoChannelPromptConfig; expiresAt: number } | null =
    null;

  constructor(private readonly config: ConfigService) {}

  async composeVideoChannelPrompt(
    characterName: string,
    relationship: string | null | undefined,
    text: string | null | undefined,
  ): Promise<string> {
    const resolved = await this.loadConfig();
    return renderVideoChannelPrompt(resolved, characterName, relationship, text);
  }

  private async loadConfig(): Promise<VideoChannelPromptConfig> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.value;
    }
    const remote = await this.fetchRemote();
    const value = remote ?? DEFAULT_VIDEO_CHANNEL_PROMPT;
    this.cache = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  }

  private async fetchRemote(): Promise<VideoChannelPromptConfig | null> {
    const baseUrl = this.config.get<string>('CLOUD_API_BASE_URL')?.trim();
    const token = this.config.get<string>('CLOUD_SERVICE_TOKEN')?.trim();
    if (!baseUrl || !token) {
      return null;
    }
    try {
      const url = new URL(
        `/cloud/internal/configs/${VIDEO_CHANNEL_PROMPT_CONFIG_KEY}`,
        baseUrl,
      ).toString();
      const res = await fetch(url, {
        headers: { 'X-Service-Token': token },
      });
      if (!res.ok) {
        this.logger.warn(
          `video-channel-prompt config fetch HTTP ${res.status}, using default`,
        );
        return null;
      }
      const body = (await res.json().catch(() => null)) as {
        value?: unknown;
      } | null;
      return normalizeConfig(body?.value);
    } catch (err) {
      this.logger.warn(
        `video-channel-prompt config fetch error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
}
// i18n-ignore-end
