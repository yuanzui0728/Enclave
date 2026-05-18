// i18n-ignore-start: admin-only utility endpoint.
import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../auth/admin.guard";
import { IpRegionService, type IpRegionLookup } from "./ip-region.service";

@Controller("admin/cloud/ip-region")
@UseGuards(AdminGuard)
export class IpRegionController {
  constructor(private readonly ipRegion: IpRegionService) {}

  @Get(":ip")
  async resolve(@Param("ip") rawIp: string): Promise<IpRegionLookup> {
    return this.ipRegion.resolve(decodeURIComponent(rawIp));
  }
}
// i18n-ignore-end
