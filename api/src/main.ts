import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getDataSourceToken } from '@nestjs/typeorm';
import { seedCharacters } from './database/seed';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: '*' });
  app.setGlobalPrefix('api');

  // Run seed on startup
  const dataSource = app.get(getDataSourceToken());
  await seedCharacters(dataSource);

  await app.listen(process.env.PORT ?? 3000);
  console.log(`隐界 API running on port ${process.env.PORT ?? 3000}`);
}
bootstrap();
