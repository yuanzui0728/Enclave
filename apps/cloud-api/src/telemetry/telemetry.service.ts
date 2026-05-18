import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  TelemetryApiHealthResponse,
  TelemetryApiHealthRow,
  TelemetryAppId,
  TelemetryBatchResponse,
  TelemetryErrorRow,
  TelemetryErrorsResponse,
  TelemetryEventInput,
  TelemetryFunnelResponse,
  TelemetryFunnelStep,
  TelemetryOverviewResponse,
  TelemetryRange,
  TelemetryTimeseriesPoint,
  TelemetryTimeseriesResponse,
  TelemetryTopEventsResponse,
  TelemetryTopWorldsResponse,
  TelemetryTopWorldsSortDir,
  TelemetryTopWorldsSortKey,
  TelemetryWorldRow,
} from "@yinjie/contracts";
import { createHash, randomUUID } from "crypto";
import { Repository } from "typeorm";
import { CloudUserEntity } from "../entities/cloud-user.entity";
import { CloudWorldEntity } from "../entities/cloud-world.entity";
import { ClientTelemetryDailyEntity } from "../entities/client-telemetry-daily.entity";
import { ClientTelemetryEventEntity } from "../entities/client-telemetry-event.entity";

const MAX_PROPS_BYTES = 32 * 1024;
const MAX_USER_AGENT_LEN = 500;
const RATE_LIMIT_BUCKET_MAX = 200;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
// Defensive cap on rate-limit map. Each entry is tiny, but a misbehaving
// client (or attacker rotating IPs) could otherwise grow it without bound.
const RATE_LIMIT_MAX_BUCKETS = 10_000;

type IngestContext = {
  ip: string | null;
  userAgent: string | null;
};

