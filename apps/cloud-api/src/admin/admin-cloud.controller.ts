import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { type CloudWorldLifecycleStatus, type CloudWorldRequestStatus } from "@yinjie/contracts";
import { AdminGuard } from "../auth/admin.guard";
import { CloudService } from "../cloud/cloud.service";

@Controller("admin/cloud")
@UseGuards(AdminGuard)
export class AdminCloudController {
  constructor(private readonly cloudService: CloudService) {}

  @Get("world-requests")
  listWorldRequests(@Query("status") status?: CloudWorldRequestStatus) {
    return this.cloudService.listRequests(status);
  }

  @Get("world-requests/:id")
  getWorldRequest(@Param("id") id: string) {
    return this.cloudService.getRequestById(id);
  }

  @Patch("world-requests/:id")
  updateWorldRequest(
    @Param("id") id: string,
    @Body()
    body: {
      phone?: string;
      worldName?: string;
      status?: CloudWorldRequestStatus;
      note?: string | null;
      apiBaseUrl?: string | null;
      adminUrl?: string | null;
    },
  ) {
    return this.cloudService.updateRequest(id, body);
  }

  @Get("worlds")
  listWorlds(@Query("status") status?: CloudWorldLifecycleStatus) {
    return this.cloudService.listWorlds(status);
  }

  @Get("worlds/:id")
  getWorld(@Param("id") id: string) {
    return this.cloudService.getWorldById(id);
  }

  @Patch("worlds/:id")
  updateWorld(
    @Param("id") id: string,
    @Body()
    body: {
      phone?: string;
      name?: string;
      status?: CloudWorldLifecycleStatus;
      apiBaseUrl?: string | null;
      adminUrl?: string | null;
      note?: string | null;
    },
  ) {
    return this.cloudService.updateWorld(id, body);
  }
}
