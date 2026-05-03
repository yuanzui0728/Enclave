import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminAuthService } from "../auth/admin-auth.service";
import { AdminGuard } from "../auth/admin.guard";
import { CloudConfigModule } from "../cloud-config/cloud-config.module";
import { CloudAdminSessionEntity } from "../entities/cloud-admin-session.entity";
import { CloudUserEntity } from "../entities/cloud-user.entity";
import { InviteCodeEntity } from "../entities/invite-code.entity";
import { InviteRedemptionEntity } from "../entities/invite-redemption.entity";
import { SubscriptionModule } from "../subscription/subscription.module";
import { InviteAdminController } from "./invite-admin.controller";
import { InviteClientController } from "./invite-client.controller";
import { InviteService } from "./invite.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InviteCodeEntity,
      InviteRedemptionEntity,
      CloudUserEntity,
      CloudAdminSessionEntity,
    ]),
    CloudConfigModule,
    forwardRef(() => SubscriptionModule),
  ],
  controllers: [InviteClientController, InviteAdminController],
  providers: [InviteService, AdminGuard, AdminAuthService],
  exports: [InviteService],
})
export class InviteModule {}
