import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CloudLoginAttemptEntity } from "../entities/cloud-login-attempt.entity";
import { CloudUserOAuthIdentityEntity } from "../entities/cloud-user-oauth-identity.entity";
import { CloudUserEntity } from "../entities/cloud-user.entity";
import { EmailVerificationSessionEntity } from "../entities/email-verification-session.entity";
import { PhoneVerificationSessionEntity } from "../entities/phone-verification-session.entity";
import { CloudClientAuthGuard } from "./cloud-client-auth.guard";
import { CloudMailService } from "./cloud-mail.service";
import { EmailAuthService } from "./email-auth.service";
import { GoogleAuthService } from "./google-auth.service";
import { MockEmailProviderService } from "./mock-email-provider.service";
import { MockSmsProviderService } from "./mock-sms-provider.service";
import { PasswordAuthService } from "./password-auth.service";
import { PhoneAuthService } from "./phone-auth.service";
import { ServiceTokenGuard } from "./service-token.guard";

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PhoneVerificationSessionEntity,
      EmailVerificationSessionEntity,
      CloudUserEntity,
      CloudUserOAuthIdentityEntity,
      CloudLoginAttemptEntity,
    ]),
  ],
  providers: [
    PhoneAuthService,
    EmailAuthService,
    GoogleAuthService,
    PasswordAuthService,
    CloudMailService,
    MockSmsProviderService,
    MockEmailProviderService,
    CloudClientAuthGuard,
    ServiceTokenGuard,
  ],
  exports: [
    PhoneAuthService,
    EmailAuthService,
    GoogleAuthService,
    PasswordAuthService,
    CloudMailService,
    MockSmsProviderService,
    MockEmailProviderService,
    CloudClientAuthGuard,
    ServiceTokenGuard,
  ],
})
export class CloudAuthCoreModule {}
