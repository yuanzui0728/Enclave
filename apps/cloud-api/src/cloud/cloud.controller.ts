import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { CloudClientAuthGuard } from "../auth/cloud-client-auth.guard";
import { CreateWorldRequestDto } from "../http-dto/cloud-api.dto";
import { CloudService } from "./cloud.service";

type CloudRequest = {
  cloudPhone?: string;
};

@Controller("cloud/me")
@UseGuards(CloudClientAuthGuard)
export class CloudController {
  constructor(private readonly cloudService: CloudService) {}

  @Get("world")
  getWorld(@Req() req: CloudRequest) {
    return this.cloudService.getWorldLookupByPhone(req.cloudPhone ?? "");
  }

  @Post("world-requests")
  createWorldRequest(@Req() req: CloudRequest, @Body() body: CreateWorldRequestDto) {
    return this.cloudService.createWorldRequest(req.cloudPhone ?? "", body.worldName);
  }

  @Get("world-requests/latest")
  getLatestWorldRequest(@Req() req: CloudRequest) {
    return this.cloudService.getLatestRequestByPhone(req.cloudPhone ?? "");
  }
}
