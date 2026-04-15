import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminCloudController } from "./admin/admin-cloud.controller";
import { AdminGuard } from "./auth/admin.guard";
import { CloudAuthController } from "./auth/cloud-auth.controller";
import { CloudClientAuthGuard } from "./auth/cloud-client-auth.guard";
import { MockSmsProviderService } from "./auth/mock-sms-provider.service";
import { PhoneAuthService } from "./auth/phone-auth.service";
import { CloudController } from "./cloud/cloud.controller";
import { CloudService } from "./cloud/cloud.service";
import { CloudInstanceEntity } from "./entities/cloud-instance.entity";
import { CloudWorldEntity } from "./entities/cloud-world.entity";
import { CloudWorldRequestEntity } from "./entities/cloud-world-request.entity";
import { PhoneVerificationSessionEntity } from "./entities/phone-verification-session.entity";
import { WorldAccessSessionEntity } from "./entities/world-access-session.entity";
import { WorldLifecycleJobEntity } from "./entities/world-lifecycle-job.entity";
import { MockComputeProviderService } from "./orchestration/mock-compute-provider.service";
import { WorldLifecycleWorkerService } from "./orchestration/world-lifecycle-worker.service";
import { WorldRuntimeController } from "./runtime-callbacks/world-runtime.controller";
import { WorldRuntimeService } from "./runtime-callbacks/world-runtime.service";
import { WorldAccessController } from "./world-access/world-access.controller";
import { WorldAccessService } from "./world-access/world-access.service";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({
      global: true,
      secret: process.env.CLOUD_JWT_SECRET ?? "yinjie-cloud-jwt-secret",
      signOptions: {
        expiresIn: (process.env.CLOUD_AUTH_TOKEN_TTL ?? "7d") as never,
      },
    }),
    TypeOrmModule.forRoot({
      type: "better-sqlite3",
      database: process.env.CLOUD_DATABASE_PATH ?? "cloud-platform.sqlite",
      entities: [
        PhoneVerificationSessionEntity,
        CloudWorldEntity,
        CloudWorldRequestEntity,
        CloudInstanceEntity,
        WorldAccessSessionEntity,
        WorldLifecycleJobEntity,
      ],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([
      PhoneVerificationSessionEntity,
      CloudWorldEntity,
      CloudWorldRequestEntity,
      CloudInstanceEntity,
      WorldAccessSessionEntity,
      WorldLifecycleJobEntity,
    ]),
  ],
  controllers: [
    CloudAuthController,
    CloudController,
    AdminCloudController,
    WorldAccessController,
    WorldRuntimeController,
  ],
  providers: [
    PhoneAuthService,
    MockSmsProviderService,
    CloudService,
    CloudClientAuthGuard,
    AdminGuard,
    WorldAccessService,
    MockComputeProviderService,
    WorldLifecycleWorkerService,
    WorldRuntimeService,
  ],
})
export class AppModule {}
