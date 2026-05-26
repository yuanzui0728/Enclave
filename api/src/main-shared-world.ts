import './proxy-bootstrap';
// 必须在 NestFactory 之前标记 shared 模式：TenantContextMiddleware / subscriber /
// getOwnerOrThrow 都靠 isSharedWorldMode() 切行为。
process.env.MAIN_MODE = 'shared-world';
import * as express from 'express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getDataSourceToken } from '@nestjs/typeorm';
import { resolveApiPath } from './database/database-path';
import { seedCharacters } from './database/seed';
import { ensureAiRelationshipSeed } from './database/relationship-seed';
import { AppErrorFilter } from './common/app-error.filter';

// i18n-ignore-start: data / seed / preset content — not user-facing UI.
// 共享 world 进程入口：一个进程 + 一个共享库服务所有用户（多租户）。与 LPP 每用户进程
// (main.ts) 并行存在。cloud-api 把 opted-in 用户的请求反代到这里，并注入受信头
// x-cloud-user-phone；TenantContextMiddleware 据此建租户帧。
//
// 与 main.ts 的差别：
//   - 设 MAIN_MODE=shared-world（启用 ALS 租户隔离 + 写/读守卫）
//   - 只跑全局种子（characters / ai_relationship 全局表）；**不**跑 owner 级 boot 种子
//     （ensureSingleOwnerMigration / ensureDefaultFriendships）——那些改由首触 ensureTenant
//     时按 owner 懒跑（避免单 owner 假设 + 防 ensureSingleOwnerMigration 删全租户数据）
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

  // 仅全局种子（不依赖 owner）。owner 级种子改由首触懒跑（TenantService.ensureTenant）。
  const dataSource = app.get(getDataSourceToken());
  await seedCharacters(dataSource);
  await ensureAiRelationshipSeed(dataSource);

  app.enableShutdownHooks();

  const port = process.env.SHARED_WORLD_PORT ?? process.env.PORT ?? 3100;
  await app.listen(Number(port), host);
  console.log(`隐界 shared-world API running on ${host}:${port}`);
}
void bootstrap();
// i18n-ignore-end
