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
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, openSync } from "node:fs";
import path from "node:path";
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
    const port = await this.allocatePort();
    const accountDir = this.resolveAccountDir(world.phone);
    mkdirSync(accountDir, { recursive: true });

    const child = await this.spawnChild(world, port, accountDir);
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
      return { powerState: "running", providerSnapshotId: null };
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

    return { powerState: "running", providerSnapshotId: null };
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
    return { powerState: "stopped", providerSnapshotId: null };
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

  private async allocatePort(): Promise<number> {
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
    let port = this.basePort;
    while (used.has(port)) {
      port += 1;
    }
    return port;
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

  private isAlive(state: RunningChild) {
    if (state.child) {
      if (!state.child.pid) return false;
      if (state.child.exitCode !== null) return false;
      return this.isPidAlive(state.child.pid);
    }
    // reattach 来的 state.pid 是从 launchConfig 拿到的，可能是上一次失败 spawn
    // 留下的死 pid（端口实际被原孤儿占着，但我们没法分辨真实 listen pid）。
    // 这里信 in-memory 登记本身，让 inspectInstance 的 pingHealth 在每次反代
    // 请求前再判端口活否；spawn 失败时 child.on('exit') 会自己清掉登记。
    return true;
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
