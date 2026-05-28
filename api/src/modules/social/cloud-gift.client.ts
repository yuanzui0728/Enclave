import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  isSharedWorldMode,
  TenantContextStore,
} from '../tenancy/tenant-context';

// AI 好友送用户礼物的礼物记录响应（与 cloud-api / @yinjie/contracts 的 GiftRecordSummary 对齐）。
// world 不依赖 @yinjie/contracts，这里本地声明仅取需要的字段。
export interface CloudGiftRecord {
  id: string;
  direction: 'user_to_character' | 'character_to_user';
  goodsCode: string;
  name: string;
  iconUrl: string | null;
  quantity: number;
}

type IssueInput = {
  characterId: string;
  characterName: string;
  characterAvatar?: string | null;
  goodsCode: string;
  quantity: number;
  message?: string;
  idempotencyKey: string;
};

// world → cloud-api 商城礼物内部接口客户端（X-Service-Token）：AI 好友送用户礼物。
// 真值（库存授予 + 礼物记录）落 cloud-api；phone 取自当前租户上下文（同 HongbaoCloudClient）。
// 这是「惊喜回礼」类 best-effort 动作：任何配置缺失 / 网络失败都只记日志返回 null，绝不抛断主流程。
@Injectable()
export class CloudGiftClient {
  private readonly logger = new Logger(CloudGiftClient.name);

  constructor(private readonly config: ConfigService) {}

  private resolveOwnerPhone(): string | null {
    if (isSharedWorldMode()) {
      return TenantContextStore.get()?.phone ?? null;
    }
    return this.config.get<string>('CLOUD_OWNER_PHONE')?.trim() || null;
  }

  async issueToUser(input: IssueInput): Promise<CloudGiftRecord | null> {
    const baseUrl = this.config.get<string>('CLOUD_API_BASE_URL')?.trim();
    const token = this.config.get<string>('CLOUD_SERVICE_TOKEN')?.trim();
    const phone = this.resolveOwnerPhone();
    if (!baseUrl || !token || !phone) {
      this.logger.warn('AI 回礼跳过：缺少云端连接配置或租户身份。');
      return null;
    }
    try {
      const url = new URL(
        '/cloud/internal/store/gifts/inbound-from-character',
        baseUrl,
      ).toString();
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Token': token,
        },
        body: JSON.stringify({ phone, ...input }),
      });
      if (!res.ok) {
        this.logger.warn(`AI 回礼失败 ${res.status}`);
        return null;
      }
      const data = (await res.json()) as { gift?: CloudGiftRecord };
      return data?.gift ?? null;
    } catch (error) {
      this.logger.warn(`AI 回礼连接失败：${(error as Error).message}`);
      return null;
    }
  }
}
