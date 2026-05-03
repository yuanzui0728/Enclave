import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminCloudController } from "./admin/admin-cloud.controller";
import { CloudAlertNotifierService } from "./alerts/cloud-alert-notifier.service";
import { AdminAuthController } from "./auth/admin-auth.controller";
import { AdminAuthService } from "./auth/admin-auth.service";
import { AdminGuard } from "./auth/admin.guard";
import { CloudAuthController } from "./auth/cloud-auth.controller";
import { CloudAuthCoreModule } from "./auth/cloud-auth-core.module";
import { CloudController } from "./cloud/cloud.controller";
import { CloudService } from "./cloud/cloud.service";
import { CloudConfigModule } from "./cloud-config/cloud-config.module";
import { CloudRuntimeConfigValidator } from "./config/cloud-runtime-config.validator";
import { resolveCloudAuthTokenTtl, resolveCloudJwtSecret } from "./config/cloud-runtime-config";
import { buildCloudTypeOrmOptions, cloudEntities } from "./database/cloud-database.config";
import { InviteModule } from "./invite/invite.module";
import { MockComputeProviderService } from "./orchestration/mock-compute-provider.service";
import { WorldLifecycleWorkerService } from "./orchestration/world-lifecycle-worker.service";
import { ComputeProviderRegistryService } from "./providers/compute-provider-registry.service";
import { ManualDockerComputeProviderService } from "./providers/manual-docker-compute-provider.service";
import { ManualDockerRemoteExecutorService } from "./providers/manual-docker-remote-executor.service";
import { WorldRuntimeController } from "./runtime-callbacks/world-runtime.controller";
import { WorldRuntimeService } from "./runtime-callbacks/world-runtime.service";
import { SubscriptionModule } from "./subscription/subscription.module";
import { UsersModule } from "./users/users.module";
import { WorldAccessController } from "./world-access/world-access.controller";
import { WorldAccessService } from "./world-access/world-access.service";
import { WaitingSessionSyncService } from "./world-access/waiting-session-sync.service";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: resolveCloudJwtSecret(configService),
        signOptions: {
          expiresIn: resolveCloudAuthTokenTtl(configService) as never,
        },
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => buildCloudTypeOrmOptions(configService),
    }),
    TypeOrmModule.forFeature([...cloudEntities]),
    CloudAuthCoreModule,
    CloudConfigModule,
    SubscriptionModule,
    InviteModule,
    UsersModule,
  ],
  controllers: [
    AdminAuthController,
    CloudAuthController,
    CloudController,
    AdminCloudController,
    WorldAccessController,
    WorldRuntimeController,
  ],
  providers: [
    AdminAuthService,
    CloudAlertNotifierService,
    CloudService,
    AdminGuard,
    WorldAccessService,
    WaitingSessionSyncService,
    MockComputeProviderService,
    ManualDockerComputeProviderService,
    ManualDockerRemoteExecutorService,
    ComputeProviderRegistryService,
    CloudRuntimeConfigValidator,
    WorldLifecycleWorkerService,
    WorldRuntimeService,
  ],
})
export class AppModule {}
