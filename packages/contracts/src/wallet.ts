// 现金钱包（¥零钱）契约。金额一律整数 cents（÷100 为元），不混币种（currency）。
// 与 subscription.ts amountCents / token-usage estimatedCostCents 口径一致。

export type WalletTransactionType =
  | "recharge"
  | "admin_adjust"
  | "refund"
  | "spend"
  | "reversal";

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
