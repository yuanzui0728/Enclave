export type SubscriptionStatus = "active" | "expired" | "none";
export type SubscriptionSource = "trial" | "purchase" | "invite_reward" | "admin_grant";
export type CloudUserStatus = "active" | "banned" | "archived";
export type InviteRedemptionStatus = "rewarded" | "rejected";

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

export interface CheckoutRequest {
  planCode: string;
}

export interface CheckoutResponse {
  status: "manual";
  contact: string;
  hint: string;
}

export interface CloudUserSummary {
  id: string;
  phone: string;
  displayName: string | null;
  status: CloudUserStatus;
  subscriptionStatus: SubscriptionStatus;
  subscriptionExpiresAt: string | null;
  currentPlanCode: string | null;
  inviterPhone: string | null;
  inviteCode: string | null;
  redeemCount: number;
  registrationIp: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface CloudUserListQuery {
  query?: string;
  subscriptionStatus?: SubscriptionStatus;
  status?: CloudUserStatus;
  inviterPhone?: string;
  registeredFrom?: string;
  registeredTo?: string;
  page?: number;
  pageSize?: number;
}

export interface CloudUserListResponse {
  items: CloudUserSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CloudUserDetail extends CloudUserSummary {
  subscriptions: SubscriptionRecordSummary[];
  redemptionsAsInviter: InviteRedemptionSummary[];
  redemptionAsInvitee: InviteRedemptionSummary | null;
  worldId: string | null;
  worldStatus: string | null;
  worldApiBaseUrl: string | null;
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
