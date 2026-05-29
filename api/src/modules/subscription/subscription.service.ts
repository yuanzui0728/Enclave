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
import { GLOBAL_WORLD_OWNER_PHONE } from '../tenancy/tenant-context';

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

// 缓存上限：shared 模式下按 phone 缓存，防止租户多了 Map 无界增长。超过即清空重建
// （TTL 才 60s，清空只是多打一轮 lookup，无正确性影响）。
const SUBSCRIPTION_CACHE_MAX_ENTRIES = 5000;

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);
  // 按 phone 缓存：shared 模式一个进程服务多用户，绝不能让一个用户的会员状态/到期
  // 串给别人（否则一人到期 hardBlock 会拦下全进程所有用户）。LPP 模式只有一个 phone，
  // 退化成单条缓存，行为不变。
  private readonly cacheByPhone = new Map<
    string,
    { value: CloudSubscriptionLookup; expiresAt: number }
  >();

  constructor(private readonly cloudClient: CloudSubscriptionClient) {}

  async getStatus(): Promise<CloudSubscriptionLookup> {
    return this.getStatusForPhone(this.cloudClient.resolveOwnerPhone());
  }

  // 按显式 phone 查会员状态——不依赖 ALS 租户帧。供后台 cron 在「建立租户帧之前」
  // 预筛到期 owner（见 SchedulerService），避免逐个进帧再短路的遍历洪流。getStatus()
  // 委托到此，语义逐字一致（缓存 / 哨兵放行 / 失败兜底全共用）。
  async getStatusForPhone(
    phone: string | null | undefined,
  ): Promise<CloudSubscriptionLookup> {
    if (!phone) {
      // 本地直连或未托管模式：放行
      return FALLBACK_LOOKUP;
    }
    if (phone === GLOBAL_WORLD_OWNER_PHONE) {
      // 「世界居民」全局哨兵 owner：不是真实付费用户，永远放行（active / 不 hardBlock）。
      // 否则它的 phone 在 cloud-api 永远 lookup 落空 → fallback hardBlock=true 会把全局
      // 广场内容生成整个掐断。
      return FALLBACK_LOOKUP;
    }
    const now = Date.now();
    const cached = this.cacheByPhone.get(phone);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }
    const fresh = await this.cloudClient.lookup(phone);
    if (!fresh) {
      // 拉取失败 30 秒短缓存。有上次 cache 就沿用（含 hardBlockEnabled，让 active 用户
      // 在 cloud-api 抖动期间不受影响）；没 cache 时保守拒绝（防止 expired 用户利用
      // cloud-api 失联绕过会员校验）。
      const fallback: CloudSubscriptionLookup = cached?.value
        ? cached.value
        : { ...FALLBACK_LOOKUP, status: 'expired', hardBlockEnabled: true, copy: NETWORK_FALLBACK_COPY };
      this.setCache(phone, fallback, now + 30 * 1000);
      return fallback;
    }
    this.setCache(phone, fresh, now + CACHE_TTL_MS);
    return fresh;
  }

  private setCache(phone: string, value: CloudSubscriptionLookup, expiresAt: number) {
    if (
      this.cacheByPhone.size >= SUBSCRIPTION_CACHE_MAX_ENTRIES &&
      !this.cacheByPhone.has(phone)
    ) {
      this.cacheByPhone.clear();
    }
    this.cacheByPhone.set(phone, { value, expiresAt });
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

  // 当前租户帧的 AI 是否被会员硬拦——与 assertCanUseAi 抛错条件**逐字一致**
  // （hardBlockEnabled && 非 active）。供后台 per-owner cron 提前整帧短路用：到期 owner
  // 在做完 getRuntimeProfile/loadBlob/建 prompt 等重活后才在 LLM 闸抛 SubscriptionExpired
  // 是纯浪费，还持续占用共享世界单事件循环把全员拖到 504。全局哨兵 owner（getStatus 永远
  // 返 active）/ 未托管 / 查询失败一律放行（返 false），绝不误伤正常生成。
  async isAiHardBlockedForCurrentOwner(): Promise<boolean> {
    return this.isAiHardBlockedForPhone(this.cloudClient.resolveOwnerPhone());
  }

  // 同上判定，但按显式 phone（无需 ALS 帧）。cron fan-out 的 enumeration 预筛用：
  // 命中 30s/CACHE_TTL phone 缓存时是 Map 查找，冷缓存才打 cloud-api（与进帧后查同价，
  // 不新增 lookup）。哨兵 / 未托管 / 查询失败一律放行（返 false），绝不误伤正常生成。
  async isAiHardBlockedForPhone(
    phone: string | null | undefined,
  ): Promise<boolean> {
    try {
      const status = await this.getStatusForPhone(phone);
      return status.hardBlockEnabled && status.status !== 'active';
    } catch {
      return false;
    }
  }

  invalidateCache(phone?: string) {
    if (phone) {
      this.cacheByPhone.delete(phone);
      return;
    }
    this.cacheByPhone.clear();
  }
}
// i18n-ignore-end
