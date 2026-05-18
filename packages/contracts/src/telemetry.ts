export type TelemetryAppId = "app" | "site" | "wiki";

export type TelemetryEventType =
  | "pv"
  | "business"
  | "api_call"
  | "error"
  | "performance"
  | "session";

export interface TelemetryEventInput {
  /**
   * Stable client-generated event id. If provided, the server uses it as
   * the row primary key and silently ignores duplicate inserts (i.e. idempotency
   * on retries / localStorage replay). If omitted, the server falls back to
   * generating one — duplicates are then possible.
   */
  id?: string;
  eventName: string;
  eventType: TelemetryEventType;
  occurredAt: string;
  sessionId: string;
  anonId: string;
  userId?: string | null;
  /**
   * 当前用户所在的云世界 id（CloudWorldEntity.id）。app 端进入世界后填，
   * site/wiki 与世界无关恒为 null。用于 cloud-console 按世界切片分析。
   */
  worldId?: string | null;
  pagePath?: string | null;
  referrer?: string | null;
  release?: string | null;
  props?: Record<string, unknown> | null;
}

export interface TelemetryBatchRequest {
  appId: TelemetryAppId;
  events: TelemetryEventInput[];
}

export interface TelemetryBatchResponse {
  accepted: number;
  rejected: number;
}

export type TelemetryRange = "24h" | "7d" | "30d";

export interface TelemetryOverviewResponse {
  range: TelemetryRange;
  pvCount: number;
  uvCount: number;
  sessionCount: number;
  errorCount: number;
  avgSessionDurationMs: number;
  sparkline: TelemetryTimeseriesPoint[];
}

export interface TelemetryTimeseriesPoint {
  date: string;
  group: string;
  value: number;
}

export interface TelemetryTimeseriesResponse {
  eventName: string;
  range: TelemetryRange;
  groupBy: string;
  points: TelemetryTimeseriesPoint[];
}

export interface TelemetryTopEventRow {
  appId: TelemetryAppId;
  eventName: string;
  eventType: TelemetryEventType;
  count: number;
  uniqueUsers: number;
  uniqueAnons: number;
}

export interface TelemetryTopEventsResponse {
  range: TelemetryRange;
  rows: TelemetryTopEventRow[];
}

export interface TelemetryFunnelStep {
  eventName: string;
  count: number;
  conversionFromPrev: number;
  conversionFromStart: number;
}

export interface TelemetryFunnelResponse {
  range: TelemetryRange;
  steps: TelemetryFunnelStep[];
}

export interface TelemetryApiHealthRow {
  pagePath: string;
  totalCalls: number;
  successRate: number;
  p50Ms: number;
  p95Ms: number;
}

export interface TelemetryApiHealthResponse {
  range: TelemetryRange;
  rows: TelemetryApiHealthRow[];
}

export interface TelemetryErrorRow {
  id: string;
  appId: TelemetryAppId;
  eventName: string;
  occurredAt: string;
  pagePath: string | null;
  message: string | null;
  stack: string | null;
  userAgent: string | null;
  release: string | null;
}

export interface TelemetryErrorsResponse {
  range: TelemetryRange;
  rows: TelemetryErrorRow[];
}

export interface TelemetryWorldRow {
  worldId: string;
  worldName: string | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
  eventCount: number;
  uniqueUsers: number;
  errorCount: number;
}

export type TelemetryTopWorldsSortKey =
  | "eventCount"
  | "uniqueUsers"
  | "errorCount";

export type TelemetryTopWorldsSortDir = "asc" | "desc";

export interface TelemetryTopWorldsResponse {
  range: TelemetryRange;
  rows: TelemetryWorldRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MinimaxUsageHourlyBucketPushItem {
  /** UTC 整点 ISO 时间戳，例如 "2026-05-13T07:00:00.000Z"。 */
  hour: string;
  /** 该 hour bucket 内全部 minimax 出站调用次数（含 4xx/5xx，不含网络/超时）。 */
  calls: number;
  /** RPM/并发限流次数：HTTP 429 + provider code 1002/2003/2062。可短期恢复。 */
  rpmLimited: number;
  /** 配额耗尽次数：provider code 1042/2056。今日/当窗口确定性额度耗尽。 */
  quotaLimited: number;
}

export interface MinimaxUsageHourlyPushPayload {
  worldId: string;
  buckets: MinimaxUsageHourlyBucketPushItem[];
  callbackToken?: string | null;
}

export interface MinimaxHourlyTelemetryPoint {
  /** UTC 整点 ISO 时间戳。 */
  hour: string;
  callCount: number;
  rpmLimitedCount: number;
  quotaLimitedCount: number;
}

export interface MinimaxHourlyTelemetryResponse {
  range: TelemetryRange;
  worldId: string | null;
  points: MinimaxHourlyTelemetryPoint[];
}

// 跨 world 共享的"今日某 model 配额耗尽"广播：world child 撞 1042/2056 后推给
// cloud-api；其它 world 启动 / 定时拉取后跳过该 model 的所有提交，避免每个
// world 各撞一次浪费上游配额。usageDate 用 Asia/Shanghai 的 YYYY-MM-DD。
export interface MinimaxQuotaExhaustionReportPayload {
  worldId: string;
  model: string;
  usageDate: string;
  callbackToken?: string | null;
}

export interface MinimaxQuotaExhaustionTodayResponse {
  usageDate: string;
  models: string[];
}
