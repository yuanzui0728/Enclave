import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminGuard } from '../admin/admin.guard';
import { AuthModule } from '../auth/auth.module';
import { CharacterEntity } from '../characters/character.entity';
import { SystemConfigModule } from '../config/config.module';
import { MinimaxModule } from '../minimax/minimax.module';
import { InferenceAdminController } from './inference-admin.controller';
import { InferenceModelCatalogEntryEntity } from './inference-model-catalog-entry.entity';
import { InferenceProviderAccountEntity } from './inference-provider-account.entity';
import { InferenceService } from './inference.service';

@Module({
  imports: [
    AuthModule,
    SystemConfigModule,
    // MinimaxModule 注入 MinimaxQuotaService（admin TTS/image 诊断走 quota
    // 三步 + 2056 markExhausted；走查 yuanzui0728 R1）。MinimaxModule 已被
    // AiModule 间接 import，但 InferenceModule 在 AiModule 上游需要直接拿。
    MinimaxModule,
    TypeOrmModule.forFeature([
      CharacterEntity,
      InferenceProviderAccountEntity,
      InferenceModelCatalogEntryEntity,
    ]),
  ],
  controllers: [InferenceAdminController],
  providers: [AdminGuard, InferenceService],
  exports: [InferenceService],
})
export class InferenceModule {}