type Bucket = { count: number; resetAt: number };

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);
  private readonly buckets = new Map<string, Bucket>();
  private readonly dailySaltCache = new Map<string, string>();

  constructor(
    @InjectRepository(ClientTelemetryEventEntity)
    private readonly events: Repository<ClientTelemetryEventEntity>,
    @InjectRepository(ClientTelemetryDailyEntity)
    private readonly daily: Repository<ClientTelemetryDailyEntity>,
    @InjectRepository(CloudWorldEntity)
    private readonly worlds: Repository<CloudWorldEntity>,
    @InjectRepository(CloudUserEntity)
    private readonly users: Repository<CloudUserEntity>,
  ) {}

  async ingestBatch(
    appId: TelemetryAppId,
    inputs: TelemetryEventInput[],
    ctx: IngestContext,
  ): Promise<TelemetryBatchResponse> {
    const ipHash = this.hashIp(ctx.ip);
    const bucketKey = `${appId}:${ipHash ?? "noip"}`;
    if (!this.allowBucket(bucketKey, inputs.length)) {
      // Signal "back off" so the SDK retries / persists rather than
      // silently dropping the batch on a 200 response.
      throw new HttpException(
        { message: "Telemetry rate limit exceeded.", retryAfterSeconds: 60 },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const userAgent = ctx.userAgent ? ctx.userAgent.slice(0, MAX_USER_AGENT_LEN) : null;
    const now = new Date();

    const rows = inputs
      .map((input) => this.buildRow(appId, input, ipHash, userAgent, now))
      .filter((row): row is ClientTelemetryEventEntity => row !== null);

    const rejected = inputs.length - rows.length;
    if (rows.length === 0) {
      return { accepted: 0, rejected };
    }

    try {
      const chunkSize = 50;
      for (let i = 0; i < rows.length; i += chunkSize) {
        // INSERT OR IGNORE — duplicates by client-supplied id (which is also
        // the primary key) are dropped silently. This makes the public
        // ingestion endpoint idempotent against SDK retries / localStorage
        // replays where the same event might be POSTed twice.
        await this.events
          .createQueryBuilder()
          .insert()
          .into(ClientTelemetryEventEntity)
          .values(rows.slice(i, i + chunkSize))
          .orIgnore()
          .execute();
      }
      return { accepted: rows.length, rejected };
    } catch (error) {
      this.logger.error(
        `telemetry insert failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return { accepted: 0, rejected: inputs.length };
    }
  }

  private buildRow(
    appId: TelemetryAppId,
    input: TelemetryEventInput,
    ipHash: string | null,
    userAgent: string | null,
    now: Date,
  ): ClientTelemetryEventEntity | null {
    let propsJson: string | null = null;
    if (input.props && Object.keys(input.props).length > 0) {
      try {
        const json = JSON.stringify(input.props);
        if (json.length > MAX_PROPS_BYTES) return null;
        propsJson = json;
      } catch {
        return null;
      }
    }

    const occurredAt = new Date(input.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) return null;

    // Server-side normalization for older SDK clients that emitted
    // `page_view_end` with eventType='pv' before the SDK fix landed.
    // page_view_end is a time-on-page measurement, not a fresh PV — keeping
    // it under eventType='session' prevents the daily pvCount rollup from
    // double-counting every navigation.
    const normalizedEventType =
      input.eventName === "page_view_end" && input.eventType === "pv"
        ? "session"
        : input.eventType;

    const row = this.events.create({
      // Prefer the client-supplied id so retries / localStorage replays are
      // idempotent (the unique PK + INSERT OR IGNORE drops duplicates). Fall
      // back to a server-generated UUID for older clients that don't send one.
      id: input.id?.trim() || randomUUID(),
      appId,
      eventName: input.eventName,
      eventType: normalizedEventType,
      anonId: input.anonId,
      userId: input.userId ?? null,
      worldId: input.worldId ?? null,
      sessionId: input.sessionId,
      pagePath: input.pagePath ?? null,
      referrer: input.referrer ?? null,
      propsJson,
      userAgent,
      ipHash,
      release: input.release ?? null,
      occurredAt,
      serverReceivedAt: now,
    });
    return row;
  }

  private hashIp(ip: string | null): string | null {
    if (!ip) return null;
    const today = new Date().toISOString().slice(0, 10);
    let salt = this.dailySaltCache.get(today);
    if (!salt) {
      salt = `yinjie-tel-${today}`;
      this.dailySaltCache.set(today, salt);
      if (this.dailySaltCache.size > 7) {
        const oldest = this.dailySaltCache.keys().next().value;
        if (oldest) this.dailySaltCache.delete(oldest);
      }
    }
    return createHash("sha256").update(`${ip}:${salt}`).digest("hex").slice(0, 16);
  }

  private allowBucket(key: string, cost: number): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      // Evict the oldest entry (insertion-order in Map) before adding a new
      // one once we hit the cap, so the map can never grow unbounded.
      if (!bucket && this.buckets.size >= RATE_LIMIT_MAX_BUCKETS) {
        const oldest = this.buckets.keys().next().value;
        if (oldest) this.buckets.delete(oldest);
      }
      this.buckets.set(key, { count: cost, resetAt: now + RATE_LIMIT_WINDOW_MS });
      return cost <= RATE_LIMIT_BUCKET_MAX;
    }
    if (bucket.count + cost > RATE_LIMIT_BUCKET_MAX) return false;
    bucket.count += cost;
    return true;
  }

  // === Admin queries ===

  async overview(
    range: TelemetryRange,
    appId?: TelemetryAppId,
    worldId?: string,
  ): Promise<TelemetryOverviewResponse> {
    const startIso = startOfRange(range);
    const eventsQb = this.events
      .createQueryBuilder("e")
      .where("e.occurredAt >= :start", { start: startIso });
    if (appId) eventsQb.andWhere("e.appId = :appId", { appId });
    if (worldId) eventsQb.andWhere("e.worldId = :worldId", { worldId });

    const [totals] = await eventsQb
      .select(
        "SUM(CASE WHEN e.eventType = 'pv' THEN 1 ELSE 0 END)",
        "pvCount",
      )
      .addSelect("COUNT(DISTINCT e.anonId)", "uvCount")
      .addSelect("COUNT(DISTINCT e.sessionId)", "sessionCount")
      .addSelect(
        "SUM(CASE WHEN e.eventType = 'error' THEN 1 ELSE 0 END)",
        "errorCount",
      )
      .getRawMany<{
        pvCount: string | null;
        uvCount: string | null;
        sessionCount: string | null;
        errorCount: string | null;
      }>();

    const sessionDurationsQb = this.events
      .createQueryBuilder("e")
      .select("e.propsJson", "propsJson")
      .where("e.eventName = 'session_end'")
      .andWhere("e.occurredAt >= :start", { start: startIso });
    if (appId) sessionDurationsQb.andWhere("e.appId = :appId", { appId });
    if (worldId) sessionDurationsQb.andWhere("e.worldId = :worldId", { worldId });
    const durationRows = await sessionDurationsQb.getRawMany<{
      propsJson: string | null;
    }>();
    const durations: number[] = [];
    for (const row of durationRows) {
      if (!row.propsJson) continue;
      try {
        const p = JSON.parse(row.propsJson) as { durationMs?: number };
        if (typeof p.durationMs === "number") durations.push(p.durationMs);
      } catch {
        // ignore
      }
    }
    const avgSessionDurationMs =
      durations.length > 0
        ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
        : 0;

    const sparklineQb = this.events
      .createQueryBuilder("e")
      .select("substr(e.occurredAt, 1, 10)", "date")
      .addSelect("COUNT(DISTINCT e.anonId)", "value")
      .where("e.eventType = 'pv'")
      .andWhere("e.occurredAt >= :start", { start: startIso });
    if (appId) sparklineQb.andWhere("e.appId = :appId", { appId });
    if (worldId) sparklineQb.andWhere("e.worldId = :worldId", { worldId });
    const sparkRows = await sparklineQb
      .groupBy("substr(e.occurredAt, 1, 10)")
      .orderBy("date", "ASC")
      .getRawMany<{ date: string; value: string }>();

    return {
      range,
      pvCount: toInt(totals?.pvCount),
      uvCount: toInt(totals?.uvCount),
      sessionCount: toInt(totals?.sessionCount),
      errorCount: toInt(totals?.errorCount),
      avgSessionDurationMs,
      sparkline: sparkRows.map((r) => ({
        date: r.date,
        group: appId ?? "all",
        value: toInt(r.value),
      })),
    };
  }

  async timeseries(
    eventName: string,
    range: TelemetryRange,
    groupBy: "appId" | "none",
    appId?: TelemetryAppId,
    worldId?: string,
  ): Promise<TelemetryTimeseriesResponse> {
    const startIso = startOfRange(range);
    const qb = this.events
      .createQueryBuilder("e")
      .select("substr(e.occurredAt, 1, 10)", "date")
      .addSelect("COUNT(*)", "value")
      .where("e.eventName = :eventName", { eventName })
      .andWhere("e.occurredAt >= :start", { start: startIso });
    if (appId) qb.andWhere("e.appId = :appId", { appId });
    if (worldId) qb.andWhere("e.worldId = :worldId", { worldId });
    if (groupBy === "appId") {
      qb.addSelect("e.appId", "group");
      qb.groupBy("substr(e.occurredAt, 1, 10)").addGroupBy("e.appId");
    } else {
      qb.groupBy("substr(e.occurredAt, 1, 10)");
    }
    qb.orderBy("date", "ASC");

    const rows = await qb.getRawMany<{
      date: string;
      group?: string;
      value: string;
    }>();

    const points: TelemetryTimeseriesPoint[] = rows.map((r) => ({
      date: r.date,
      group: r.group ?? "all",
      value: toInt(r.value),
    }));

    return { eventName, range, groupBy, points };
  }

  async topEvents(
    range: TelemetryRange,
    appId?: TelemetryAppId,
    worldId?: string,
    limit = 30,
  ): Promise<TelemetryTopEventsResponse> {
    const startIso = startOfRange(range);
    const qb = this.events
      .createQueryBuilder("e")
      .select("e.appId", "appId")
      .addSelect("e.eventName", "eventName")
      .addSelect("e.eventType", "eventType")
      .addSelect("COUNT(*)", "count")
      .addSelect("COUNT(DISTINCT e.userId)", "uniqueUsers")
      .addSelect("COUNT(DISTINCT e.anonId)", "uniqueAnons")
      .where("e.occurredAt >= :start", { start: startIso });
    if (appId) qb.andWhere("e.appId = :appId", { appId });
    if (worldId) qb.andWhere("e.worldId = :worldId", { worldId });
    const rows = await qb
      .groupBy("e.appId")
      .addGroupBy("e.eventName")
      .addGroupBy("e.eventType")
      .orderBy("count", "DESC")
      .limit(limit)
      .getRawMany<{
        appId: string;
        eventName: string;
        eventType: string;
        count: string;
        uniqueUsers: string;
        uniqueAnons: string;
      }>();

    return {
      range,
      rows: rows.map((r) => ({
        appId: r.appId as TelemetryAppId,
        eventName: r.eventName,
        eventType: r.eventType as TelemetryTopEventsResponse["rows"][number]["eventType"],
        count: toInt(r.count),
        uniqueUsers: toInt(r.uniqueUsers),
        uniqueAnons: toInt(r.uniqueAnons),
      })),
    };
  }

  async funnel(
    steps: string[],
    range: TelemetryRange,
    appId?: TelemetryAppId,
    worldId?: string,
  ): Promise<TelemetryFunnelResponse> {
    const startIso = startOfRange(range);
    const stepCounts: TelemetryFunnelStep[] = [];
    let prevAnons: Set<string> | null = null;
    let firstCount = 0;

    for (let i = 0; i < steps.length; i += 1) {
      const stepName = steps[i];
      const qb = this.events
        .createQueryBuilder("e")
        .select("DISTINCT e.anonId", "anonId")
        .where("e.eventName = :name", { name: stepName })
        .andWhere("e.occurredAt >= :start", { start: startIso });
      if (appId) qb.andWhere("e.appId = :appId", { appId });
      if (worldId) qb.andWhere("e.worldId = :worldId", { worldId });
      const rows = await qb.getRawMany<{ anonId: string }>();
      let stepAnons = new Set(rows.map((r) => r.anonId));
      if (prevAnons) {
        stepAnons = new Set([...stepAnons].filter((a) => prevAnons!.has(a)));
      }
      const count = stepAnons.size;

      let conversionFromPrev: number;
      if (i === 0) {
        // Step 0 is the funnel entry — by convention it has 100% conversion
        // from itself (there is no previous step).
        conversionFromPrev = 1;
      } else if (prevAnons && prevAnons.size > 0) {
        conversionFromPrev = count / prevAnons.size;
      } else {
        // Previous step had 0 anons — no one to convert. Report 0 instead
        // of misleading 100%.
        conversionFromPrev = 0;
      }

      let conversionFromStart: number;
      if (i === 0) {
        conversionFromStart = 1;
      } else if (firstCount > 0) {
        conversionFromStart = count / firstCount;
      } else {
        conversionFromStart = 0;
      }

      if (i === 0) firstCount = count;
      stepCounts.push({
        eventName: stepName,
        count,
        conversionFromPrev,
        conversionFromStart,
      });
      prevAnons = stepAnons;
    }

    return { range, steps: stepCounts };
  }

  async apiHealth(
    range: TelemetryRange,
    appId?: TelemetryAppId,
    worldId?: string,
    limit = 30,
  ): Promise<TelemetryApiHealthResponse> {
    const startIso = startOfRange(range);
    const qb = this.events
      .createQueryBuilder("e")
      .select("e.propsJson", "propsJson")
      .where("e.eventName = 'api_call'")
      .andWhere("e.occurredAt >= :start", { start: startIso });
    if (appId) qb.andWhere("e.appId = :appId", { appId });
    if (worldId) qb.andWhere("e.worldId = :worldId", { worldId });
    const rows = await qb.getRawMany<{ propsJson: string | null }>();

    const buckets = new Map<
      string,
      { durations: number[]; ok: number; total: number }
    >();
    for (const r of rows) {
      if (!r.propsJson) continue;
      try {
        const p = JSON.parse(r.propsJson) as {
          path?: string;
          durationMs?: number;
          ok?: boolean;
        };
        const path = p.path ?? "(unknown)";
        let bucket = buckets.get(path);
        if (!bucket) {
          bucket = { durations: [], ok: 0, total: 0 };
          buckets.set(path, bucket);
        }
        if (typeof p.durationMs === "number") bucket.durations.push(p.durationMs);
        bucket.total += 1;
        if (p.ok) bucket.ok += 1;
      } catch {
        // ignore
      }
    }

    const result: TelemetryApiHealthRow[] = [];
    for (const [path, b] of buckets) {
      result.push({
        pagePath: path,
        totalCalls: b.total,
        successRate: b.total > 0 ? b.ok / b.total : 0,
        p50Ms: percentile(b.durations, 0.5) ?? 0,
        p95Ms: percentile(b.durations, 0.95) ?? 0,
      });
    }
    result.sort((a, b) => b.totalCalls - a.totalCalls);
    return { range, rows: result.slice(0, limit) };
  }

  async errors(
    range: TelemetryRange,
    appId?: TelemetryAppId,
    worldId?: string,
    limit = 100,
  ): Promise<TelemetryErrorsResponse> {
    const startIso = startOfRange(range);
    const qb = this.events
      .createQueryBuilder("e")
      .where("e.eventType = 'error'")
      .andWhere("e.occurredAt >= :start", { start: startIso });
    if (appId) qb.andWhere("e.appId = :appId", { appId });
    if (worldId) qb.andWhere("e.worldId = :worldId", { worldId });
    const rows = await qb
      .orderBy("e.occurredAt", "DESC")
      .limit(limit)
      .getMany();

    const result: TelemetryErrorRow[] = rows.map((row) => {
      let message: string | null = null;
      let stack: string | null = null;
      if (row.propsJson) {
        try {
          const p = JSON.parse(row.propsJson) as {
            message?: string;
            stack?: string;
            reason?: string;
          };
          message = p.message ?? p.reason ?? null;
          stack = p.stack ?? null;
        } catch {
          // ignore
        }
      }
      return {
        id: row.id,
        appId: row.appId as TelemetryAppId,
        eventName: row.eventName,
        occurredAt: row.occurredAt.toISOString(),
        pagePath: row.pagePath,
        message,
        stack,
        userAgent: row.userAgent,
        release: row.release,
      };
    });
    return { range, rows: result };
  }

  async topWorlds(
    range: TelemetryRange,
    opts: {
      page?: number;
      pageSize?: number;
      sortBy?: TelemetryTopWorldsSortKey;
      sortDir?: TelemetryTopWorldsSortDir;
    } = {},
  ): Promise<TelemetryTopWorldsResponse> {
    const pageSize = Math.min(Math.max(opts.pageSize ?? 10, 1), 200);
    const page = Math.max(opts.page ?? 1, 1);
    const offset = (page - 1) * pageSize;
    const startIso = startOfRange(range);

    // 白名单兜底，防御 DTO 之外的入口（如 listWorldsForFilter 直接传 opts）。
    const sortBy: TelemetryTopWorldsSortKey =
      opts.sortBy === "uniqueUsers" || opts.sortBy === "errorCount"
        ? opts.sortBy
        : "eventCount";
    const sortDir: "ASC" | "DESC" = opts.sortDir === "asc" ? "ASC" : "DESC";

    // total: 当前 range 内有事件的世界总数（COUNT DISTINCT worldId）。
    // 单独一条 SQL，避免在分页查询里 wrap subquery。
    const totalRow = await this.events
      .createQueryBuilder("e")
      .select("COUNT(DISTINCT e.worldId)", "total")
      .where("e.worldId IS NOT NULL")
      .andWhere("e.occurredAt >= :start", { start: startIso })
      .getRawOne<{ total: string | number }>();
    const total = toInt(totalRow?.total ?? 0);

    const rowsQb = this.events
      .createQueryBuilder("e")
      .select("e.worldId", "worldId")
      .addSelect("COUNT(*)", "eventCount")
      .addSelect("COUNT(DISTINCT e.userId)", "uniqueUsers")
      .addSelect(
        "SUM(CASE WHEN e.eventType = 'error' THEN 1 ELSE 0 END)",
        "errorCount",
      )
      .where("e.worldId IS NOT NULL")
      .andWhere("e.occurredAt >= :start", { start: startIso })
      .groupBy("e.worldId")
      .orderBy(sortBy, sortDir);
    // 非 eventCount 列做 tiebreaker，保证同值时分页稳定。
    if (sortBy !== "eventCount") rowsQb.addOrderBy("eventCount", "DESC");
    const rows = await rowsQb
      .limit(pageSize)
      .offset(offset)
      .getRawMany<{
        worldId: string;
        eventCount: string;
        uniqueUsers: string;
        errorCount: string;
      }>();

    if (rows.length === 0) {
      return { range, rows: [], total, page, pageSize };
    }

    // 名字翻译：单独查一次世界表，不在 events QB 上 JOIN，避免在 GROUP BY 后
    // 引入笛卡尔积 / SQLite 的 ONLY_FULL_GROUP_BY 行为差异。
    const worldIds = rows.map((r) => r.worldId);
    const worldInfoRows = await this.worlds
      .createQueryBuilder("w")
      .select("w.id", "id")
      .addSelect("w.name", "name")
      .addSelect("w.phone", "phone")
      .where("w.id IN (:...ids)", { ids: worldIds })
      .getRawMany<{ id: string; name: string | null; phone: string | null }>();
    const worldInfoMap = new Map(worldInfoRows.map((r) => [r.id, r]));

    // 用 world.phone 反查用户邮箱（cloud_worlds.phone unique）。phone 也可能是邮箱字符串本身，
    // 但 cloud_users 表里两者分列，所以单独 join 一次拿 email。
    const phones = worldInfoRows
      .map((r) => r.phone)
      .filter((p): p is string => typeof p === "string" && p.length > 0);
    const userByPhone = new Map<string, { email: string | null }>();
    if (phones.length > 0) {
      const userRows = await this.users
        .createQueryBuilder("u")
        .select("u.phone", "phone")
        .addSelect("u.email", "email")
        .where("u.phone IN (:...phones)", { phones })
        .getRawMany<{ phone: string; email: string | null }>();
      for (const u of userRows) {
        userByPhone.set(u.phone, { email: u.email ?? null });
      }
    }

    const result: TelemetryWorldRow[] = rows.map((r) => {
      const info = worldInfoMap.get(r.worldId);
      const phone = info?.phone ?? null;
      const email = phone ? userByPhone.get(phone)?.email ?? null : null;
      return {
        worldId: r.worldId,
        worldName: info?.name ?? null,
        ownerEmail: email,
        ownerPhone: phone,
        eventCount: toInt(r.eventCount),
        uniqueUsers: toInt(r.uniqueUsers),
        errorCount: toInt(r.errorCount),
      };
    });
    return { range, rows: result, total, page, pageSize };
  }

  async listWorldsForFilter(
    range: TelemetryRange,
  ): Promise<TelemetryWorldRow[]> {
    // 给 cloud-console 下拉填选项：返回当前 range 内有事件的世界（含名字）。
    // 数据形状跟 topWorlds 一致，但默认拉到 100 条以保证下拉覆盖。
    const resp = await this.topWorlds(range, { pageSize: 100, page: 1 });
    return resp.rows;
  }
}

function startOfRange(range: TelemetryRange): string {
  const ms =
    range === "24h"
      ? 24 * 60 * 60 * 1000
      : range === "7d"
        ? 7 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000;
  // Match TypeORM's better-sqlite3 datetime storage: "YYYY-MM-DD HH:MM:SS.SSS"
  return new Date(Date.now() - ms)
    .toISOString()
    .replace("T", " ")
    .replace("Z", "");
}

function toInt(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

function percentile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * q));
  return Math.round(sorted[idx]);
}
// i18n-ignore-end
