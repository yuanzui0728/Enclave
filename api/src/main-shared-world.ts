// 必须是第一个 import：在任何实体文件被求值之前设好 MAIN_MODE（实体复合主键按它定形，
// 见 shared-world-mode.ts / tenant-entity.ts）。TenantContextMiddleware / subscriber /
// getOwnerOrThrow 也靠 isSharedWorldMode() 切行为。
import './shared-world-mode';
import './proxy-bootstrap';
import * as express from 'express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { resolveApiPath } from './database/database-path';
import { AppErrorFilter } from './common/app-error.filter';

// i18n-ignore-start: data / seed / preset content — not user-facing UI.
// 共享 world 进程入口：一个进程 + 一个共享库服务所有用户（多租户）。与 LPP 每用户进程
// (main.ts) 并行存在。cloud-api 把 opted-in 用户的请求反代到这里，并注入受信头
// x-cloud-user-phone；TenantContextMiddleware 据此建租户帧。
//
// 与 main.ts 的差别：
//   - 设 MAIN_MODE=shared-world（启用 ALS 租户隔离 + 写/读守卫）
//   - **不跑任何全局 boot 种子**：characters / ai_relationship / character_friendship /
//     ensureDefaultFriendships 等全部改由首触 ensureTenant→seedNewOwner 按 owner 懒跑
//     （避免写 NULL-owner 全局 junk + 撞写守卫 TENANT_WRITE_WITHOUT_CONTEXT + 单 owner 假设）
//   - 只绑 loopback：受信头 x-cloud-user-phone 的信任边界依赖「只能经 cloud-api 反代进来」
function resolveConfiguredCorsOrigins() {
  return process.env.CORS_ALLOWED_ORIGINS
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function resolveAllowedCorsOrigin(origin: string | undefined) {
  const configuredOrigins = resolveConfiguredCorsOrigins();

  if (
    origin === 'http://localhost' ||
    origin === 'https://localhost' ||
    origin?.startsWith('http://localhost:') ||
    origin?.startsWith('https://localhost:')
  ) {
    return origin;
  }

  if (!configuredOrigins?.length || configuredOrigins.includes('*')) {
    return origin ?? '*';
  }

  return origin && configuredOrigins.includes(origin) ? origin : undefined;
}

function applyCorsHeaders(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const requestOrigin = req.headers.origin;
  const origin = typeof requestOrigin === 'string' ? requestOrigin : undefined;
  const allowedOrigin = resolveAllowedCorsOrigin(origin);

  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET,HEAD,PUT,PATCH,POST,DELETE',
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      req.headers['access-control-request-headers'] ?? 'Content-Type',
    );
    res.status(204).end();
    return;
  }

  next();
}

// 共享进程的爆炸半径 = 全体 owner。一个租户请求里逃逸出请求 Promise 链的异步错误
// （如静态文件流 onerror 回调里 throw、未 await 的 job 拒绝）若按默认行为崩进程，会让所有
// 在线用户一起掉线（LPP 下只崩一个 child）。这里兜底：记日志但不退出，把「全队 DoS」降级成
// 「单次请求失败 + 一条告警」。真正的修复仍在各调用点（如 moments 媒体已改预检不 throw）。
process.on('uncaughtException', (err) => {
  console.error('[shared-world] uncaughtException (kept alive):', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[shared-world] unhandledRejection (kept alive):', reason);
});

async function bootstrap() {
  const host = process.env.SHARED_WORLD_HOST ?? '127.0.0.1';
  // 信任边界：受信头只在 loopback 内可信（公网经 cloud-api 终结）。非 loopback 绑定时
  // 拒绝启动，避免 x-cloud-user-phone 被外网伪造直接冒充任意用户。
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
    throw new Error(
      `shared-world must bind loopback (got SHARED_WORLD_HOST=${host}); 受信头不可从外网伪造`,
    );
  }

  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));
  app.getHttpAdapter().getInstance().set('trust proxy', true);
  app.use(applyCorsHeaders);
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.useGlobalFilters(new AppErrorFilter());
  app.use(
    '/api/character-assets',
    express.static(resolveApiPath('public/character-assets'), {
      maxAge: '1d',
    }),
  );

  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/health', (_req: unknown, res: { json: (v: object) => void }) => {
    res.json({ status: 'ok', mode: 'shared-world' });
  });

  // 不在此跑任何全局种子：所有 owner 级数据（角色/关系/好友）都由首触 ensureTenant→
  // seedNewOwner 按 owner 懒跑。共享库的全局/平台数据（provider 目录、games 目录等）不靠
  // 这里的 boot 种子，由各自迁移/管理路径维护。
  app.enableShutdownHooks();

  // keep-alive 保活对齐 cloud-api 反代（world-api-proxy.service.ts 用 keepAlive Agent
  // 复用到本进程的连接）：Node http server 默认 keepAliveTimeout=5s，会先于反代回收热
  // 连接而 FIN 掉空闲 socket；反代下一拍（用户发消息 / 前端 ~30s 轮询）复用这条已被服务端
  // 关闭的 socket → ECONNRESET → 502 WORLD_UPSTREAM_UNAVAILABLE → App 误判「世界离线」
  // 弹重登（线上「一发消息就让重新登录」即此竞态）。把服务端空闲保活拉到 125s（> 反代
  // PROXY_IDLE_TIMEOUT_MS=120s、远大于前端轮询节奏），让反代永远是先关一方，消除 socket
  // 复用竞态。headersTimeout 须 > keepAliveTimeout（Node 约束）。
  const httpServer = app.getHttpServer();
  httpServer.keepAliveTimeout = 125_000;
  httpServer.headersTimeout = 130_000;

  // 默认 4100：避开 LPP 每用户 child 的端口区间（3010 起，规模上已用到 3100+）。
  const port = process.env.SHARED_WORLD_PORT ?? process.env.PORT ?? 4100;
  await app.listen(Number(port), host);
  console.log(`隐界 shared-world API running on ${host}:${port}`);
}
void bootstrap();
// i18n-ignore-end
