import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AdminGuard } from "../auth/admin.guard";
import type { AdminRequest } from "../auth/admin.guard";
import { AdminAuthService } from "../auth/admin-auth.service";
import { CloudService } from "../cloud/cloud.service";
import {
  CreateAdminSessionSourceGroupRiskSnapshotDto,
  CreateAdminSessionSourceGroupSnapshotDto,
  ListAdminSessionSourceGroupsQueryDto,
  ListAdminSessionsQueryDto,
  ListJobsQueryDto,
  ListWaitingSessionSyncTasksQueryDto,
  ListWorldInstancesQueryDto,
  ListWorldRequestsQueryDto,
  MutateFailedWaitingSessionSyncTasksDto,
  MutateFilteredFailedWaitingSessionSyncTasksDto,
  RevokeAdminSessionSourceGroupDto,
  RevokeAdminSessionSourceGroupsByRiskDto,
  RevokeAdminSessionsByIdDto,
  RevokeFilteredAdminSessionsDto,
  ListWorldsQueryDto,
  UpdateWorldDto,
  UpdateWorldRequestDto,
} from "../http-dto/cloud-api.dto";

@Controller("admin/cloud")
@UseGuards(AdminGuard)
export class AdminCloudController {
  constructor(
    private readonly cloudService: CloudService,
    private readonly adminAuthService: AdminAuthService,
  ) {}

  @Get("world-requests")
  listWorldRequests(@Query() query: ListWorldRequestsQueryDto) {
    return this.cloudService.listRequests(query.status);
  }

  @Get("world-requests/:id")
  getWorldRequest(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.cloudService.getRequestById(id);
  }

  @Patch("world-requests/:id")
  updateWorldRequest(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: UpdateWorldRequestDto,
  ) {
    return this.cloudService.updateRequest(id, body);
  }

  @Get("worlds")
  listWorlds(@Query() query: ListWorldsQueryDto) {
    return this.cloudService.listWorlds(query.status);
  }

  @Get("instances")
  listWorldInstances(@Query() query: ListWorldInstancesQueryDto) {
    return this.cloudService.listWorldInstances(query.status);
  }

  @Get("drift-summary")
  getWorldDriftSummary() {
    return this.cloudService.getWorldDriftSummary();
  }

  @Get("worlds/:id")
  getWorld(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.cloudService.getWorldById(id);
  }

  @Get("providers")
  listProviders() {
    return this.cloudService.listProviders();
  }

