import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { ResolveWorldAccessRequest } from "@yinjie/contracts";
import { CloudClientAuthGuard } from "../auth/cloud-client-auth.guard";
import { WorldAccessService } from "./world-access.service";

type CloudRequest = {
  cloudPhone?: string;
};

@Controller("cloud/me/world-access")
@UseGuards(CloudClientAuthGuard)
export class WorldAccessController {
  constructor(private readonly worldAccessService: WorldAccessService) {}

  @Post("resolve")
  resolveWorldAccess(@Req() req: CloudRequest, @Body() body: ResolveWorldAccessRequest) {
    return this.worldAccessService.resolveWorldAccessByPhone(req.cloudPhone ?? "", body ?? {});
  }

  @Get("sessions/:sessionId")
  getWorldAccessSession(@Req() req: CloudRequest, @Param("sessionId") sessionId: string) {
    return this.worldAccessService.getWorldAccessSessionByPhone(req.cloudPhone ?? "", sessionId);
  }
}
