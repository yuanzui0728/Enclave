import { Body, Controller, Headers, Post, Req } from "@nestjs/common";
import { RefreshAdminSessionDto } from "../http-dto/cloud-api.dto";
import {
  resolveAdminSessionAudit,
  type AdminSessionAuditRequest,
} from "./admin-session-audit";
import { AdminAuthService } from "./admin-auth.service";

@Controller("admin/cloud/auth")
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post("token")
  issueAccessToken(
    @Headers("x-admin-secret") adminSecret: string | undefined,
    @Req() request: AdminSessionAuditRequest,
  ) {
    return this.adminAuthService.issueAccessToken(
      adminSecret,
      resolveAdminSessionAudit(request),
    );
  }

  @Post("refresh")
  refreshAccessToken(
    @Body() body: RefreshAdminSessionDto,
    @Req() request: AdminSessionAuditRequest,
  ) {
    return this.adminAuthService.refreshAccessToken(
      body.refreshToken,
      resolveAdminSessionAudit(request),
    );
  }

  @Post("logout")
  revokeSession(
    @Body() body: RefreshAdminSessionDto,
    @Req() request: AdminSessionAuditRequest,
  ) {
    return this.adminAuthService.revokeSession(
      body.refreshToken,
      resolveAdminSessionAudit(request),
    );
  }
}
