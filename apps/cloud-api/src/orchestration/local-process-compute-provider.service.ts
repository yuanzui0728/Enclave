// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import type { CloudComputeProviderSummary } from "@yinjie/contracts";
import { ChildProcess, spawn } from "node:child_process";
import {
  createCipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { existsSync, mkdirSync, openSync } from "node:fs";
import * as net from "node:net";
import path from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { Repository } from "typeorm";
import { CloudInstanceEntity } from "../entities/cloud-instance.entity";
import { CloudWorldEntity } from "../entities/cloud-world.entity";
import type {
  InspectWorldInstanceResult,
  ProvisionWorldInstanceResult,
  WorldComputeProvider,
  WorldInstancePowerTransitionResult,
} from "../providers/compute-provider.types";
import {
  buildWorldBootstrapConfig,
  resolveCloudPlatformBaseUrl,
} from "./world-bootstrap-config";
import {
  parseMinimaxKeyPool,
  pickMinimaxKey,
} from "./minimax-key-pool";
import { MinimaxQuotaDispatcherService } from "./minimax-quota-dispatcher.service";

type RunningChild = {
  pid: number;
  port: number;
  // cloud-api 重启后我们能 reattach 到孤儿 child 进程，但拿不到原始 ChildProcess
  // 句柄。child=null 时用 process.kill / probe-by-pid 操作。
  child: ChildProcess | null;
  startedAt: Date;
};

// world.apiBaseUrl 形如 http://127.0.0.1:3011 — 抽出端口号，给 allocatePort 兜底使用。
// 非 127.0.0.1 / 解析失败 / 没端口都返回 null（远端 URL 不影响本地端口分配）。
function parsePortFromApiBaseUrl(apiBaseUrl: string | null | undefined): number | null {
  if (!apiBaseUrl) return null;
  try {
    const parsed = new URL(apiBaseUrl);
    if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
      return null;
    }
    const port = parseInt(parsed.port, 10);
    return Number.isFinite(port) && port > 0 ? port : null;
  } catch {
    return null;
  }
}

function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 12; i += 1) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const REPO_ROOT =
  process.env.YINJIE_REPO_ROOT?.trim() || findRepoRoot(__dirname);

const API_DIST_ENTRY = path.join(REPO_ROOT, "api", "dist", "main.js");
const ACCOUNTS_ROOT = path.join(REPO_ROOT, "data", "accounts");
const LOG_DIR = path.join(REPO_ROOT, "logs", "dev-services");
const HEALTH_DEADLINE_MS = 60_000;
const HEALTH_POLL_INTERVAL_MS = 500;
const STOP_GRACE_MS = 5_000;

