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
  /** 区间内有过动作的登录真人数：COUNT(DISTINCT userId)。anon 访客不算。 */
  activeUserCount: number;
  /** 真人主动行为总数：SUM(eventType='business')，剔除 pv/api_call/session 等自动采集噪声。 */
  humanActionCount: number;
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
  /** 既有：区间内全部事件 COUNT(*)。含 pv/api_call 等噪声，排行不再主推，仅保留备查。 */
  eventCount: number;
  /** 既有：活跃登录真人 COUNT(DISTINCT userId)。 */
  uniqueUsers: number;
  errorCount: number;
  // 真人活跃维度（全部由 client_telemetry_events 同一次 GROUP BY 派生）：
  /** ① 访客数 COUNT(DISTINCT anonId)（含未登录）。 */
  uniqueAnons: number;
  /** ② 真人主动行为 SUM(eventType='business')：发消息/发朋友圈/发广场/支付等。 */
  humanActionCount: number;
  /** ② 细分：发消息次数 SUM(eventName='chat_message_sent')。 */
  chatMessageCount: number;
  /** ② 细分：发帖次数 SUM(eventName IN ('moment_published','feed_post_published'))。 */
  postCount: number;
  /** ③ 会话数 COUNT(DISTINCT sessionId)。 */
  sessionCount: number;
  /** ③ 活跃天数 COUNT(DISTINCT 日期)：衡量粘性/留存。 */
  activeDays: number;
  /** ④ 最近一次真人发消息时间（来自 cloud_worlds.lastUserMessageAt，由 world runtime 基于 senderType='user' 上报）。从未有真人发言为 null。 */
  lastUserMessageAt: string | null;
  /** ④ 最近一次真人会话互动时间（来自 cloud_worlds.lastInteractiveAt）。 */
  lastInteractiveAt: string | null;
}

export type TelemetryTopWorldsSortKey =
  | "eventCount"
  | "uniqueUsers"
  | "errorCount"
  | "humanActionCount"
  | "sessionCount"
  | "activeDays";

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
//
// 走查 yuanzui0728 本次 R5：MiniMax 2056 实际是 "5-hour window" 限流
// （status_msg 携带 "resets at <ISO>"），但原版只能熔断到 next-day 00:00
// Shanghai，window 一小时后已恢复仍把全 fleet 锁到明天。新增 untilAt 字段
// 让 cloud-api 持久化真实 reset 时间，让所有共享同 key 的 worlds 都按上游
// 真实窗口恢复。报告方解析失败时省略，cloud-api 默认 next-day midnight。
export interface MinimaxQuotaExhaustionReportPayload {
  worldId: string;
  model: string;
  usageDate: string;
  callbackToken?: string | null;
  /** ISO 8601 reset 时间，从 MiniMax 2056 status_msg 解析。缺失时 cloud-api 默认 next-day 00:00 Shanghai。 */
  untilAt?: string;
}

export interface MinimaxQuotaExhaustionEntry {
  model: string;
  /** ISO 8601 reset 时间。客户端 Date.parse 后比对 Date.now() 决定是否仍熔断。 */
  untilAt: string;
}

export interface MinimaxQuotaExhaustionTodayResponse {
  usageDate: string;
  /** 旧字段：仅 model id 数组（已熔断的模型）。新客户端应优先读 entries。 */
  models: string[];
  /** 新字段：每条 entry 带 untilAt，让 world 按真实 reset 时间自动恢复。 */
  entries?: MinimaxQuotaExhaustionEntry[];
}
