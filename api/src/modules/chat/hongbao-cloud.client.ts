import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppError } from '../../common/app-error.exception';
import {
  isSharedWorldMode,
  TenantContextStore,
} from '../tenancy/tenant-context';

// 红包账本响应类型（与 cloud-api / @yinjie/contracts 的 Hongbao* 契约对齐）。
// world 不依赖 @yinjie/contracts，这里本地声明，仅取 world 侧需要的字段。
export interface HongbaoSummary {
  id: string;
  userId: string;
  direction: 'outgoing' | 'incoming';
  status: 'pending' | 'claimed' | 'refunded' | 'expired';
  source: 'wallet' | 'system';
  counterpartyCharacterId: string;
  counterpartyCharacterName: string;
  conversationId: string;
  amountCents: number;
  currency: string;
  message: string;
  expiresAt: string;
  createdAt: string;
  settledAt: string | null;
}
export interface HongbaoSendResponse {
  hongbao: HongbaoSummary;
  balanceCents: number;
}
export interface HongbaoIssueResponse {
  hongbao: HongbaoSummary;
}
export interface HongbaoClaimResponse {
  hongbao: HongbaoSummary;
  balanceCents: number | null;
}
export interface HongbaoSweepResponse {
  refundedOutgoing: number;
  expiredIncoming: number;
}

type SendInput = {
  conversationId: string;
  counterpartyCharacterId: string;
  counterpartyCharacterName: string;
  amountCents: number;
  message: string;
};

// world → cloud-api 红包内部接口客户端（X-Service-Token）。账本真值在 cloud-api，
// phone 取自当前请求/cron 的租户上下文（同 CloudSubscriptionClient 套路）。
@Injectable()
export class HongbaoCloudClient {
  private readonly logger = new Logger(HongbaoCloudClient.name);

  constructor(private readonly config: ConfigService) {}

  private resolveOwnerPhone(): string | null {
    if (isSharedWorldMode()) {
      return TenantContextStore.get()?.phone ?? null;
    }
    return this.config.get<string>('CLOUD_OWNER_PHONE')?.trim() || null;
  }

  private resolveBaseUrl(): string | null {
    return this.config.get<string>('CLOUD_API_BASE_URL')?.trim() || null;
  }

  private resolveServiceToken(): string | null {
    return this.config.get<string>('CLOUD_SERVICE_TOKEN')?.trim() || null;
  }

  private requireConfig(): { baseUrl: string; token: string; phone: string } {
    const baseUrl = this.resolveBaseUrl();
    const token = this.resolveServiceToken();
    const phone = this.resolveOwnerPhone();
    if (!baseUrl || !token) {
      throw new AppError('HONGBAO_CLOUD_UNCONFIGURED', {
        status: 503,
        legacyMessage: '红包服务暂未配置（缺少云端钱包连接）。',
      });
    }
    if (!phone) {
      throw new AppError('HONGBAO_CLOUD_NO_TENANT', {
        status: 400,
        legacyMessage: '无法确认当前用户身份，红包暂时不可用。',
      });
    }
    return { baseUrl, token, phone };
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const { baseUrl, token } = this.requireConfig();
    const url = new URL(path, baseUrl).toString();
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Token': token,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      this.logger.warn(`Hongbao cloud call failed: ${(error as Error).message}`);
      throw new AppError('HONGBAO_CLOUD_UNREACHABLE', {
        status: 503,
        legacyMessage: '红包服务暂时不可用，请稍后再试。',
      });
    }
    if (!res.ok) {
      const detail = await this.extractErrorMessage(res);
      // 余额不足让前端能识别去充值；其余按通用失败。
      const insufficient = detail?.includes('余额不足');
      throw new AppError(
        insufficient ? 'HONGBAO_INSUFFICIENT_BALANCE' : 'HONGBAO_SEND_FAILED',
        {
          status: insufficient ? 400 : res.status,
          legacyMessage: detail || '红包操作失败，请稍后再试。',
        },
      );
    }
    return (await res.json()) as T;
  }

  private async extractErrorMessage(res: Response): Promise<string | null> {
    try {
      const data = (await res.json()) as { message?: unknown };
      if (typeof data?.message === 'string') return data.message;
      if (Array.isArray(data?.message)) return data.message.join('；');
      return null;
    } catch {
      return null;
    }
  }

  async send(input: SendInput): Promise<HongbaoSendResponse> {
    const { phone } = this.requireConfig();
    return this.post<HongbaoSendResponse>('/cloud/internal/wallet/hongbao/send', {
      phone,
      ...input,
    });
  }

  async issue(input: SendInput): Promise<HongbaoIssueResponse> {
    const { phone } = this.requireConfig();
    return this.post<HongbaoIssueResponse>(
      '/cloud/internal/wallet/hongbao/issue',
      { phone, ...input },
    );
  }

  async claim(input: {
    hongbaoId: string;
    by: 'user' | 'character';
  }): Promise<HongbaoClaimResponse> {
    const { phone } = this.requireConfig();
    return this.post<HongbaoClaimResponse>(
      `/cloud/internal/wallet/hongbao/${encodeURIComponent(input.hongbaoId)}/claim`,
      { phone, by: input.by },
    );
  }

  async sweepExpired(): Promise<HongbaoSweepResponse> {
    // sweep 是全局操作，不需要 tenant phone；仅需 baseUrl + token。
    const baseUrl = this.resolveBaseUrl();
    const token = this.resolveServiceToken();
    if (!baseUrl || !token) {
      throw new AppError('HONGBAO_CLOUD_UNCONFIGURED', {
        status: 503,
        legacyMessage: '红包服务暂未配置。',
      });
    }
    const url = new URL(
      '/cloud/internal/wallet/hongbao/sweep-expired',
      baseUrl,
    ).toString();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'X-Service-Token': token },
    });
    if (!res.ok) {
      throw new AppError('HONGBAO_SWEEP_FAILED', {
        status: res.status,
        legacyMessage: '红包过期清扫失败。',
      });
    }
    return (await res.json()) as HongbaoSweepResponse;
  }
}
