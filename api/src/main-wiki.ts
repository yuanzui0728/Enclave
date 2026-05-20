// i18n-ignore-start: server bootstrap, no user-facing strings.
//
// main-wiki.ts — wiki 独立进程入口。
//
// 与 main.ts 的差别：
//   - bootstrap WikiAppModule（而不是 AppModule），用独立的 wiki sqlite
//   - 端口从 env WIKI_PORT 读，默认 3500
//   - 跳过 WorldOwnerService.ensureSingleOwnerMigration —— wiki 用户体系里没有
//     world_owner，所有用户都是 wiki_member，跑这个 migration 会抛错
//   - 跳过 SocialService.ensureDefaultFriendships —— wiki 不需要默认好友关系
//   - 跳过 seedCharacters / ensureAiRelationshipSeed —— 这些是 chat 体验用的预设
//     角色，wiki 站点不需要；wiki 的角色全部从迁移脚本导入或用户编辑创建
//
// 启动方式：
//   MAIN_MODE=wiki WIKI_PORT=3500 WIKI_DATABASE_PATH=$(pwd)/data/wiki/wiki.sqlite \
//     YINJIE_DATA_ROOT=$(pwd)/data/wiki node api/dist/main-wiki.js
import * as express from 'express';
import * as path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { WikiAppModule } from './wiki-app.module';
import { resolveApiPath, resolveRepoPath } from './database/database-path';
import { AppErrorFilter } from './common/app-error.filter';

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
  // wiki 独立模式：在加载任何 Nest module 之前，把 YINJIE_DATA_ROOT 锁到 data/wiki，
  // 这样 wiki-avatar.service / resolveDataPath('wiki-avatars') 等会自动落到
  // data/wiki/wiki-avatars/ 而不是 data/accounts/<owner>/wiki-avatars/。
  if (!process.env.YINJIE_DATA_ROOT?.trim()) {
    process.env.YINJIE_DATA_ROOT = resolveRepoPath('data/wiki');
  }
  // 标记 MAIN_MODE 给下游 service 做兜底判断
  process.env.MAIN_MODE = process.env.MAIN_MODE || 'wiki';

  const app = await NestFactory.create(WikiAppModule, {
    bodyParser: false,
  });
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
  httpAdapter.get(
    '/health',
    (_req: unknown, res: { json: (v: object) => void }) => {
      res.json({ status: 'ok', service: 'wiki-api' });
    },
  );

  app.enableShutdownHooks();

  const port = Number(process.env.WIKI_PORT ?? process.env.PORT ?? 3500);
  await app.listen(port);
  console.log(
    `隐界 Wiki API standalone listening on port ${port} ` +
      `(DB=${process.env.WIKI_DATABASE_PATH ?? process.env.DATABASE_PATH ?? path.resolve(resolveRepoPath('data/wiki/wiki.sqlite'))})`,
  );
}
void bootstrap();
// i18n-ignore-end
