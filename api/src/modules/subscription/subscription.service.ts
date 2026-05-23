// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import { Injectable, Logger } from '@nestjs/common';
import {
  CloudSubscriptionClient,
  type CloudSubscriptionLookup,
} from './cloud-subscription.client';
import {
  SubscriptionExpiredException,
  type SubscriptionExpiredMeta,
} from './subscription-expired.exception';

const CACHE_TTL_MS = 60 * 1000;

const FALLBACK_COPY: SubscriptionExpiredMeta['copy'] = {
  expiredTitle: '会员已到期',
  expiredMessage: '你的隐界会员已到期，AI 能力暂时无法使用。',
  expiredCta: '立即续费',
  expiredHint: '你仍可查看历史记录，AI 功能恢复需要会员',
  checkoutManualHint: '请联系运营开通会员，开通后将自动到账',
  checkoutContactInfo: '',
  inviteShareTitle: '快来加入隐界，免费体验 AI 社交世界',
  inviteShareBody: '使用我的邀请码注册，我们都能获得 30 天会员奖励。',
  welcomePromoBanner: null,
};

// 保守 BLOCK 分支用——cloud-api 暂时不可达 + 本地无 cache 时，避免用"会员已到期"误导
// (实际不是真过期，是网络问题；plans 也为空，用户点续费无内容)。
// expiredCta 故意不用"重试" —— dialog 主按钮 navigate target 是 /profile/subscription
// (subscription-expired-dialog-host.tsx hardcode)，"重试"语义会让用户期望它真的
// 重试网络但实际跳订阅页错位。"我知道了" + 用户下次操作自然重试。
const NETWORK_FALLBACK_COPY: SubscriptionExpiredMeta['copy'] = {
  expiredTitle: '网络异常',
  expiredMessage: '暂时无法验证会员状态，AI 功能稍后再试。',
  expiredCta: '我知道了',
  expiredHint: '请检查网络后稍后再试',
  checkoutManualHint: '',
  checkoutContactInfo: '',
  inviteShareTitle: '',
  inviteShareBody: '',
  welcomePromoBanner: null,
};

const FALLBACK_LOOKUP: CloudSubscriptionLookup = {
  status: 'active',
  expiresAt: null,
  planCode: null,
  isTrial: false,
  hardBlockEnabled: false,
  copy: FALLBACK_COPY,
  plans: [],
};

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);
  private cached: { value: CloudSubscriptionLookup; expiresAt: number } | null = null;

  constructor(private readonly cloudClient: CloudSubscriptionClient) {}

  async getStatus(): Promise<CloudSubscriptionLookup> {
    const phone = this.cloudClient.resolveOwnerPhone();
    if (!phone) {
      // 本地直连或未托管模式：放行
      return FALLBACK_LOOKUP;
    }
    const now = Date.now();
    if (this.cached && this.cached.expiresAt > now) {
      return this.cached.value;
    }
    const fresh = await this.cloudClient.lookup(phone);
    if (!fresh) {
      // 拉取失败 30 秒短缓存。有上次 cache 就沿用（含 hardBlockEnabled，让 active 用户
      // 在 cloud-api 抖动期间不受影响）；没 cache 时保守拒绝（防止 expired 用户利用
      // cloud-api 失联绕过会员校验）。
      const fallback: CloudSubscriptionLookup = this.cached?.value
        ? this.cached.value
        : { ...FALLBACK_LOOKUP, status: 'expired', hardBlockEnabled: true, copy: NETWORK_FALLBACK_COPY };
      this.cached = { value: fallback, expiresAt: now + 30 * 1000 };
      return fallback;
    }
    this.cached = { value: fresh, expiresAt: now + CACHE_TTL_MS };
    return fresh;
  }

  async assertCanUseAi(_feature: 'text' | 'image' | 'audio'): Promise<void> {
    const status = await this.getStatus();
    if (!status.hardBlockEnabled) {
      return;
    }
    if (status.status === 'active') {
      return;
    }
    const meta: SubscriptionExpiredMeta = {
      expiredAt: status.expiresAt,
      plans: status.plans,
      copy: status.copy,
      ctaUrl: '/profile/subscription',
    };
    throw new SubscriptionExpiredException(status.copy.expiredMessage, meta);
  }

  invalidateCache() {
    this.cached = null;
  }
}
// i18n-ignore-end
