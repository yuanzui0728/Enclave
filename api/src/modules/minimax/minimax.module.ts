import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminGuard } from '../admin/admin.guard';
import { MinimaxClient } from './minimax.client';
import { MinimaxAssetStorage } from './minimax-asset.storage';
import { MinimaxQuotaEntity } from './minimax-quota.entity';
import { MinimaxQuotaController } from './minimax-quota.controller';
import { MinimaxQuotaCloudSyncService } from './minimax-quota-cloud-sync.service';
import { MinimaxQuotaService } from './minimax-quota.service';
import { MinimaxJobEntity } from './minimax-job.entity';
import { MinimaxJobService } from './minimax-job.service';
import { MinimaxUsageReporterService } from './minimax-usage-reporter.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([MinimaxQuotaEntity, MinimaxJobEntity]),
  ],
  controllers: [MinimaxQuotaController],
  providers: [
    AdminGuard,
    MinimaxClient,
    MinimaxAssetStorage,
    MinimaxQuotaService,
    MinimaxQuotaCloudSyncService,
    MinimaxJobService,
    MinimaxUsageReporterService,
  ],
  exports: [
    MinimaxClient,
    MinimaxAssetStorage,
    MinimaxQuotaService,
    MinimaxQuotaCloudSyncService,
    MinimaxJobService,
    MinimaxUsageReporterService,
  ],
})
export class MinimaxModule {}