  @Get("admin-sessions")
  listAdminSessions(
    @Req() request: AdminRequest,
    @Query() query: ListAdminSessionsQueryDto,
  ) {
    return this.adminAuthService.listSessions(request.cloudAdminSessionId, {
      status: query.status,
      revocationReason: query.revocationReason,
      currentOnly: query.currentOnly,
      query: query.query,
      sourceKey: query.sourceKey,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Post("admin-sessions/revoke")
  revokeAdminSessionsById(
    @Body() body: RevokeAdminSessionsByIdDto,
    @Req() request: AdminRequest,
  ) {
    return this.adminAuthService.revokeSessionsById(
      body.sessionIds,
      request.cloudAdminSessionId,
    );
  }

  @Get("admin-session-source-groups")
  listAdminSessionSourceGroups(
    @Req() request: AdminRequest,
    @Query() query: ListAdminSessionSourceGroupsQueryDto,
  ) {
    return this.adminAuthService.listSessionSourceGroups(
      request.cloudAdminSessionId,
      {
        status: query.status,
        revocationReason: query.revocationReason,
        currentOnly: query.currentOnly,
        query: query.query,
        sourceKey: query.sourceKey,
        riskLevel: query.riskLevel,
        sortBy: query.sortBy,
        sortDirection: query.sortDirection,
        page: query.page,
        pageSize: query.pageSize,
      },
    );
  }

  @Post("admin-session-source-groups/revoke")
  revokeAdminSessionSourceGroup(
    @Body() body: RevokeAdminSessionSourceGroupDto,
    @Req() request: AdminRequest,
  ) {
    return this.adminAuthService.revokeSessionSourceGroup(
      request.cloudAdminSessionId,
      {
        sourceKey: body.sourceKey,
        status: body.status,
        revocationReason: body.revocationReason,
        currentOnly: body.currentOnly,
        query: body.query,
      },
    );
  }

  @Post("admin-session-source-groups/snapshot")
  createAdminSessionSourceGroupSnapshot(
    @Body() body: CreateAdminSessionSourceGroupSnapshotDto,
    @Req() request: AdminRequest,
  ) {
    return this.adminAuthService.createSessionSourceGroupSnapshot(
      request.cloudAdminSessionId,
      {
        sourceKey: body.sourceKey,
        status: body.status,
        revocationReason: body.revocationReason,
        currentOnly: body.currentOnly,
        query: body.query,
      },
    );
  }

  @Post("admin-session-source-groups/risk-snapshot")
  createAdminSessionSourceGroupRiskSnapshot(
    @Body() body: CreateAdminSessionSourceGroupRiskSnapshotDto,
    @Req() request: AdminRequest,
  ) {
    return this.adminAuthService.createSessionSourceGroupRiskSnapshot(
      request.cloudAdminSessionId,
      {
        status: body.status,
        revocationReason: body.revocationReason,
        currentOnly: body.currentOnly,
        query: body.query,
        sourceKey: body.sourceKey,
        riskLevel: body.riskLevel,
      },
    );
  }

  @Post("admin-session-source-groups/revoke-risk")
  revokeAdminSessionSourceGroupsByRisk(
    @Body() body: RevokeAdminSessionSourceGroupsByRiskDto,
    @Req() request: AdminRequest,
  ) {
    return this.adminAuthService.revokeSessionSourceGroupsByRisk(
      request.cloudAdminSessionId,
      {
        status: body.status,
        revocationReason: body.revocationReason,
        currentOnly: body.currentOnly,
        query: body.query,
        sourceKey: body.sourceKey,
        riskLevel: body.riskLevel,
      },
    );
  }

  @Post("admin-sessions/revoke-filtered")
  revokeFilteredAdminSessions(
    @Body() body: RevokeFilteredAdminSessionsDto,
    @Req() request: AdminRequest,
  ) {
    return this.adminAuthService.revokeFilteredSessions(
      request.cloudAdminSessionId,
      {
        status: body.status,
        revocationReason: body.revocationReason,
        currentOnly: body.currentOnly,
        query: body.query,
        sourceKey: body.sourceKey,
      },
    );
  }

  @Post("admin-sessions/:id/revoke")
  revokeAdminSessionById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() request: AdminRequest,
  ) {
    return this.adminAuthService.revokeSessionById(id, request.cloudAdminSessionId);
  }

  @Patch("worlds/:id")
  updateWorld(@Param("id", new ParseUUIDPipe()) id: string, @Body() body: UpdateWorldDto) {
    return this.cloudService.updateWorld(id, body);
  }

  @Get("jobs")
  listJobs(@Query() query: ListJobsQueryDto) {
    return this.cloudService.listJobs({
      worldId: query.worldId,
      status: query.status,
      jobType: query.jobType,
      provider: query.provider,
      queueState: query.queueState,
      audit: query.audit,
      supersededBy: query.supersededBy,
      query: query.query,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get("waiting-session-sync-tasks")
  listWaitingSessionSyncTasks(
    @Query() query: ListWaitingSessionSyncTasksQueryDto,
  ) {
    return this.cloudService.listWaitingSessionSyncTasks({
      status: query.status,
      taskType: query.taskType,
      query: query.query,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Post("waiting-session-sync-tasks/replay-failed")
  replayFailedWaitingSessionSyncTasks(
    @Body() body: MutateFailedWaitingSessionSyncTasksDto,
  ) {
    return this.cloudService.replayFailedWaitingSessionSyncTasks(body.taskIds);
  }

  @Post("waiting-session-sync-tasks/clear-failed")
  clearFailedWaitingSessionSyncTasks(
    @Body() body: MutateFailedWaitingSessionSyncTasksDto,
  ) {
    return this.cloudService.clearFailedWaitingSessionSyncTasks(body.taskIds);
  }

  @Post("waiting-session-sync-tasks/replay-filtered-failed")
  replayFilteredFailedWaitingSessionSyncTasks(
    @Body() body: MutateFilteredFailedWaitingSessionSyncTasksDto,
  ) {
    return this.cloudService.replayFilteredFailedWaitingSessionSyncTasks({
      taskType: body.taskType,
      query: body.query,
    });
  }

  @Post("waiting-session-sync-tasks/clear-filtered-failed")
  clearFilteredFailedWaitingSessionSyncTasks(
    @Body() body: MutateFilteredFailedWaitingSessionSyncTasksDto,
  ) {
    return this.cloudService.clearFilteredFailedWaitingSessionSyncTasks({
      taskType: body.taskType,
      query: body.query,
    });
  }

  @Get("jobs/:id")
  getJob(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.cloudService.getJobById(id);
  }

  @Get("worlds/:id/instance")
  getWorldInstance(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.cloudService.getWorldInstance(id);
  }

  @Get("worlds/:id/bootstrap-config")
  getWorldBootstrapConfig(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.cloudService.getWorldBootstrapConfig(id);
  }

  @Get("worlds/:id/runtime-status")
  getWorldRuntimeStatus(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.cloudService.getWorldRuntimeStatus(id);
  }

  @Get("worlds/:id/alert-summary")
  getWorldAlertSummary(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.cloudService.getWorldAlertSummary(id);
  }

  @Post("worlds/:id/reconcile")
  reconcileWorld(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.cloudService.reconcileWorld(id);
  }

  @Post("worlds/:id/resume")
  resumeWorld(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.cloudService.resumeWorld(id);
  }

  @Post("worlds/:id/suspend")
  suspendWorld(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.cloudService.suspendWorld(id);
  }

  @Post("worlds/:id/retry")
  retryWorld(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.cloudService.retryWorld(id);
  }

  @Post("worlds/:id/rotate-callback-token")
  rotateWorldCallbackToken(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.cloudService.rotateWorldCallbackToken(id);
  }
}
