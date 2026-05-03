import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminAuthService } from "../auth/admin-auth.service";
import { AdminGuard } from "../auth/admin.guard";
import { CloudAdminSessionEntity } from "../entities/cloud-admin-session.entity";
import { CloudUserEntity } from "../entities/cloud-user.entity";
import { InviteCodeEntity } from "../entities/invite-code.entity";
import { SubscriptionPlanEntity } from "../entities/subscription-plan.entity";
import { UserSubscriptionEntity } from "../entities/user-subscription.entity";
import { CloudConfigModule } from "../cloud-config/cloud-config.module";
import { SubscriptionAdminController } from "./subscription-admin.controller";
import { SubscriptionClientController } from "./subscription-client.controller";
import { SubscriptionInternalController } from "./subscription-internal.controller";
import { SubscriptionSchedulerService } from "./subscription-scheduler.service";
import { SubscriptionService } from "./subscription.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SubscriptionPlanEntity,
      UserSubscriptionEntity,
      CloudUserEntity,
      InviteCodeEntity,
      CloudAdminSessionEntity,
    ]),
    CloudConfigModule,
  ],
  controllers: [
    SubscriptionClientController,
    SubscriptionAdminController,
    SubscriptionInternalController,
  ],
  providers: [
    SubscriptionService,
    SubscriptionSchedulerService,
    AdminGuard,
    AdminAuthService,
  ],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
