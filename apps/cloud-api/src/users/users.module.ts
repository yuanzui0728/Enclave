import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminAuthService } from "../auth/admin-auth.service";
import { AdminGuard } from "../auth/admin.guard";
import { CloudConfigModule } from "../cloud-config/cloud-config.module";
import { CloudAdminSessionEntity } from "../entities/cloud-admin-session.entity";
import { CloudUserEntity } from "../entities/cloud-user.entity";
import { CloudWorldEntity } from "../entities/cloud-world.entity";
import { InviteCodeEntity } from "../entities/invite-code.entity";
import { InviteRedemptionEntity } from "../entities/invite-redemption.entity";
import { UserSubscriptionEntity } from "../entities/user-subscription.entity";
import { InviteModule } from "../invite/invite.module";
import { SubscriptionModule } from "../subscription/subscription.module";
import { UsersAdminController } from "./users-admin.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CloudUserEntity,
      CloudWorldEntity,
      InviteCodeEntity,
      InviteRedemptionEntity,
      UserSubscriptionEntity,
      CloudAdminSessionEntity,
    ]),
    CloudConfigModule,
    SubscriptionModule,
    InviteModule,
  ],
  controllers: [UsersAdminController],
  providers: [UsersService, AdminGuard, AdminAuthService],
  exports: [UsersService],
})
export class UsersModule {}
