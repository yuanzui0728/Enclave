// i18n-ignore-start: cloud telemetry — log strings only.
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type {
  MinimaxHourlyTelemetryPoint,
  MinimaxHourlyTelemetryResponse,
  MinimaxUsageHourlyPushPayload,
  TelemetryRange,
} from "@yinjie/contracts";
import { Between, Repository } from "typeorm";
import { CloudMinimaxCallHourlyEntity } from "../entities/cloud-minimax-call-hourly.entity";
import { CloudWorldEntity } from "../entities/cloud-world.entity";
import { isRequestGatePlaceholderWorld } from "../request-gate-placeholder";

const HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class MinimaxUsageService {
  private readonly logger = new Logger(MinimaxUsageService.name);

  constructor(
    @InjectRepository(CloudMinimaxCallHourlyEntity)
    private readonly hourly: Repository<CloudMinimaxCallHourlyEntity>,
    @InjectRepository(CloudWorldEntity)
    private readonly worlds: Repository<CloudWorldEntity>,
  ) {}

  async ingestHourly(
    payload: MinimaxUsageHourlyPushPayload,
    headerToken: string | undefined,
  ): Promise<{ ok: true; accepted: number }> {
    const worldId = (payload.worldId ?? "").trim();
    if (!worldId) {
      throw new BadRequestException("worldId is required.");
    }
    const buckets = Array.isArray(payload.buckets) ? payload.buckets : [];
    if (buckets.length === 0) {
      return { ok: true, accepted: 0 };
    }

    const world = await this.worlds.findOne({ where: { id: worldId } });
    if (!world || isRequestGatePlaceholderWorld(world)) {
      throw new NotFoundException("World not found.");
    }
    this.assertCallbackToken(world, headerToken, payload.callbackToken);

    let accepted = 0;
    for (const item of buckets) {
      const hour = parseHourIso(item?.hour);
      if (!hour) continue;
      const calls = toInt(item?.calls);
      const rpmLimited = toInt(item?.rpmLimited);
      let quotaLimited = toInt(item?.quotaLimited);
      // Backwards-compat：拆列前的 world child 还在上行 {rateLimited}。这部分
      // 历史观测 89% 都是 quota（2056），把它当作 quotaLimited 入库与本次拆列
      // migration 对历史 rateLimitedCount 整列搬到 quotaLimitedCount 的策略一致。
      const legacy = toInt(
        (item as unknown as { rateLimited?: unknown })?.rateLimited,
      );
      if (legacy > 0 && rpmLimited === 0 && quotaLimited === 0) {
        quotaLimited = legacy;
      }
      if (calls <= 0 && rpmLimited <= 0 && quotaLimited <= 0) continue;

      const existing = await this.hourly.findOne({
        where: { worldId, bucketHour: hour },
      });
      if (existing) {
        existing.callCount += calls;
        existing.rpmLimitedCount += rpmLimited;
        existing.quotaLimitedCount += quotaLimited;
        await this.hourly.save(existing);
      } else {
        const row = this.hourly.create({
          worldId,
          bucketHour: hour,
          callCount: calls,
          rpmLimitedCount: rpmLimited,
          quotaLimitedCount: quotaLimited,
        });
        await this.hourly.save(row);
      }
      accepted += 1;
    }

    return { ok: true, accepted };
  }

  async getHourly(
    range: TelemetryRange,
    worldId?: string,
  ): Promise<MinimaxHourlyTelemetryResponse> {
    const now = new Date();
    const hoursBack = rangeToHours(range);
    const startMs = floorHourMs(now.getTime() - (hoursBack - 1) * HOUR_MS);
    const endMs = floorHourMs(now.getTime());
    const startIso = new Date(startMs).toISOString();
    const endIso = new Date(endMs).toISOString();

    const trimmedWorldId = (worldId ?? "").trim() || null;

    const rows = await this.hourly.find({
      where: trimmedWorldId
        ? { worldId: trimmedWorldId, bucketHour: Between(startIso, endIso) }
        : { bucketHour: Between(startIso, endIso) },
    });

    // Aggregate by hour bucket (跨 world 时多行同 hour 求和；单 world 时直接保留)
    const aggregated = new Map<
      string,
      { callCount: number; rpmLimitedCount: number; quotaLimitedCount: number }
    >();
    for (const row of rows) {
      const key = row.bucketHour;
      const cur =
        aggregated.get(key) ??
        { callCount: 0, rpmLimitedCount: 0, quotaLimitedCount: 0 };
      cur.callCount += row.callCount ?? 0;
      cur.rpmLimitedCount += row.rpmLimitedCount ?? 0;
      cur.quotaLimitedCount += row.quotaLimitedCount ?? 0;
      aggregated.set(key, cur);
    }

    // 补 0 bucket，避免前端折线断开
    const points: MinimaxHourlyTelemetryPoint[] = [];
    for (let i = 0; i < hoursBack; i += 1) {
      const t = new Date(startMs + i * HOUR_MS);
      const key = t.toISOString();
      const cur =
        aggregated.get(key) ??
        { callCount: 0, rpmLimitedCount: 0, quotaLimitedCount: 0 };
      points.push({
        hour: key,
        callCount: cur.callCount,
        rpmLimitedCount: cur.rpmLimitedCount,
        quotaLimitedCount: cur.quotaLimitedCount,
      });
    }

    return { range, worldId: trimmedWorldId, points };
  }

  private assertCallbackToken(
    world: Pick<CloudWorldEntity, "callbackToken">,
    headerToken?: string,
    bodyToken?: string | null,
  ) {
    const expected = (world.callbackToken ?? "").trim();
    const actual = (headerToken ?? "").trim() || (bodyToken ?? "").trim();
    if (!expected) {
      throw new UnauthorizedException("World callback token is not configured.");
    }
    if (!actual || actual !== expected) {
      throw new UnauthorizedException("Invalid world callback token.");
    }
  }
}

function parseHourIso(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return null;
  return new Date(floorHourMs(ts)).toISOString();
}

function floorHourMs(ms: number): number {
  return Math.floor(ms / HOUR_MS) * HOUR_MS;
}

function toInt(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function rangeToHours(range: TelemetryRange): number {
  switch (range) {
    case "24h":
      return 24;
    case "7d":
      return 7 * 24;
    case "30d":
      return 30 * 24;
    default:
      return 24;
  }
}
// i18n-ignore-end
