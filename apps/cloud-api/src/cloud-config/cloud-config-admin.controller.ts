import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AdminGuard, type AdminRequest } from "../auth/admin.guard";
import { UpsertCloudConfigDto } from "../http-dto/cloud-api.dto";
import { CloudConfigService } from "./cloud-config.service";

@Controller("cloud/admin/configs")
@UseGuards(AdminGuard)
export class CloudConfigAdminController {
  constructor(private readonly configService: CloudConfigService) {}

  @Get()
  async list() {
    return this.configService.listAll();
  }

  @Post()
  async upsert(@Body() dto: UpsertCloudConfigDto, @Req() request: AdminRequest) {
    const updatedBy = request.cloudAdminSessionId
      ? `cloud-admin:${request.cloudAdminSessionId}`
      : "cloud-admin:secret";
    return this.configService.upsert(dto.key, dto.value, dto.description ?? undefined, updatedBy);
  }
}
