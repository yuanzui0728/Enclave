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
import { CloudWorldEntity } from "./entities/cloud-world.entity";
import { CloudWorldRequestEntity } from "./entities/cloud-world-request.entity";
import { PhoneVerificationSessionEntity } from "./entities/phone-verification-session.entity";

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
      entities: [PhoneVerificationSessionEntity, CloudWorldEntity, CloudWorldRequestEntity],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([PhoneVerificationSessionEntity, CloudWorldEntity, CloudWorldRequestEntity]),
  ],
  controllers: [CloudAuthController, CloudController, AdminCloudController],
  providers: [PhoneAuthService, MockSmsProviderService, CloudService, CloudClientAuthGuard, AdminGuard],
})
export class AppModule {}
