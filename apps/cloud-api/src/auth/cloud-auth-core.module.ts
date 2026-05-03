import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PhoneVerificationSessionEntity } from "../entities/phone-verification-session.entity";
import { CloudClientAuthGuard } from "./cloud-client-auth.guard";
import { MockSmsProviderService } from "./mock-sms-provider.service";
import { PhoneAuthService } from "./phone-auth.service";
import { ServiceTokenGuard } from "./service-token.guard";

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([PhoneVerificationSessionEntity])],
  providers: [
    PhoneAuthService,
    MockSmsProviderService,
    CloudClientAuthGuard,
    ServiceTokenGuard,
  ],
  exports: [
    PhoneAuthService,
    MockSmsProviderService,
    CloudClientAuthGuard,
    ServiceTokenGuard,
  ],
})
export class CloudAuthCoreModule {}
