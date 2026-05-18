import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminAuthService } from "../auth/admin-auth.service";
import { AdminGuard } from "../auth/admin.guard";
import { CloudAdminSessionEntity } from "../entities/cloud-admin-session.entity";
import { CloudMinimaxCallHourlyEntity } from "../entities/cloud-minimax-call-hourly.entity";
import { CloudMinimaxQuotaExhaustionEntity } from "../entities/cloud-minimax-quota-exhaustion.entity";
import { CloudUserEntity } from "../entities/cloud-user.entity";
import { CloudWorldEntity } from "../entities/cloud-world.entity";
import { ClientTelemetryDailyEntity } from "../entities/client-telemetry-daily.entity";
import { ClientTelemetryEventEntity } from "../entities/client-telemetry-event.entity";
import { MinimaxQuotaExhaustionRuntimeController } from "./minimax-quota-exhaustion-runtime.controller";
import { MinimaxQuotaExhaustionService } from "./minimax-quota-exhaustion.service";
import { MinimaxUsageRuntimeController } from "./minimax-usage-runtime.controller";
import { MinimaxUsageService } from "./minimax-usage.service";
import { TelemetryAdminController } from "./telemetry-admin.controller";
import { TelemetryAggregatorService } from "./telemetry-aggregator.service";
import { TelemetryPublicController } from "./telemetry-public.controller";
import { TelemetryService } from "./telemetry.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClientTelemetryEventEntity,
      ClientTelemetryDailyEntity,
      CloudAdminSessionEntity,
      CloudUserEntity,
      CloudWorldEntity,
      CloudMinimaxCallHourlyEntity,
      CloudMinimaxQuotaExhaustionEntity,
    ]),
  ],
  controllers: [
    TelemetryPublicController,
    TelemetryAdminController,
    MinimaxUsageRuntimeController,
    MinimaxQuotaExhaustionRuntimeController,
  ],
  providers: [
    TelemetryService,
    TelemetryAggregatorService,
    MinimaxUsageService,
    MinimaxQuotaExhaustionService,
    AdminGuard,
    AdminAuthService,
  ],
  exports: [
    TelemetryService,
    MinimaxUsageService,
    MinimaxQuotaExhaustionService,
  ],
})
export class TelemetryModule {}
