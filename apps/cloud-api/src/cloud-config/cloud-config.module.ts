import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminAuthService } from "../auth/admin-auth.service";
import { AdminGuard } from "../auth/admin.guard";
import { CloudAdminSessionEntity } from "../entities/cloud-admin-session.entity";
import { CloudConfigEntity } from "../entities/cloud-config.entity";
import { CloudConfigAdminController } from "./cloud-config-admin.controller";
import { CloudConfigService } from "./cloud-config.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([CloudConfigEntity, CloudAdminSessionEntity]),
  ],
  controllers: [CloudConfigAdminController],
  providers: [CloudConfigService, AdminGuard, AdminAuthService],
  exports: [CloudConfigService],
})
export class CloudConfigModule {}