@Injectable()
export class LocalProcessComputeProviderService
  implements WorldComputeProvider, OnModuleInit, OnModuleDestroy
{
  readonly key = "local-process";
  readonly summary: CloudComputeProviderSummary = {
    key: this.key,
    label: "Local Process Provider",
    description:
      "Spawns a per-account main-api child process with isolated database and media directories.",
    provisionStrategy: "local-process",
    deploymentMode: "local-process",
    defaultRegion: "local",
    defaultZone: "local-a",
    capabilities: {
      managedProvisioning: true,
      managedLifecycle: true,
      bootstrapPackage: false,
      snapshots: false,
    },
  };

  private readonly logger = new Logger(LocalProcessComputeProviderService.name);
  private readonly running = new Map<string, RunningChild>();
  private readonly basePort: number;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(CloudInstanceEntity)
    private readonly instanceRepo: Repository<CloudInstanceEntity>,
    @InjectRepository(CloudWorldEntity)
    private readonly worldRepo: Repository<CloudWorldEntity>,
    private readonly minimaxQuotaDispatcher: MinimaxQuotaDispatcherService,
  ) {
    const configured = parseInt(
      process.env.CLOUD_LOCAL_PROCESS_BASE_PORT?.trim() ?? "",
      10,
    );
    this.basePort = Number.isFinite(configured) && configured > 0 ? configured : 3010;
  }

  async onModuleInit() {
    if (!existsSync(API_DIST_ENTRY)) {
      this.logger.warn(
        `api dist not found at ${API_DIST_ENTRY}; spawn will fail until the api package is built.`,
      );
    }

    // cloud-api 重启时，已 spawn 的 child 进程是孤儿但仍占着 port + 持着 sqlite。
    // 之前会无差别 mark stopped → lifecycle worker 看到 stopped 就尝试再 spawn，
    // 撞上 EADDRINUSE 卡死。这里改成：能 ping 通就 reattach (in-memory 重新登记)，
    // 真死了才 mark stopped 让 worker 走重启流程。
    const localProcessInstances = await this.instanceRepo.find({
      where: { providerKey: this.key },
    });
    this.logger.log(
      `onModuleInit scanning ${localProcessInstances.length} local-process instance(s) for reattach`,
    );
    for (const instance of localProcessInstances) {
      const port = this.parsePersistedPort(instance);
      const pidRaw = instance.launchConfig?.pid;
      const pid =
        typeof pidRaw === "string" && pidRaw.trim()
          ? Number(pidRaw)
          : Number(pidRaw ?? 0);

      // 不论 powerState 是什么，先 probe pid+port；活着就 reattach。
      // 之前会 spawn 失败一次然后把 launchConfig.pid 改成新 pid，再重启时
      // 那个新 pid 已死，但 port 仍被原孤儿占着 → reattach 永远失败。这里
      // 改成只信端口存活：能 ping 通就直接当 running，pid 只用来后续 kill。
      // 必须带 instance.worldId：pingHealth 只信"端口能响应且 identity 匹配自家 world"。
      // 这一步以前只看 res.status < 500，结果 cloud-api 自己（孤儿）或别号 child 占了
      // 同端口都会被误判 healthy，导致 reattach 把 instance 标 running，但实际 spawn 不上来。
      const portHealthy =
        port && Number.isFinite(port) && port > 0
          ? await this.pingHealth(port, 1_500, instance.worldId)
          : false;

      this.logger.log(
        `instance world=${instance.worldId} powerState=${instance.powerState} port=${port} pid=${pid} pidAlive=${pid > 0 ? this.isPidAlive(pid) : "n/a"} portHealthy=${portHealthy}`,
      );

      if (portHealthy && port) {
        this.running.set(instance.worldId, {
          pid,
          port,
          child: null,
          startedAt: instance.bootstrappedAt ?? new Date(),
        });
        this.logger.log(
          `reattached to live local api child world=${instance.worldId} pid=${pid} port=${port}`,
        );
        if (instance.powerState !== "running") {
          instance.powerState = "running";
          instance.lastOperationAt = new Date();
          await this.instanceRepo.save(instance);
        }
      } else {
        // pingHealth 拒判但 pid 还活着 = 这是上一代 cloud-api 留下的孤儿 child
        // （比如升级到带 /identity 的版本之前 spawn 出来的）。必须主动收掉，否则它会
        // 继续持 sqlite + port，新 spawn 的 child 起来就成两个 writer 写同一个 db。
        if (pid > 0 && this.isPidAlive(pid)) {
          this.logger.warn(
            `reattach failed but pid=${pid} still alive for world=${instance.worldId}; evicting to free sqlite/port for fresh spawn.`,
          );
          await this.killPidGracefully(pid);
        }
        instance.powerState = "stopped";
        instance.lastOperationAt = new Date();
        await this.instanceRepo.save(instance);
      }
    }
  }

  private isPidAlive(pid: number) {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy() {
    const entries = Array.from(this.running.entries());
    this.running.clear();
    for (const [worldId, state] of entries) {
      // 我们 spawn 的 child（state.child != null）在 cloud-api 退出时 SIGTERM
      // 干净停掉；reattach 来的孤儿（state.child == null）保留运行，让 cloud-api
      // 下次重启 onModuleInit 通过 port-health probe 把它认领回去。这样短重启
      // 不会切断用户活跃 socket.io 连接 / 强制 sqlite checkpoint。
      if (!state.child) {
        this.logger.log(
          `leaving reattached local api child running for world=${worldId} pid=${state.pid} port=${state.port}`,
        );
        continue;
      }
      this.logger.log(
        `terminating local api child for world=${worldId} pid=${state.pid}`,
      );
      this.terminateChild(state);
    }
  }

  async createInstance(
    world: CloudWorldEntity,
  ): Promise<ProvisionWorldInstanceResult> {
    const accountDir = this.resolveAccountDir(world.phone);
    mkdirSync(accountDir, { recursive: true });

    // 注册新用户 → provision → spawnChild。即便 allocatePort 加了 OS 探活，仍可能撞上：
    // (1) 探活和 spawn 之间的 TOCTOU race
    // (2) child 启动早期因别的原因 exit (DB 锁 / 配置错 / OOM)
    // 之前没 retry，一撞就 job_failed → 用户的 world 永远卡在 status='failed'。
    // 现在最多换 3 次端口，并把撞过的端口加入 exclude 列表，防止下一次又拿到。
    const triedPorts = new Set<number>();
    let lastErr: unknown = null;
    let port = 0;
    let child: ChildProcess | null = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      port = await this.allocatePort(triedPorts);
      triedPorts.add(port);
      try {
        child = await this.spawnChild(world, port, accountDir);
        break;
      } catch (err) {
        lastErr = err;
        this.logger.warn(
          `createInstance: spawn failed for world=${world.id} on port=${port} (attempt=${attempt + 1}): ${(err as Error).message}; will try a fresh port`,
        );
      }
    }
    if (!child) {
      throw lastErr instanceof Error
        ? lastErr
        : new Error("createInstance: spawn exhausted retries");
    }
    this.running.set(world.id, {
      pid: child.pid ?? 0,
      port,
      child,
      startedAt: new Date(),
    });

    return {
      providerKey: this.key,
      providerInstanceId: `local-process-${randomUUID()}`,
      providerVolumeId: accountDir,
      providerSnapshotId: null,
      region: world.providerRegion ?? this.summary.defaultRegion ?? "local",
      zone: world.providerZone ?? this.summary.defaultZone ?? "local-a",
      privateIp: "127.0.0.1",
      publicIp: null,
      apiBaseUrl: `http://127.0.0.1:${port}`,
      adminUrl: null,
      imageId: null,
      flavor: "local-process",
      diskSizeGb: 0,
      launchConfig: {
        port: String(port),
        pid: String(child.pid ?? ""),
        accountDir,
      },
    };
  }

  async startInstance(
    instance: CloudInstanceEntity,
    world: CloudWorldEntity,
  ): Promise<WorldInstancePowerTransitionResult> {
    const existing = this.running.get(world.id);
    if (existing && this.isAlive(existing)) {
      return {
        powerState: "running",
        providerSnapshotId: null,
        apiBaseUrl: `http://127.0.0.1:${existing.port}`,
      };
    }

    // 先信任持久化的 port — 大部分时候它是空的（创建时就停了）或仍然属于本 world。
    // 但 startInstance 是 lifecycle worker 重试入口，撞 EADDRINUSE 时之前会反复 spawn-exit
    // 死循环。这里 spawn 失败后清掉脏 port 再 fallback 到 allocatePort 重试，让冲突状态自愈。
    const persistedPort = this.parsePersistedPort(instance);
    let port = persistedPort ?? (await this.allocatePort());
    const accountDir = this.resolveAccountDir(world.phone);
    mkdirSync(accountDir, { recursive: true });

    let child: ChildProcess;
    try {
      child = await this.spawnChild(world, port, accountDir);
    } catch (err) {
      if (!(persistedPort && port === persistedPort)) {
        throw err;
      }
      this.logger.warn(
        `spawn on persisted port=${port} failed for world=${world.id}: ${(err as Error).message}; trying to evict stale child and retry`,
      );
      const stalePid = this.parsePersistedPid(instance);
      if (stalePid > 0 && this.isPidAlive(stalePid)) {
        await this.killPidGracefully(stalePid);
      }
      try {
        child = await this.spawnChild(world, port, accountDir);
      } catch (retryErr) {
        this.logger.warn(
          `retry on same port=${port} still failed: ${(retryErr as Error).message}; falling back to a fresh port`,
        );
        port = await this.allocatePort();
        child = await this.spawnChild(world, port, accountDir);
      }
    }
    this.running.set(world.id, {
      pid: child.pid ?? 0,
      port,
      child,
      startedAt: new Date(),
    });

    instance.launchConfig = {
      ...(instance.launchConfig ?? {}),
      port: String(port),
      pid: String(child.pid ?? ""),
      accountDir,
    };

    return {
      powerState: "running",
      providerSnapshotId: null,
      apiBaseUrl: `http://127.0.0.1:${port}`,
    };
  }

  async stopInstance(
    _instance: CloudInstanceEntity,
    world: CloudWorldEntity,
  ): Promise<WorldInstancePowerTransitionResult> {
    const state = this.running.get(world.id);
    if (state) {
      this.running.delete(world.id);
      this.terminateChild(state);
    }
    // child 已死，apiBaseUrl 不能继续指着这个被释放的端口——下次别的 world
    // 复用同一个端口时就会串台（见 worlds-page "Enter admin" 的 bootstrap 路径）。
    return { powerState: "stopped", providerSnapshotId: null, apiBaseUrl: null };
  }

  async inspectInstance(
    instance: CloudInstanceEntity | null,
    world: CloudWorldEntity,
  ): Promise<InspectWorldInstanceResult> {
    const state = this.running.get(world.id);
    let deploymentState: InspectWorldInstanceResult["deploymentState"];
    let rawStatus: string;

    if (state && this.isAlive(state)) {
      // 带 world.id 做身份校验，避免别号 child 占了同端口后 reconcile 误判 running。
      const healthy = await this.pingHealth(state.port, 1_500, world.id);
      deploymentState = healthy ? "running" : "starting";
      rawStatus = healthy ? "running" : "starting";
    } else if (instance && instance.powerState === "stopped") {
      deploymentState = "stopped";
      rawStatus = "stopped";
    } else if (instance) {
      deploymentState = "missing";
      rawStatus = "absent";
    } else {
      deploymentState = "missing";
      rawStatus = "absent";
    }

    return {
      providerKey: this.key,
      deploymentMode: this.summary.deploymentMode,
      executorMode: "child-process",
      remoteHost: "localhost",
      remoteDeployPath: this.resolveAccountDir(world.phone),
      projectName: world.slug ?? world.id,
      containerName: state ? `local-api-${world.phone}-${state.port}` : null,
      deploymentState,
      providerMessage: state
        ? `Local api child running on port ${state.port}.`
        : "No local api child is currently registered for this world.",
      rawStatus,
    };
  }

  private resolveAccountDir(phone: string) {
    const sanitized = phone.replace(/[^a-zA-Z0-9_-]+/g, "");
    if (!sanitized) {
      throw new Error(`Cannot derive account dir from phone "${phone}"`);
    }
    return path.join(ACCOUNTS_ROOT, sanitized);
  }

  private async allocatePort(extraExcluded?: Iterable<number>): Promise<number> {
    const used = new Set<number>();
    for (const state of this.running.values()) {
      used.add(state.port);
    }
    // 还要算上 DB 里其他 instance 持久化的端口 — 即使它们当前 stopped、不在 running map，
    // 它们的 port 也可能被外部进程（孤儿 child / 老 cloud-api / 重启没回收的 child）占着。
    // 之前只看 in-memory running，导致多个 instance 在 DB 里登记同一个 port，撞起来就死循环。
    try {
      const allForProvider = await this.instanceRepo.find({
        where: { providerKey: this.key },
      });
      for (const inst of allForProvider) {
        const p = this.parsePersistedPort(inst);
        if (p) used.add(p);
      }
    } catch (err) {
      this.logger.warn(
        `allocatePort: failed to scan persisted ports, falling back to in-memory only: ${(err as Error).message}`,
      );
    }
    // 防御：world.apiBaseUrl 也可能挂着尚未清掉的端口（历史上 sleep 不清 apiBaseUrl，
    // 导致两条 world 记录指向同一个 child，云控制台"进入后台"会串台）。即使现在
    // 已经在 sleep/stop 时清了，旧数据 + 其他 provider 写入路径也可能留下脏值，
    // 这里再扫一遍兜底。
    try {
      const allWorlds = await this.worldRepo.find({
        select: ["apiBaseUrl"],
      });
      for (const w of allWorlds) {
        const p = parsePortFromApiBaseUrl(w.apiBaseUrl);
        if (p) used.add(p);
      }
    } catch (err) {
      this.logger.warn(
        `allocatePort: failed to scan world apiBaseUrls: ${(err as Error).message}`,
      );
    }
    if (extraExcluded) {
      for (const p of extraExcluded) used.add(p);
    }
    // 端口探活：DB 不知道但 OS 实际占用的端口（leaked child / 老 cloud-api 残留 / 别的进程
    // 借用了我们的端口段）跳过。之前只看 DB，新用户注册时 createInstance 拿到孤儿占用的
    // 端口 → spawn 立刻 EADDRINUSE → provision 直接 failed，无法自愈。
    let port = this.basePort;
    let probedSkips = 0;
    const SKIP_CAP = 256;
    while (true) {
      if (!used.has(port)) {
        const inUse = await this.isPortOccupied(port);
        if (!inUse) return port;
        probedSkips += 1;
        this.logger.warn(
          `allocatePort: port=${port} unknown to DB but OS-bound (leaked process?); skipping`,
        );
        used.add(port);
        if (probedSkips >= SKIP_CAP) {
          throw new Error(
            `allocatePort: skipped ${SKIP_CAP} OS-bound unknown ports starting from ${this.basePort}; refuse to keep scanning`,
          );
        }
      }
      port += 1;
    }
  }

  // OS-level 端口探活：尝试 bind 看是否被占。child 进程用 Node 默认 dual-stack 监听，
  // 这里也走默认 host（不指定）确保覆盖 v4/v6 都占着的端口。
  private isPortOccupied(port: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const server = net.createServer();
      const done = (occupied: boolean) => {
        try {
          server.close();
        } catch {
          /* ignore */
        }
        resolve(occupied);
      };
      server.once("error", (err: NodeJS.ErrnoException) => {
        // EADDRINUSE / EACCES = 别人在用 / 内核不让 bind，都视作占用
        done(
          err.code === "EADDRINUSE" ||
            err.code === "EACCES" ||
            err.code === "EADDRNOTAVAIL",
        );
      });
      server.once("listening", () => {
        server.close(() => resolve(false));
      });
      try {
        server.listen(port);
      } catch {
        resolve(true);
      }
    });
  }

  private parsePersistedPort(instance: CloudInstanceEntity | null) {
    const raw = instance?.launchConfig?.port;
    if (typeof raw !== "string") return null;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private parsePersistedPid(instance: CloudInstanceEntity | null) {
    const raw = instance?.launchConfig?.pid;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
    if (typeof raw !== "string") return 0;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  // SIGTERM 给 ~3s 优雅退出，超时 SIGKILL。多用于 reattach 失败但 pid 还活着的孤儿 child —
  // 必须让它先死，否则新 child 起来会和它一起写同一个 sqlite。
  private async killPidGracefully(pid: number) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // already dead or no permission — fall through to existence check
    }
    for (let i = 0; i < 30; i += 1) {
      if (!this.isPidAlive(pid)) return;
      await this.sleep(100);
    }
    if (this.isPidAlive(pid)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // ignore
      }
      await this.sleep(200);
    }
  }

  // 把 cloud-api 算出的 minimax key 写进 world DB 的 inference_provider_accounts.
  // 文本生成走 inference.service → providerRepo.findOneBy，读 DB 而不是 env；
  // 不同步会一直用最初 seed 的那把固定单 key（历史问题：所有 world 都被灌成
  // process.env.MINIMAX_API_KEY 兜底值）。
  //
  // 行为：
  //   - row 不存在（provider_minimax 还没被 seed）→ 静默跳过，不创建
  //   - row 已经是同一把 key → 不写（避免无谓改 updatedAt 和触发 WAL 写）
  //   - 加密 secret 没设置 → fallback 到 plain:<key>（与 api 的 encodeSecret 一致）
  //
  // 在 spawn child **之前**调用，此时 child 不持库；后续 child 启动后再读 DB
  // 拿到的就是新 key。已运行的 child 改库后下次 findOneBy 就能读到（TypeORM
  // 那条路径无内存缓存）。
  private syncProviderMinimaxKey(
    accountDir: string,
    targetKey: string,
    worldId: string,
  ): void {
    const dbPath = path.join(accountDir, "database.sqlite");
    if (!existsSync(dbPath)) {
      return;
    }
    let db: BetterSqlite3.Database | null = null;
    try {
      db = new BetterSqlite3(dbPath);
      const hasTable = db
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name='inference_provider_accounts'",
        )
        .get();
      if (!hasTable) return;
      const row = db
        .prepare(
          "SELECT apiKeyEncrypted, ttsApiKeyEncrypted, imageGenerationApiKeyEncrypted FROM inference_provider_accounts WHERE id = 'provider_minimax'",
        )
        .get() as
        | {
            apiKeyEncrypted: string | null;
            ttsApiKeyEncrypted: string | null;
            imageGenerationApiKeyEncrypted: string | null;
          }
        | undefined;
      if (!row) return;

      const decode = (stored: string | null) => {
        if (!stored) return "";
        const t = stored.trim();
        if (t.startsWith("plain:")) return t.slice(6).trim();
        // enc:<envelope> 无法在不持有 secret 时解；保守视为不同，触发改写。
        // legacy bare value 直接当明文比对。
        if (t.startsWith("enc:")) return "__enc_opaque__";
        return t;
      };

      const needApi = decode(row.apiKeyEncrypted) !== targetKey;
      const needTts = decode(row.ttsApiKeyEncrypted) !== targetKey;
      const needImg = decode(row.imageGenerationApiKeyEncrypted) !== targetKey;
      if (!needApi && !needTts && !needImg) {
        return;
      }

      const sets: string[] = [];
      const params: Record<string, string> = {
        now: new Date().toISOString(),
      };
      if (needApi) {
        sets.push("apiKeyEncrypted = @apiEnc");
        params.apiEnc = this.encodeMinimaxSecret(targetKey);
      }
      if (needTts) {
        sets.push("ttsApiKeyEncrypted = @ttsEnc");
        params.ttsEnc = this.encodeMinimaxSecret(targetKey);
      }
      if (needImg) {
        sets.push("imageGenerationApiKeyEncrypted = @imgEnc");
        params.imgEnc = this.encodeMinimaxSecret(targetKey);
      }
      sets.push("updatedAt = @now");
      db.prepare(
        `UPDATE inference_provider_accounts SET ${sets.join(", ")} WHERE id = 'provider_minimax'`,
      ).run(params);
      this.logger.log(
        `synced provider_minimax apiKey for world=${worldId} → …${targetKey.slice(-4)} cols=[${[
          needApi ? "api" : null,
          needTts ? "tts" : null,
          needImg ? "img" : null,
        ]
          .filter(Boolean)
          .join(",")}]`,
      );
    } catch (err) {
      this.logger.warn(
        `syncProviderMinimaxKey failed for world=${worldId}: ${(err as Error)?.message}`,
      );
    } finally {
      db?.close();
    }
  }

  // 与 api/src/modules/inference/inference.service.ts:encodeSecret + api-key-crypto.ts
  // 对齐：有 USER_API_KEY_ENCRYPTION_SECRET → AES-256-GCM；没有 → plain:。
  private encodeMinimaxSecret(value: string): string {
    const secret = process.env.USER_API_KEY_ENCRYPTION_SECRET?.trim();
    if (!secret) {
      return `plain:${value}`;
    }
    try {
      const key = createHash("sha256").update(secret).digest();
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const encrypted = Buffer.concat([
        cipher.update(value, "utf8"),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();
      const envelope = JSON.stringify({
        v: 1,
        iv: iv.toString("base64"),
        tag: tag.toString("base64"),
        value: encrypted.toString("base64"),
      });
      return `enc:${envelope}`;
    } catch {
      return `plain:${value}`;
    }
  }

  private isAlive(state: RunningChild) {
    if (state.child) {
      if (!state.child.pid) return false;
      if (state.child.exitCode !== null) return false;
      return this.isPidAlive(state.child.pid);
    }
    // reattach 来的 state.pid 是从 launchConfig 拿到的，正常情况下是真实 listening pid
    // （onModuleInit 走 pingHealth 校验过 worldId）。如果 pid 已经死了，必须如实返回
    // false，让 inspectInstance 落到 stopped/missing 分支并触发 reconcile 的 recovery
    // 任务，否则外部 SIGTERM 之后 cloud-api 会以为它还活着、永远等心跳，被卡住的
    // world 永远不会被重 spawn。
    if (!state.pid) return false;
    return this.isPidAlive(state.pid);
  }

  private async spawnChild(
    world: CloudWorldEntity,
    port: number,
    accountDir: string,
  ) {
    const bootstrap = buildWorldBootstrapConfig(world, this.configService);
    mkdirSync(LOG_DIR, { recursive: true });
    const outFd = openSync(
      path.join(LOG_DIR, `api-${world.phone}.out.log`),
      "a",
    );
    const errFd = openSync(
      path.join(LOG_DIR, `api-${world.phone}.err.log`),
      "a",
    );

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...bootstrap.env,
      PORT: String(port),
      YINJIE_DATA_ROOT: accountDir,
      DATABASE_PATH: path.join(accountDir, "database.sqlite"),
      CLOUD_PLATFORM_BASE_URL: resolveCloudPlatformBaseUrl(this.configService),
      PUBLIC_API_BASE_URL: `http://127.0.0.1:${port}`,
    };

    // MiniMax token plan 按 world 维度稳定 hash 分配。池为空时不注入，
    // child 自己读 api/.env 的 MINIMAX_API_KEY 兜底（向后兼容旧单 key 配置）。
    const minimaxPool = parseMinimaxKeyPool(
      this.configService.get<string>("MINIMAX_API_KEYS"),
      this.configService.get<string>("MINIMAX_API_KEY"),
    );
    const minimaxAlloc = pickMinimaxKey(world.id, minimaxPool);
    if (minimaxAlloc) {
      env.MINIMAX_API_KEY = minimaxAlloc.key;
      // 同步把 world 自己 DB 里 inference_provider_accounts.apiKey 改成本次分配的 key。
      // 文本生成走 inference.service → providerRepo.findOneBy，读的是 DB 而不是 env，
      // 不同步就会一直用最初 seed 的那把单 key（参考 scripts/migrate-to-minimax-tokenplan.mjs）。
      this.syncProviderMinimaxKey(accountDir, minimaxAlloc.key, world.id);
    }
    // 安全：child 只该看到自己分到的那个 key，整个池只属于 cloud-api 层。
    // 不删的话 ...process.env 会把全部 CSV 池泄露给 child env（/proc/PID/environ 可见）。
    delete env.MINIMAX_API_KEYS;

    // 算 per-world 日配额并注入 env：共享同一 key 的 N 个 world 公平分摊单 key 日限额；
    // 配额 < world 数时 dispatcher 做日轮换，保证每个 world 都能轮到。
    // dispatcher 对 pool=空 / myAlloc=null 有兜底逻辑，但底层 worldRepo.find() 仍可能
    // 抛 db 错误（连接异常等）—— catch 住后 child 走 fallback 限额。
    try {
      const share = await this.minimaxQuotaDispatcher.computeWorldDailyShare(world.id);
      env.MINIMAX_DAILY_LIMIT_HAILUO_FAST = String(share.hailuoFast);
      env.MINIMAX_DAILY_LIMIT_HAILUO = String(share.hailuo);
      env.MINIMAX_DAILY_LIMIT_MUSIC_26 = String(share.music26);
      env.MINIMAX_DAILY_LIMIT_MUSIC_25 = String(share.music25);
      env.MINIMAX_DAILY_LIMIT_IMAGE_01 = String(share.image01);
      env.MINIMAX_DAILY_LIMIT_LYRICS = String(share.lyrics);
      env.MINIMAX_DAILY_LIMIT_SPEECH_HD = String(share.speechHd);
      // 走查本次 R1：vlm-coding-plan / web-search 没注入 env → child 用 1800 / 200
      // fallback；N world 共享 key 时第一个 world 烧到 2056 才靠 cloud-sync 通知熔断，
      // 前面 N-1 world 各做一次必败请求。对齐 speechHd 同款 group-share 模型。
      env.MINIMAX_DAILY_LIMIT_VLM = String(share.vlmCodingPlan);
      env.MINIMAX_DAILY_LIMIT_WEB_SEARCH = String(share.webSearch);
      // "世界角色朋友圈自动配图"专用日上限（用途配额，仍占 image01 总额，
      // 但额外做"每个 world 不超过这个数"的限制，详见 MomentImageBudgetService）。
      env.FEED_IMAGE_WORLD_DAILY_SHARE = String(share.feedImage);
    } catch (err) {
      this.logger.warn(
        `compute minimax daily share failed for world=${world.id}: ${(err as Error)?.message}; child uses fallback limits`,
      );
    }

    this.logger.log(
      `spawning api child for phone=${world.phone} world=${world.id} port=${port} dir=${accountDir}` +
        (minimaxAlloc
          ? ` minimax-key=#${minimaxAlloc.index}/${minimaxAlloc.total} (…${minimaxAlloc.fingerprint})`
          : " minimax-key=<pool empty, child fallback>") +
        ` quota=hailuoFast:${env.MINIMAX_DAILY_LIMIT_HAILUO_FAST ?? "-"}/hailuo:${env.MINIMAX_DAILY_LIMIT_HAILUO ?? "-"}/music26:${env.MINIMAX_DAILY_LIMIT_MUSIC_26 ?? "-"}`,
    );

    const child = spawn(process.execPath, ["--enable-source-maps", API_DIST_ENTRY], {
      cwd: path.join(REPO_ROOT, "api"),
      env,
      stdio: ["ignore", outFd, errFd],
      detached: false,
      windowsHide: true,
    });

    child.on("exit", (code, signal) => {
      const previous = this.running.get(world.id);
      if (previous && previous.child === child) {
        this.running.delete(world.id);
      }
      this.logger.warn(
        `api child for world=${world.id} exited code=${code} signal=${signal}`,
      );
      void this.markInstanceStopped(world.id);
    });

    child.on("error", (err) => {
      this.logger.error(
        `failed to spawn api child for world=${world.id}: ${err.message}`,
      );
    });

    await this.waitForHealthy(port, child, world.id);
    // settle check：waitForHealthy 返回后再睡一小段，确认 child 不是因为 EADDRINUSE 之类
    // 在 health probe 通过之后才退出（spawn 早期 race：identity 通了的同时 server 因端口
    // 抢占失败 quit）。child 死了就把 spawn 整体算失败，让 startInstance 的重试分支兜住。
    await this.sleep(300);
    if (child.exitCode !== null) {
      throw new Error(
        `api child exited shortly after passing health check (code=${child.exitCode})`,
      );
    }
    return child;
  }

  private async waitForHealthy(
    port: number,
    child: ChildProcess,
    expectedWorldId: string,
  ) {
    const deadline = Date.now() + HEALTH_DEADLINE_MS;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(
          `api child exited before health check passed (code=${child.exitCode})`,
        );
      }
      if (await this.pingHealth(port, 1_000, expectedWorldId)) {
        return;
      }
      await this.sleep(HEALTH_POLL_INTERVAL_MS);
    }
    throw new Error(`api child on port ${port} did not become healthy in time`);
  }

  // expectedWorldId 必传时做严格身份校验（worldId 必须匹配）；不传时退化为"端口能响应
  // 且响应来自一个 world api（body 有 worldId 字段）"的弱判断。任何 cloud-api 自己（孤儿/
  // 当前实例）撞同端口都会因没有 /api/world/identity 路由返回 404 或不同 worldId，被这里拒绝。
  private async pingHealth(
    port: number,
    timeoutMs: number,
    expectedWorldId?: string,
  ) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/world/identity`, {
        method: "GET",
        signal: ctrl.signal,
      });
      if (res.status !== 200) return false;
      const body = (await res.json().catch(() => null)) as
        | { worldId?: unknown }
        | null;
      if (!body || typeof body.worldId !== "string" || !body.worldId) {
        return false;
      }
      if (expectedWorldId && body.worldId !== expectedWorldId) {
        return false;
      }
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  private terminateChild(state: RunningChild) {
    if (!state.pid) {
      return;
    }
    if (state.child && state.child.exitCode !== null) {
      return;
    }
    if (!state.child && !this.isPidAlive(state.pid)) {
      return;
    }
    const sendSignal = (signal: NodeJS.Signals) => {
      if (state.child) {
        try {
          state.child.kill(signal);
        } catch (err) {
          this.logger.warn(
            `${signal} via child handle failed for pid=${state.pid}: ${(err as Error).message}`,
          );
        }
      } else {
        try {
          process.kill(state.pid, signal);
        } catch (err) {
          this.logger.warn(
            `${signal} via process.kill failed for pid=${state.pid}: ${(err as Error).message}`,
          );
        }
      }
    };
    sendSignal("SIGTERM");
    setTimeout(() => {
      const stillAlive = state.child
        ? state.child.exitCode === null
        : this.isPidAlive(state.pid);
      if (stillAlive) {
        sendSignal("SIGKILL");
      }
    }, STOP_GRACE_MS).unref?.();
  }

  private async markInstanceStopped(worldId: string) {
    try {
      const instance = await this.instanceRepo.findOne({ where: { worldId } });
      if (!instance) return;
      if (instance.powerState !== "stopped") {
        instance.powerState = "stopped";
        instance.lastOperationAt = new Date();
        await this.instanceRepo.save(instance);
      }
    } catch (err) {
      this.logger.warn(
        `failed to mark instance stopped for world=${worldId}: ${(err as Error).message}`,
      );
    }
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
// i18n-ignore-end
