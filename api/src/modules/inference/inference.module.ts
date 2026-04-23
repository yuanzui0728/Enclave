import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminGuard } from '../admin/admin.guard';
import { AuthModule } from '../auth/auth.module';
import { CharacterEntity } from '../characters/character.entity';
import { SystemConfigModule } from '../config/config.module';
import { InferenceAdminController } from './inference-admin.controller';
import { InferenceModelCatalogEntryEntity } from './inference-model-catalog-entry.entity';
import { InferenceProviderAccountEntity } from './inference-provider-account.entity';
import { InferenceService } from './inference.service';

@Module({
  imports: [
    AuthModule,
    SystemConfigModule,
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
