import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import { CloudClientAuthGuard } from "../auth/cloud-client-auth.guard";
import { ResolveWorldAccessDto } from "../http-dto/cloud-api.dto";
import { WorldAccessService } from "./world-access.service";

type CloudRequest = {
  cloudPhone?: string;
};

@Controller("cloud/me/world-access")
@UseGuards(CloudClientAuthGuard)
export class WorldAccessController {
  constructor(private readonly worldAccessService: WorldAccessService) {}

  @Post("resolve")
  resolveWorldAccess(@Req() req: CloudRequest, @Body() body: ResolveWorldAccessDto) {
    return this.worldAccessService.resolveWorldAccessByPhone(req.cloudPhone ?? "", body ?? {});
  }

  @Get("sessions/:sessionId")
  getWorldAccessSession(@Req() req: CloudRequest, @Param("sessionId", new ParseUUIDPipe()) sessionId: string) {
    return this.worldAccessService.getWorldAccessSessionByPhone(req.cloudPhone ?? "", sessionId);
  }
}
