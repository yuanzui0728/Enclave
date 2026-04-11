import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getDataSourceToken } from '@nestjs/typeorm';
import { seedCharacters } from './database/seed';
import { ensureAiRelationshipSeed } from './database/relationship-seed';
import { WorldOwnerService } from './modules/auth/world-owner.service';
import { SocialService } from './modules/social/social.service';

function resolveCorsOrigins() {
  const configuredOrigins = process.env.CORS_ALLOWED_ORIGINS
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!configuredOrigins?.length || configuredOrigins.includes('*')) {
    return true;
  }

  return configuredOrigins;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: resolveCorsOrigins(), credentials: true });
  app.setGlobalPrefix('api', { exclude: ['health'] });

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
