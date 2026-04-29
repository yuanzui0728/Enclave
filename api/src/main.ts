import * as express from 'express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getDataSourceToken } from '@nestjs/typeorm';
import { resolveApiPath } from './database/database-path';
import { seedCharacters } from './database/seed';
import { ensureAiRelationshipSeed } from './database/relationship-seed';
import { WorldOwnerService } from './modules/auth/world-owner.service';
import { SocialService } from './modules/social/social.service';

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
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));
  app.getHttpAdapter().getInstance().set('trust proxy', true);
  app.use(applyCorsHeaders);
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.use(
    '/api/character-assets',
    express.static(resolveApiPath('public/character-assets')),
  );

  // Health check endpoint for Docker / load balancer
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/health', (_req: unknown, res: { json: (v: object) => void }) => {
    res.json({ status: 'ok' });
  });

  // Run seed on startup
  const dataSource = app.get(getDataSourceToken());
  await seedCharacters(dataSource);
  await ensureAiRelationshipSeed(dataSource);
  const owner = await app.get(WorldOwnerService).ensureSingleOwnerMigration();
  await app.get(SocialService).ensureDefaultFriendships(owner.id);

  await app.listen(process.env.PORT ?? 3000);
  console.log(`隐界 API running on port ${process.env.PORT ?? 3000}`);
}
void bootstrap();
