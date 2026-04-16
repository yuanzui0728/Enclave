import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type {
  CloudWorldLifecycleStatus,
  CloudWorldRequestStatus,
  WorldLifecycleJobStatus,
  WorldLifecycleJobType,
} from "@yinjie/contracts";
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

  @Get("providers")
  listProviders() {
    return this.cloudService.listProviders();
  }

  @Patch("worlds/:id")
  updateWorld(
    @Param("id") id: string,
    @Body()
    body: {
      phone?: string;
      name?: string;
      status?: CloudWorldLifecycleStatus;
      provisionStrategy?: string;
      providerKey?: string | null;
      providerRegion?: string | null;
      providerZone?: string | null;
      apiBaseUrl?: string | null;
      adminUrl?: string | null;
      note?: string | null;
    },
  ) {
    return this.cloudService.updateWorld(id, body);
  }

  @Get("jobs")
  listJobs(
    @Query("worldId") worldId?: string,
    @Query("status") status?: WorldLifecycleJobStatus,
    @Query("jobType") jobType?: WorldLifecycleJobType,
  ) {
    return this.cloudService.listJobs({
      worldId,
      status,
      jobType,
    });
  }

  @Get("jobs/:id")
  getJob(@Param("id") id: string) {
    return this.cloudService.getJobById(id);
  }

  @Get("worlds/:id/instance")
  getWorldInstance(@Param("id") id: string) {
    return this.cloudService.getWorldInstance(id);
  }

  @Get("worlds/:id/bootstrap-config")
  getWorldBootstrapConfig(@Param("id") id: string) {
    return this.cloudService.getWorldBootstrapConfig(id);
  }

  @Post("worlds/:id/resume")
  resumeWorld(@Param("id") id: string) {
    return this.cloudService.resumeWorld(id);
  }

  @Post("worlds/:id/suspend")
  suspendWorld(@Param("id") id: string) {
    return this.cloudService.suspendWorld(id);
  }

  @Post("worlds/:id/retry")
  retryWorld(@Param("id") id: string) {
    return this.cloudService.retryWorld(id);
  }

  @Post("worlds/:id/rotate-callback-token")
  rotateWorldCallbackToken(@Param("id") id: string) {
    return this.cloudService.rotateWorldCallbackToken(id);
  }
}
