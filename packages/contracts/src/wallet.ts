// 现金钱包（¥零钱）契约。金额一律整数 cents（÷100 为元），不混币种（currency）。
// 与 subscription.ts amountCents / token-usage estimatedCostCents 口径一致。

export type WalletTransactionType =
  | "recharge"
  | "admin_adjust"
  | "refund"
  | "spend"
  | "reversal"
  // 每日签到随机奖励（0.2–0.5¥）入账。
  | "checkin"
  // 发红包出账（托管扣款）。
  | "hongbao_send"
  // 收红包入账（系统出资发放给用户）。
  | "hongbao_receive"
  // 红包 24h 未被领取，托管金额退回。
  | "hongbao_refund";

export type RechargeRequestStatus = "pending" | "credited" | "cancelled";

export type WalletStatus = "active" | "frozen";

export interface WalletSummary {
  userId: string;
  balanceCents: number;
  currency: string;
  status: WalletStatus;
}

export interface WalletTransactionSummary {
  id: string;
  type: WalletTransactionType;
  // 带符号：+入账 / -出账。
  amountCents: number;
  balanceAfterCents: number;
  currency: string;
  description: string | null;
  relatedId: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface WalletStateResponse {
  wallet: WalletSummary;
  recentTransactions: WalletTransactionSummary[];
}

export interface WalletTransactionListResponse {
  items: WalletTransactionSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CreateRechargeRequestPayload {
  requestedAmountCents: number;
  note?: string;
}

export interface WalletRechargeRequestSummary {
  id: string;
  userId: string;
  requestedAmountCents: number;
  currency: string;
  status: RechargeRequestStatus;
  note: string | null;
  creditedTransactionId: string | null;
  handledBy: string | null;
  handledAt: string | null;
  createdAt: string;
}

// 充值申请提交结果：复用会员开通 manual hint，引导用户「联系运营」完成支付。
export interface CreateRechargeResponse {
  request: WalletRechargeRequestSummary;
  contact: string;
  hint: string;
}

// ── 后台（admin）─────────────────────────────────────────────
export interface AdjustWalletBalancePayload {
  // 带符号增量；正=入账，负=扣减。
  deltaCents: number;
  type: WalletTransactionType;
  description?: string;
}

export interface CreditRechargeRequestPayload {
  // 可覆盖入账金额（默认按申请金额）。
  amountCents?: number;
}

export interface WalletRechargeRequestListResponse {
  items: WalletRechargeRequestSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── 每日签到（GET/POST /cloud/me/wallet/checkin）──────────────────────────────
// 签到奖励是随机 [20,50] cents（0.2–0.5¥），直接经 WalletService 入零钱钱包。
export interface WalletCheckinStatus {
  // 今天（Asia/Shanghai 日界）是否已签到。
  checkedInToday: boolean;
  // 上次签到日期（YYYY-MM-DD），从未签到为 null。
  lastCheckinDate: string | null;
  // 连续签到天数（断签归 1）。
  streak: number;
  totalCheckins: number;
  // 今日已签到时的奖励金额（cents），未签到为 0。
  todayRewardCents: number;
}

export interface WalletCheckinResult extends WalletCheckinStatus {
  // 本次签到发放的随机奖励（cents）。
  rewardCents: number;
  // 入账后的最新余额（cents）。
  balanceCents: number;
}

// ── 红包（hongbao）跨服务内部契约 ──────────────────────────────────────────────
// 红包账本（HongbaoEntity）落在 cloud-api（与钱包同库），world 进程经
// /cloud/internal/wallet/hongbao/* 内部接口（X-Service-Token）调度金额变动；
// world 侧聊天消息只存 RedPacketAttachment 快照（见 attachments.ts）。

// outgoing=用户→AI（钱包出资，托管扣款）；incoming=AI→用户（系统出资发放）。
export type HongbaoDirection = "outgoing" | "incoming";
// pending=待领取；claimed=已领取（出账=AI 领走/钱已花，入账=用户领走已入账）；
// refunded=出账 24h 未领退回；expired=入账 24h 未开作废（不入账）。
export type HongbaoStatus = "pending" | "claimed" | "refunded" | "expired";
// wallet=钱从用户钱包扣；system=平台系统出资。
export type HongbaoSource = "wallet" | "system";

export interface HongbaoSummary {
  id: string;
  userId: string;
  direction: HongbaoDirection;
  status: HongbaoStatus;
  source: HongbaoSource;
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

// 用户发红包给 AI（钱包扣款托管）。phone 标识 cloud user。
export interface HongbaoSendRequest {
  phone: string;
  conversationId: string;
  counterpartyCharacterId: string;
  counterpartyCharacterName: string;
  amountCents: number;
  message: string;
}

// AI 发系统红包给用户（不扣任何人，待用户打开时入账）。
export interface HongbaoIssueRequest {
  phone: string;
  conversationId: string;
  counterpartyCharacterId: string;
  counterpartyCharacterName: string;
  amountCents: number;
  message: string;
}

export interface HongbaoSendResponse {
  hongbao: HongbaoSummary;
  // 出账后用户最新余额（cents）。
  balanceCents: number;
}

export interface HongbaoIssueResponse {
  hongbao: HongbaoSummary;
}

// 领取/打开一个红包。phone 用于二次校验归属；by 区分领取方（仅审计用）。
export interface HongbaoClaimRequest {
  phone: string;
  by: "user" | "character";
}

export interface HongbaoClaimResponse {
  hongbao: HongbaoSummary;
  // incoming 领取后用户最新余额（cents）；outgoing 领取余额不变，回传当前值。
  balanceCents: number | null;
}

// 过期清扫：outgoing pending 超期退回钱包；incoming pending 超期作废。
export interface HongbaoSweepResponse {
  refundedOutgoing: number;
  expiredIncoming: number;
}
