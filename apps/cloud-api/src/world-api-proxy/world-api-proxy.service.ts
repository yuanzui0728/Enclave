import * as http from "node:http";
import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CloudInstanceEntity } from "../entities/cloud-instance.entity";
import { CloudWorldEntity } from "../entities/cloud-world.entity";

export type WorldApiTarget = {
  host: string;
  port: number;
  worldId: string;
};

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

// 反代到 child world-api 的 HTTP Agent。原实现没指定 agent，Node 默认 agent
// 不开 keep-alive，每次 http.request 都新建 TCP / 三次握手 / 立刻 close，
// child api 端 TIME_WAIT 大量堆积，高并发下还可能耗尽本机临时端口。
// keep-alive + LIFO 调度让热连接复用；maxSockets 256 给单 host 大并发上限；
// 30s keep-alive 与 Node http server 默认空闲超时一致，不会被 server 提前关。
// 注：socket.io 走的是另一条 ws-proxy 路径（raw TCP pipe），不经过这个 Agent。
const upstreamAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30_000,
  maxSockets: 256,
  scheduling: "lifo",
});

@Injectable()
export class WorldApiProxyService {
  private readonly logger = new Logger(WorldApiProxyService.name);

  constructor(
    @InjectRepository(CloudWorldEntity)
    private readonly worldRepo: Repository<CloudWorldEntity>,
    @InjectRepository(CloudInstanceEntity)
    private readonly instanceRepo: Repository<CloudInstanceEntity>,
  ) {}

  async resolveTarget(phone: string): Promise<WorldApiTarget | null> {
    if (!phone) {
      return null;
    }

    const world = await this.worldRepo.findOne({ where: { phone } });
    if (!world) {
      return null;
    }

    if (world.status !== "ready" && world.status !== "active") {
      return null;
    }

    const instance = await this.instanceRepo.findOne({
      where: { worldId: world.id },
    });
    if (!instance || instance.powerState !== "running") {
      return null;
    }

    const launchConfig =
      typeof instance.launchConfig === "object" && instance.launchConfig
        ? (instance.launchConfig as Record<string, unknown>)
        : null;
    const portRaw = launchConfig?.port;
    const port = typeof portRaw === "string" ? Number(portRaw) : Number(portRaw ?? 0);
    if (!Number.isFinite(port) || port <= 0) {
      return null;
    }

    return { host: "127.0.0.1", port, worldId: world.id };
  }

  proxyHttp(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    target: WorldApiTarget,
    subPath: string,
    phone: string,
  ) {
    const startedAt = process.hrtime.bigint();
    const method = req.method ?? "GET";
    // 结构化 metric 行（cloud-api.out.log 可 grep/tail 拉到 prometheus / 日志栈）：
    // proxy_metric kind=http world=... phone=... method=... path=... status=... ms=...
    // 一切异步路径都不能 throw，否则会污染 hot path。
    const emitMetric = (status: number, errKind: string | null) => {
      const ms = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
      this.logger.log(
        `proxy_metric kind=http world=${target.worldId} phone=${phone} method=${method} path="${subPath.split("?")[0]}" status=${status} ms=${ms}${errKind ? ` err=${errKind}` : ""}`,
      );
    };

    const filteredHeaders: http.OutgoingHttpHeaders = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      const lower = key.toLowerCase();
      if (HOP_BY_HOP_HEADERS.has(lower)) continue;
      // 不把 cloud access token 透给 child world-api，避免它在日志里看到。
      if (lower === "authorization") continue;
      if (lower === "host") continue;
      filteredHeaders[key] = value;
    }
    filteredHeaders["host"] = `${target.host}:${target.port}`;

    const upstream = http.request(
      {
        host: target.host,
        port: target.port,
        method: req.method,
        path: subPath,
        headers: filteredHeaders,
        agent: upstreamAgent,
      },
      (upstreamRes) => {
        res.statusCode = upstreamRes.statusCode ?? 502;
        for (const [key, value] of Object.entries(upstreamRes.headers)) {
          if (value === undefined) continue;
          const lower = key.toLowerCase();
          if (HOP_BY_HOP_HEADERS.has(lower)) continue;
          res.setHeader(key, value);
        }
        upstreamRes.pipe(res);
        upstreamRes.on("end", () => emitMetric(res.statusCode, null));
        upstreamRes.on("error", () => emitMetric(res.statusCode, "upstream_stream"));
      },
    );

    upstream.on("error", (error) => {
      this.logger.warn(
        `world-api proxy upstream error world=${target.worldId} ${error instanceof Error ? error.message : String(error)}`,
      );
      if (!res.headersSent) {
        res.statusCode = 502;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(
          JSON.stringify({
            statusCode: 502,
            errorCode: "WORLD_UPSTREAM_UNAVAILABLE",
            message: "World instance upstream is currently unavailable.", // i18n-ignore-line: backend API error code
          }),
        );
      } else {
        res.destroy();
      }
      emitMetric(502, "upstream_connect");
    });

    req.on("aborted", () => {
      upstream.destroy();
      emitMetric(499, "client_aborted");
    });
    req.pipe(upstream);
  }
}
