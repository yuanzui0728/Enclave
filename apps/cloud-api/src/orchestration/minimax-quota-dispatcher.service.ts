// i18n-ignore-start: internal config — not user-facing UI.
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CloudWorldEntity } from "../entities/cloud-world.entity";
import {
  parseMinimaxKeyPool,
  pickMinimaxKey,
} from "./minimax-key-pool";

// 单 API key 在 token plan 下的官方日限额（与 api/minimax-quota.constants.ts 的 fallback 对齐）
const PER_KEY_DAILY_TOTAL = {
  hailuoFast: 2,
  hailuo: 2,
  music26: 100,
  music25: 4,
  image01: 120,
  lyrics: 100,
} as const;

export type WorldDailyShare = {
  hailuoFast: number;
  hailuo: number;
  music26: number;
  music25: number;
  image01: number;
  lyrics: number;
};

@Injectable()
export class MinimaxQuotaDispatcherService {
  private readonly logger = new Logger(MinimaxQuotaDispatcherService.name);

  constructor(
    @InjectRepository(CloudWorldEntity)
    private readonly worldRepo: Repository<CloudWorldEntity>,
    private readonly config: ConfigService,
  ) {}

  // 给单个 world 算今日 minimax 配额。返回的每个值都是"该 world 今日上限"。
  // 同一 key 下 N 个 world 共享 PER_KEY_DAILY_TOTAL：
  //   - 总额 >= N：平均分 + 余数按 dayOfYear 轮转
  //   - 总额 < N：日轮换，只有当日轮到的 N 个 world 才有 1 次
  //
  // 注意 1：cloud-api 未配 MINIMAX_API_KEYS/MINIMAX_API_KEY 时（child 走 api/.env
  // 单 key 兜底），所有 world 仍共享同一外部 API 配额——这里用 "__fallback__"
  // fingerprint 把它们视作同一隐含池，做 group 派发，避免抢光。
  // 注意 2：share 在 child 启动那一刻物化进 env，**跨日不会重新轮转**——下次
  // child 重启时才会按新 dayOfYear 计算。属于已知 trade-off，后续可加 0:05 cron
  // 通知 child 拉取最新 share。
  async computeWorldDailyShare(worldId: string): Promise<WorldDailyShare> {
    const pool = parseMinimaxKeyPool(
      this.config.get<string>("MINIMAX_API_KEYS"),
      this.config.get<string>("MINIMAX_API_KEY"),
    );
    const myAlloc = pickMinimaxKey(worldId, pool);
    const myFingerprint = myAlloc?.fingerprint ?? "__fallback__";

    // 找所有共享同一 key（含 fallback 隐含池）的 active world
    const peers = await this.worldRepo.find({
      where: { desiredState: "running" },
    });
    const sameKeyWorldIds = peers
      .map((w) => ({
        id: w.id,
        fingerprint: pickMinimaxKey(w.id, pool)?.fingerprint ?? "__fallback__",
      }))
      .filter((x) => x.fingerprint === myFingerprint)
      .map((x) => x.id)
      .sort();

    // 如果当前 world 不在 peers 里（首次 spawn 还没写库，或 desiredState 不是 running 但被强制 wake），手动加进去
    if (!sameKeyWorldIds.includes(worldId)) {
      sameKeyWorldIds.push(worldId);
      sameKeyWorldIds.sort();
    }

    const groupSize = sameKeyWorldIds.length;
    const myIndex = sameKeyWorldIds.indexOf(worldId);
    const dayOfYear = this.dayOfYearShanghai();

    const share: WorldDailyShare = {
      hailuoFast: this.shareFor(PER_KEY_DAILY_TOTAL.hailuoFast, groupSize, myIndex, dayOfYear),
      hailuo:     this.shareFor(PER_KEY_DAILY_TOTAL.hailuo,     groupSize, myIndex, dayOfYear),
      music26:    this.shareFor(PER_KEY_DAILY_TOTAL.music26,    groupSize, myIndex, dayOfYear),
      music25:    this.shareFor(PER_KEY_DAILY_TOTAL.music25,    groupSize, myIndex, dayOfYear),
      image01:    this.shareFor(PER_KEY_DAILY_TOTAL.image01,    groupSize, myIndex, dayOfYear),
      lyrics:     this.shareFor(PER_KEY_DAILY_TOTAL.lyrics,     groupSize, myIndex, dayOfYear),
    };

    this.logger.log(
      `world=${worldId} key=${myFingerprint} group=${groupSize} idx=${myIndex} day=${dayOfYear} share=${JSON.stringify(share)}`,
    );
    return share;
  }

  private shareFor(
    groupTotal: number,
    groupSize: number,
    myIndex: number,
    dayOfYear: number,
  ): number {
    if (groupSize <= 0) return groupTotal;
    if (groupTotal >= groupSize) {
      const base = Math.floor(groupTotal / groupSize);
      const remainder = groupTotal - base * groupSize;
      if (remainder === 0) return base;
      // 余数 R 名额每天轮给不同 R 个 world：今日轮到的 slot ∈ [dayOfYear, dayOfYear+R)
      const slot = ((myIndex - dayOfYear) % groupSize + groupSize) % groupSize;
      return base + (slot < remainder ? 1 : 0);
    }
    // groupTotal < groupSize：日轮换，今天命中的 groupTotal 个 world 各拿 1 次，其余 0
    const slot = ((myIndex - dayOfYear) % groupSize + groupSize) % groupSize;
    return slot < groupTotal ? 1 : 0;
  }

  // 按 Asia/Shanghai 时区算 day-of-year（1-366）；用 UTC+8 偏移近似（不处理 DST，上海不夏令时）
  private dayOfYearShanghai(): number {
    const nowUtcMs = Date.now();
    const shanghaiMs = nowUtcMs + 8 * 60 * 60 * 1000;
    const d = new Date(shanghaiMs);
    const startOfYearUtcMs = Date.UTC(d.getUTCFullYear(), 0, 1);
    return Math.floor((shanghaiMs - startOfYearUtcMs) / (24 * 60 * 60 * 1000)) + 1;
  }
}
// i18n-ignore-end
