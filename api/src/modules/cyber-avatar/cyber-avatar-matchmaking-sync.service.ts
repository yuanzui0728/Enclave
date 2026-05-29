import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  isSharedWorldMode,
  TenantContextStore,
} from '../tenancy/tenant-context';
import type { UserEntity } from '../auth/user.entity';

// 分身相遇撮合快照上报（world → cloud-api，UP 路径）。
//
// 复用 CloudSubscriptionClient 同款鉴权：CLOUD_API_BASE_URL + X-Service-Token
// （CLOUD_SERVICE_TOKEN），phone 显式放 body。比 token-usage 的 per-world
// callback token 更适合「一行一 owner」的撮合池——shared 模式一个进程服务多租户时，
// 按租户 fan-out（每个 owner 各推一行），phone 由 resolveOwnerPhone 按模式解析。
//
// 只做 HTTP 推送 + 鉴权 + phone 解析；快照内容（persona/tags）由 CyberAvatarService
// 构建后传进来，保持单向依赖（CyberAvatarService → 本服务），不成环。

const MAX_PERSONA_CHARS = 4000;
const MAX_TAGS = 12;
const MAX_ATTEMPTS = 3;
// 单次快照推送上限。这是个小 POST（只 upsert 一行），不该挂久；尤其 shared-world
// 单进程服务全部租户，cloud-api 故障时若无超时，每个 owner 重建都会留下 ~300s（undici
// 默认）的悬挂 fetch × 3 次重试，在同一进程里堆积。超时即当本次失败、走重试/下次重建。
const PUSH_TIMEOUT_MS = 15_000;

export type MatchmakingSnapshotInput = {
  owner: UserEntity;
  // 世界主人昵称（owner.username，朋友圈等处显示的名字）。cloud-api 撮合卡片优先用它，
  // 缺失才回退伪名池。CyberAvatarService 取好传进来。
  nickname: string | null;
  personaSummary: string;
  interestTags: string[];
  avatarVersion: number;
  signalCount: number;
  builtAt: string | null;
};

type SnapshotPayload = {
  phone: string;
  optedIn: boolean;
  nickname: string | null;
  contactField: string | null;
  contactKind: string | null;
  personaSummary: string;
  interestTags: string[];
  avatarVersion: number;
  signalCount: number;
  builtAt: string | null;
};

@Injectable()
export class CyberAvatarMatchmakingSyncService {
  private readonly logger = new Logger(CyberAvatarMatchmakingSyncService.name);

  constructor(private readonly config: ConfigService) {}

  async pushSnapshot(input: MatchmakingSnapshotInput): Promise<void> {
    const phone = this.resolveOwnerPhone(input.owner);
    const baseUrl = this.resolveCloudApiBaseUrl();
    const token = this.resolveServiceToken();
    if (!phone || !baseUrl || !token) {
      // LPP 无 CLOUD_OWNER_PHONE / 缺 base url / 缺 token：撮合功能未配，静默跳过。
      return;
    }

    const payload: SnapshotPayload = {
      phone,
      // 列默认 true；防御性地把 null/undefined 视为开启。opt-out 也要推（让 cloud-api 移出池）。
      optedIn: input.owner.encounterOptedIn !== false,
      nickname: input.nickname?.trim() ? input.nickname.trim() : null,
      contactField: input.owner.encounterContactField?.trim()
        ? input.owner.encounterContactField.trim()
        : null,
      contactKind: input.owner.encounterContactKind ?? null,
      personaSummary: (input.personaSummary ?? '').slice(0, MAX_PERSONA_CHARS),
      interestTags: (input.interestTags ?? []).slice(0, MAX_TAGS),
      avatarVersion: input.avatarVersion,
      signalCount: input.signalCount,
      builtAt: input.builtAt,
    };

    await this.postWithRetry(baseUrl, token, payload);
  }

  private resolveOwnerPhone(owner: UserEntity): string | null {
    // shared 模式：phone 来自当前请求/cron 的租户上下文；回退 owner.cloudPhone。
    // LPP / wiki 模式：沿用 spawn 时注入的 CLOUD_OWNER_PHONE。与 CloudSubscriptionClient 同口径。
    if (isSharedWorldMode()) {
      return TenantContextStore.get()?.phone ?? owner.cloudPhone ?? null;
    }
    return this.config.get<string>('CLOUD_OWNER_PHONE')?.trim() || null;
  }

  private resolveCloudApiBaseUrl(): string | null {
    return this.config.get<string>('CLOUD_API_BASE_URL')?.trim() || null;
  }

  private resolveServiceToken(): string | null {
    return this.config.get<string>('CLOUD_SERVICE_TOKEN')?.trim() || null;
  }

  private async postWithRetry(
    baseUrl: string,
    token: string,
    payload: SnapshotPayload,
  ): Promise<void> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const ok = await this.postOnce(baseUrl, token, payload);
      if (ok) {
        return;
      }
      if (attempt < MAX_ATTEMPTS) {
        await sleep(500 * 2 ** (attempt - 1));
      }
    }
    this.logger.warn(
      `Matchmaking snapshot push failed after ${MAX_ATTEMPTS} attempts (phone=${payload.phone}).`,
    );
  }

  private async postOnce(
    baseUrl: string,
    token: string,
    payload: SnapshotPayload,
  ): Promise<boolean> {
    let url: string;
    try {
      url = new URL(
        '/cloud/internal/social/matchmaking/snapshot',
        baseUrl,
      ).toString();
    } catch {
      this.logger.warn(`Invalid CLOUD_API_BASE_URL: ${baseUrl}`);
      return false;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PUSH_TIMEOUT_MS);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Token': token,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .catch((error: unknown) => {
        // 超时 abort 也落这里 → 返回 null → 当本次推送失败（postWithRetry 会重试/兜底）。
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Matchmaking snapshot push request error: ${message}`);
        return null;
      })
      .finally(() => clearTimeout(timer));

    if (!response) {
      return false;
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.warn(
        `Matchmaking snapshot push rejected with ${response.status}: ${body || 'no body'}`,
      );
      return false;
    }
    return true;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
