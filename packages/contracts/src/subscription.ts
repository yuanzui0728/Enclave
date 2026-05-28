export type SubscriptionStatus = "active" | "expired" | "none";
export type SubscriptionSource =
  | "trial"
  | "purchase"
  | "invite_reward"
  | "admin_grant"
  | "xhs_reward";
export type CloudUserStatus = "active" | "banned" | "archived";
export type InviteRedemptionStatus = "rewarded" | "rejected";

export interface CloudProfileResponse {
  id: string;
  phone: string;
  displayName: string | null;
  status: CloudUserStatus;
  firstLoginAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface SubscriptionPlanSummary {
  id: string;
  code: string;
  name: string;
  durationDays: number;
  priceCents: number;
  currency: string;
  isActive: boolean;
  isTrial: boolean;
  isPubliclyPurchasable: boolean;
  sortOrder: number;
  description: string | null;
}

export interface SubscriptionRecordSummary {
  id: string;
  planCode: string;
  planName: string;
  source: SubscriptionSource;
  status: "active" | "expired" | "cancelled" | "refunded";
  startsAt: string;
  expiresAt: string;
  amountCents: number;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface SubscriptionCopyBundle {
  expiredTitle: string;
  expiredMessage: string;
  expiredCta: string;
  expiredHint: string;
  checkoutManualHint: string;
  checkoutContactInfo: string;
  inviteShareTitle: string;
  inviteShareBody: string;
  welcomePromoBanner: string | null;
}

export interface SubscriptionStateResponse {
  status: SubscriptionStatus;
  expiresAt: string | null;
  currentPlanCode: string | null;
  currentPlanName: string | null;
  isTrial: boolean;
  source: SubscriptionSource | null;
  plans: SubscriptionPlanSummary[];
  copy: SubscriptionCopyBundle;
  inviteCode: string | null;
  publicAppBaseUrl: string;
}

export interface SubscriptionLookupResponse {
  status: SubscriptionStatus;
  expiresAt: string | null;
  planCode: string | null;
  isTrial: boolean;
  hardBlockEnabled: boolean;
  copy: SubscriptionCopyBundle;
  plans: SubscriptionPlanSummary[];
}

export interface SubscriptionExpiredErrorBody {
  code: "SUBSCRIPTION_EXPIRED";
  message: string;
  meta: {
    expiredAt: string | null;
    plans: SubscriptionPlanSummary[];
    copy: SubscriptionCopyBundle;
    ctaUrl: string;
  };
}

export interface InviteRedemptionSummary {
  id: string;
  inviteePhoneMasked: string;
  status: InviteRedemptionStatus;
  rejectReason: string | null;
  rewardSubscriptionId: string | null;
  createdAt: string;
}

export interface InviteSummaryResponse {
  enabled: boolean;
  code: string | null;
  shareTitle: string;
  shareBody: string;
  shareUrl: string | null;
  publicAppBaseUrl: string | null;
  rewardDays: number;
  redeemCount: number;
  rewardDaysGranted: number;
  recentRedemptions: InviteRedemptionSummary[];
}

export interface RedeemInviteRequest {
  code: string;
}

export interface RedeemInviteResponse {
  status: InviteRedemptionStatus;
  rejectReason: string | null;
  rewardDays: number;
}

// ── 小红书发帖赠会员 ──────────────────────────────────────────────────────
export type XhsRewardClaimStatus = "pending" | "approved" | "rejected";

export interface XhsRewardClaimSummary {
  id: string;
  status: XhsRewardClaimStatus;
  postUrl: string;
  screenshotUrl: string | null;
  reviewNote: string | null;
  rewardSubscriptionId: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface XhsRewardSummaryResponse {
  enabled: boolean;
  rewardDays: number;
  maxApprovedPerUser: number;
  // max(0, maxApprovedPerUser - 当前 pending+approved 数)：还能再提交几次。
  remainingQuota: number;
  title: string;
  body: string;
  submitHint: string;
  recentClaims: XhsRewardClaimSummary[];
}

// 管理端记录（含用户身份 + 取证字段，仅 AdminGuard 可见）。
export interface XhsRewardClaimAdminRecord extends XhsRewardClaimSummary {
  userId: string;
  userPhone: string;
  userEmail: string | null;
  normalizedPostUrl: string;
  submittedIp: string | null;
  submittedDeviceFingerprint: string | null;
  reviewedBy: string | null;
}

export interface XhsRewardClaimListResponse {
  items: XhsRewardClaimAdminRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CheckoutRequest {
  planCode: string;
}

export interface CheckoutResponse {
  status: "manual";
  contact: string;
  hint: string;
}

export type CloudUserDeviceType = "mobile" | "desktop";

export interface CloudUserSummary {
  id: string;
  phone: string;
  email: string | null;
  displayName: string | null;
  status: CloudUserStatus;
  subscriptionStatus: SubscriptionStatus;
  subscriptionExpiresAt: string | null;
  currentPlanCode: string | null;
  worldStatus: string | null;
  inviterPhone: string | null;
  inviteCode: string | null;
  redeemCount: number;
  registrationIp: string | null;
  lastLoginIp: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  // 末次登录设备类型（前端 clientPlatform + server-side UA 归一后落库）。
  // null = 该用户末次登录在该字段上线之前，等下次登录自动写入。
  lastLoginDeviceType: CloudUserDeviceType | null;
  // 末次登录 IP 经 IpRegionService 解析后的省/州（国内中文，海外 provider 原文）。
  lastLoginRegion: string | null;
  // ISO-3166-1 alpha-2，可空。供「国内 vs 海外」聚合 / 国旗图标用。
  lastLoginCountryCode: string | null;
  // 该用户在 client_telemetry_events 里最近一条 eventName='chat_message_sent'
  // 的 occurredAt。null = 注册以来从没发过消息。运营用来判断"会员到底有没有
  // 在用"，比单看 lastLoginAt 更准（登录可能只是 token 刷新）。
  lastChatMessageAt: string | null;
}

export type CloudUserListOrderBy =
  | "expires"
  | "registered"
  | "lastLogin"
  | "lastChatMessage";
export type CloudUserListOrderDir = "asc" | "desc";

export interface CloudUserListQuery {
  query?: string;
  subscriptionStatus?: SubscriptionStatus;
  status?: CloudUserStatus;
  inviterPhone?: string;
  registeredFrom?: string;
  registeredTo?: string;
  page?: number;
  pageSize?: number;
  // 默认 undefined / false：服务端隐藏 smoke / e2e / Twilio 测试号。运营临时
  // 需要看测试账号时传 true 放开。
  includeTestAccounts?: boolean;
  // 全局排序：后端在 LIMIT 之前 ORDER BY，避免"只排当前页 20 条"的错觉。
  // 默认 registered/desc，保持与原行为一致。
  orderBy?: CloudUserListOrderBy;
  orderDir?: CloudUserListOrderDir;
}

export interface CloudUserListResponse {
  items: CloudUserSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// 列表顶部"用户总数 / 会员用户数"卡片。口径永远是生产用户（剔除 +E.164、11
// 位裸号、smoke/example 邮箱），跟列表当前筛选器无关——不管 ops 怎么搜怎么
// 筛，数字始终是真实总量。
export interface CloudUserStats {
  totalUsers: number;
  memberUsers: number;
}

// 用户分布饼图数据。地区维度 top 10 + "其他"聚合（避免长尾国家压扁饼图）；
// 设备维度永远三档：mobile / desktop / unknown（lastLoginDeviceType 为空）。
// 口径与 CloudUserStats 一致，剔除测试号。
export interface CloudUserDistributionBucket {
  label: string;
  count: number;
}

export interface CloudUserDistribution {
  byRegion: CloudUserDistributionBucket[];
  byDevice: CloudUserDistributionBucket[];
}

export interface CloudUserDetail extends CloudUserSummary {
  subscriptions: SubscriptionRecordSummary[];
  redemptionsAsInviter: InviteRedemptionSummary[];
  redemptionAsInvitee: InviteRedemptionSummary | null;
  worldId: string | null;
  worldApiBaseUrl: string | null;
  // 账号注销（status='archived'）后：注销时刻 + 注销前原始手机号/邮箱（本体已置 null
  // 释放给重新注册，这两列供后台展示「这是谁的注销账号」）。非注销用户为 null。
  archivedAt: string | null;
  archivedPhone: string | null;
  archivedEmail: string | null;
}

export interface GrantSubscriptionRequest {
  planCode?: string;
  durationDays?: number;
  source?: SubscriptionSource;
  note?: string;
}

export interface BanCloudUserRequest {
  reason: string;
}

export interface UpsertSubscriptionPlanRequest {
  id?: string;
  code: string;
  name: string;
  durationDays: number;
  priceCents: number;
  currency?: string;
  isActive?: boolean;
  isTrial?: boolean;
  isPubliclyPurchasable?: boolean;
  sortOrder?: number;
  description?: string | null;
}

export interface UpsertCloudConfigRequest {
  key: string;
  value: unknown;
  description?: string | null;
}

export interface CloudConfigEntry {
  key: string;
  value: unknown;
  description: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

export interface InviteRedemptionAdminRecord {
  id: string;
  inviteeUserId: string;
  inviteePhone: string;
  inviteeIp: string | null;
  inviteeDeviceFingerprint: string | null;
  inviterUserId: string;
  inviterPhone: string;
  codeId: string;
  inviteCode: string;
  status: InviteRedemptionStatus;
  rejectReason: string | null;
  rewardSubscriptionId: string | null;
  createdAt: string;
}

export interface InviteRedemptionListQuery {
  query?: string;
  status?: InviteRedemptionStatus;
  page?: number;
  pageSize?: number;
}

export interface InviteRedemptionListResponse {
  items: InviteRedemptionAdminRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface RejectInviteRedemptionRequest {
  reason: string;
}

export function maskPhone(phone: string) {
  const trimmed = phone.replace(/\s+/g, "");
  if (trimmed.length <= 4) {
    return "****";
  }
  if (trimmed.length <= 7) {
    return `${trimmed.slice(0, 3)}****`;
  }
  return `${trimmed.slice(0, 3)}****${trimmed.slice(-4)}`;
}
