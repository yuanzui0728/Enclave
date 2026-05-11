// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsBoolean,
  IsEmail,
  IsISO8601,
  IsIn,
  IsInt,
  IsOptional,
  IsArray,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";

const PHONE_PATTERN = /^\+?[0-9]{6,20}$/;
const CODE_PATTERN = /^[0-9]{4,8}$/;
const URL_VALIDATION_OPTIONS = {
  require_protocol: true,
  require_tld: false,
};

const CLOUD_WORLD_REQUEST_STATUSES = ["pending", "provisioning", "active", "rejected", "disabled"] as const;
const CLOUD_WORLD_LIFECYCLE_STATUSES = [
  "queued",
  "creating",
  "bootstrapping",
  "starting",
  "ready",
  "sleeping",
  "stopping",
  "failed",
  "disabled",
  "deleting",
] as const;
const WORLD_LIFECYCLE_JOB_STATUSES = ["pending", "running", "succeeded", "failed", "cancelled"] as const;
const WORLD_LIFECYCLE_JOB_TYPES = ["provision", "resume", "suspend", "reconcile"] as const;
const WORLD_LIFECYCLE_JOB_AUDIT_FILTERS = ["superseded"] as const;
const WORLD_LIFECYCLE_JOB_QUEUE_STATE_FILTERS = [
  "running_now",
  "lease_expired",
  "delayed",
] as const;
const WORLD_LIFECYCLE_JOB_SORT_FIELDS = [
  "updatedAt",
  "createdAt",
  "availableAt",
  "startedAt",
  "finishedAt",
] as const;
const WORLD_LIFECYCLE_JOB_SORT_DIRECTIONS = ["asc", "desc"] as const;
const WAITING_SESSION_SYNC_TASK_STATUSES = ["pending", "running", "failed"] as const;
const WAITING_SESSION_SYNC_TASK_TYPES = [
  "refresh_phone",
  "invalidate_phone",
  "refresh_world",
] as const;
const CLOUD_ADMIN_SESSION_STATUSES = ["active", "expired", "revoked"] as const;
const CLOUD_ADMIN_SESSION_REVOCATION_REASONS = [
  "logout",
  "manual-revocation",
  "refresh-token-reuse",
] as const;
const CLOUD_ADMIN_SESSION_SORT_FIELDS = [
  "updatedAt",
  "createdAt",
  "expiresAt",
  "lastUsedAt",
  "revokedAt",
] as const;
const CLOUD_ADMIN_SESSION_SOURCE_GROUP_SORT_FIELDS = [
  "activeSessions",
  "totalSessions",
  "latestCreatedAt",
  "latestLastUsedAt",
  "latestRevokedAt",
] as const;
const CLOUD_ADMIN_SESSION_SORT_DIRECTIONS = ["asc", "desc"] as const;
const CLOUD_ADMIN_SESSION_SOURCE_GROUP_RISK_LEVELS = [
  "normal",
  "watch",
  "critical",
] as const;
const REVENUE_USAGE_EVENT_TYPES = [
  "character_chat_message",
  "character_voice_turn",
  "character_video_turn",
  "character_content_use",
  "character_logic_run",
] as const;
const REVENUE_CONTRIBUTION_EVENT_TYPES = [
  "character_create",
  "character_content_edit_approved",
  "character_logic_edit_approved",
  "character_review_approved",
  "character_patrol",
  "character_logic_publish",
] as const;
const REVENUE_PAYEE_EXTERNAL_REF_TYPES = [
  "world_owner",
  "wiki_user",
  "character",
  "system",
  "provider",
  "runtime_operator",
] as const;
const REVENUE_PAYEE_STATUSES = [
  "pending",
  "active",
  "paused",
  "archived",
] as const;
const REVENUE_ALLOCATION_STATUSES = ["held", "payable", "settled"] as const;

function trimString({ value }: { value: unknown }) {
  return typeof value === "string" ? value.trim() : value;
}

function trimStringArray({ value }: { value: unknown }) {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((item) => (typeof item === "string" ? item.trim() : item));
}

function parseInteger({ value }: { value: unknown }) {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : value;
}

function parseBoolean({ value }: { value: unknown }) {
  if (typeof value !== "string") {
    return value;
  }

  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  return value;
}

export class SendCodeDto {
  @Transform(trimString)
  @Matches(PHONE_PATTERN, { message: "phone 格式不正确。" })
  phone: string;
}

export class VerifyCodeDto {
  @Transform(trimString)
  @Matches(PHONE_PATTERN, { message: "phone 格式不正确。" })
  phone: string;

  @Transform(trimString)
  @Matches(CODE_PATTERN, { message: "code 格式不正确。" })
  code: string;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "inviteCode 必须是字符串。" })
  @MinLength(1, { message: "inviteCode 不能为空。" })
  @MaxLength(32, { message: "inviteCode 不能超过 32 个字符。" })
  inviteCode?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "deviceFingerprint 必须是字符串。" })
  @MinLength(1, { message: "deviceFingerprint 不能为空。" })
  @MaxLength(128, { message: "deviceFingerprint 不能超过 128 个字符。" })
  deviceFingerprint?: string;

  // 客户端探测的公网 IP（花生壳 vicp.fun L4 隧道无法传递 client IP 时的兜底）；
  // 后端仅在 server-side 头未取到公网 IP 时采纳，且校验为合法 IPv4/IPv6。
  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "clientReportedIp 必须是字符串。" })
  @MaxLength(45, { message: "clientReportedIp 不能超过 45 个字符。" })
  clientReportedIp?: string;
}

export class RedeemInviteDto {
  @Transform(trimString)
  @IsString({ message: "code 必须是字符串。" })
  @MinLength(1, { message: "code 不能为空。" })
  @MaxLength(32, { message: "code 不能超过 32 个字符。" })
  code: string;
}

export class SendEmailCodeDto {
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: "email 格式不正确。" })
  @MaxLength(254, { message: "email 不能超过 254 个字符。" })
  email: string;
}

export class VerifyEmailCodeDto {
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: "email 格式不正确。" })
  @MaxLength(254, { message: "email 不能超过 254 个字符。" })
  email: string;

  @Transform(trimString)
  @Matches(CODE_PATTERN, { message: "code 格式不正确。" })
  code: string;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "inviteCode 必须是字符串。" })
  @MinLength(1, { message: "inviteCode 不能为空。" })
  @MaxLength(32, { message: "inviteCode 不能超过 32 个字符。" })
  inviteCode?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "deviceFingerprint 必须是字符串。" })
  @MinLength(1, { message: "deviceFingerprint 不能为空。" })
  @MaxLength(128, { message: "deviceFingerprint 不能超过 128 个字符。" })
  deviceFingerprint?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "clientReportedIp 必须是字符串。" })
  @MaxLength(45, { message: "clientReportedIp 不能超过 45 个字符。" })
  clientReportedIp?: string;
}

export class VerifyGoogleIdTokenDto {
  @Transform(trimString)
  @IsString({ message: "idToken 必须是字符串。" })
  @MinLength(1, { message: "idToken 不能为空。" })
  @MaxLength(8192, { message: "idToken 不能超过 8192 个字符。" })
  idToken: string;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "inviteCode 必须是字符串。" })
  @MinLength(1, { message: "inviteCode 不能为空。" })
  @MaxLength(32, { message: "inviteCode 不能超过 32 个字符。" })
  inviteCode?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "deviceFingerprint 必须是字符串。" })
  @MinLength(1, { message: "deviceFingerprint 不能为空。" })
  @MaxLength(128, { message: "deviceFingerprint 不能超过 128 个字符。" })
  deviceFingerprint?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "clientReportedIp 必须是字符串。" })
  @MaxLength(45, { message: "clientReportedIp 不能超过 45 个字符。" })
  clientReportedIp?: string;
}

export class CheckoutDto {
  @Transform(trimString)
  @IsString({ message: "planCode 必须是字符串。" })
  @MinLength(1, { message: "planCode 不能为空。" })
  @MaxLength(64, { message: "planCode 不能超过 64 个字符。" })
  planCode: string;
}

const SUBSCRIPTION_STATUSES = ["active", "expired", "none"] as const;
const CLOUD_USER_STATUSES = ["active", "banned", "archived"] as const;
const INVITE_REDEMPTION_STATUSES = ["rewarded", "rejected"] as const;
const SUBSCRIPTION_SOURCES = [
  "trial",
  "purchase",
  "invite_reward",
  "admin_grant",
] as const;

export class ListCloudUsersDto {
  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "query 必须是字符串。" })
  @MaxLength(255, { message: "query 不能超过 255 个字符。" })
  query?: string;

  @Transform(trimString)
  @IsOptional()
  @IsIn(SUBSCRIPTION_STATUSES, { message: "subscriptionStatus 不合法。" })
  subscriptionStatus?: (typeof SUBSCRIPTION_STATUSES)[number];

  @Transform(trimString)
  @IsOptional()
  @IsIn(CLOUD_USER_STATUSES, { message: "status 不合法。" })
  status?: (typeof CLOUD_USER_STATUSES)[number];

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "inviterPhone 必须是字符串。" })
  @MaxLength(32, { message: "inviterPhone 不能超过 32 个字符。" })
  inviterPhone?: string;

  @Transform(trimString)
  @IsOptional()
  @IsISO8601({ strict: true }, { message: "registeredFrom 必须是 ISO8601 时间。" })
  registeredFrom?: string;

  @Transform(trimString)
  @IsOptional()
  @IsISO8601({ strict: true }, { message: "registeredTo 必须是 ISO8601 时间。" })
  registeredTo?: string;

  @Transform(parseInteger)
  @IsOptional()
  @IsInt({ message: "page 必须是整数。" })
  @Min(1, { message: "page 最小为 1。" })
  page?: number;

  @Transform(parseInteger)
  @IsOptional()
  @IsInt({ message: "pageSize 必须是整数。" })
  @Min(1, { message: "pageSize 最小为 1。" })
  @Max(100, { message: "pageSize 最大为 100。" })
  pageSize?: number;
}

export class GrantSubscriptionDto {
  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "planCode 必须是字符串。" })
  @MaxLength(64, { message: "planCode 不能超过 64 个字符。" })
  planCode?: string;

  @Transform(parseInteger)
  @IsOptional()
  @IsInt({ message: "durationDays 必须是整数。" })
  @Min(1, { message: "durationDays 至少为 1。" })
  @Max(3650, { message: "durationDays 最多为 3650。" })
  durationDays?: number;

  @Transform(trimString)
  @IsOptional()
  @IsIn(SUBSCRIPTION_SOURCES, { message: "source 不合法。" })
  source?: (typeof SUBSCRIPTION_SOURCES)[number];

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "note 必须是字符串。" })
  @MaxLength(500, { message: "note 不能超过 500 个字符。" })
  note?: string;
}

export class BanCloudUserDto {
  @Transform(trimString)
  @IsString({ message: "reason 必须是字符串。" })
  @MinLength(1, { message: "reason 不能为空。" })
  @MaxLength(500, { message: "reason 不能超过 500 个字符。" })
  reason: string;
}

export class UpsertSubscriptionPlanDto {
  @Transform(trimString)
  @IsOptional()
  @IsUUID("4", { message: "id 必须是合法 UUID。" })
  id?: string;

  @Transform(trimString)
  @IsString({ message: "code 必须是字符串。" })
  @MinLength(1, { message: "code 不能为空。" })
  @MaxLength(32, { message: "code 不能超过 32 个字符。" })
  code: string;

  @Transform(trimString)
  @IsString({ message: "name 必须是字符串。" })
  @MinLength(1, { message: "name 不能为空。" })
  @MaxLength(64, { message: "name 不能超过 64 个字符。" })
  name: string;

  @Transform(parseInteger)
  @IsInt({ message: "durationDays 必须是整数。" })
  @Min(1, { message: "durationDays 至少为 1。" })
  @Max(3650, { message: "durationDays 最多为 3650。" })
  durationDays: number;

  @Transform(parseInteger)
  @IsInt({ message: "priceCents 必须是整数。" })
  @Min(0, { message: "priceCents 不能为负数。" })
  priceCents: number;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "currency 必须是字符串。" })
  @MaxLength(8, { message: "currency 不能超过 8 个字符。" })
  currency?: string;

  @Transform(parseBoolean)
  @IsOptional()
  @IsBoolean({ message: "isActive 必须是布尔值。" })
  isActive?: boolean;

  @Transform(parseBoolean)
  @IsOptional()
  @IsBoolean({ message: "isTrial 必须是布尔值。" })
  isTrial?: boolean;

  @Transform(parseBoolean)
  @IsOptional()
  @IsBoolean({ message: "isPubliclyPurchasable 必须是布尔值。" })
  isPubliclyPurchasable?: boolean;

  @Transform(parseInteger)
  @IsOptional()
  @IsInt({ message: "sortOrder 必须是整数。" })
  sortOrder?: number;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "description 必须是字符串。" })
  @MaxLength(1000, { message: "description 不能超过 1000 个字符。" })
  description?: string | null;
}

export class UpsertCloudConfigDto {
  @Transform(trimString)
  @IsString({ message: "key 必须是字符串。" })
  @MinLength(1, { message: "key 不能为空。" })
  @MaxLength(64, { message: "key 不能超过 64 个字符。" })
  key: string;

  @IsOptional()
  value: unknown;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "description 必须是字符串。" })
  @MaxLength(500, { message: "description 不能超过 500 个字符。" })
  description?: string | null;
}

export class ListInviteRedemptionsDto {
  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "query 必须是字符串。" })
  @MaxLength(255, { message: "query 不能超过 255 个字符。" })
  query?: string;

  @Transform(trimString)
  @IsOptional()
  @IsIn(INVITE_REDEMPTION_STATUSES, { message: "status 不合法。" })
  status?: (typeof INVITE_REDEMPTION_STATUSES)[number];

  @Transform(parseInteger)
  @IsOptional()
  @IsInt({ message: "page 必须是整数。" })
  @Min(1, { message: "page 最小为 1。" })
  page?: number;

  @Transform(parseInteger)
  @IsOptional()
  @IsInt({ message: "pageSize 必须是整数。" })
  @Min(1, { message: "pageSize 最小为 1。" })
  @Max(100, { message: "pageSize 最大为 100。" })
  pageSize?: number;
}

export class RejectInviteRedemptionDto {
  @Transform(trimString)
  @IsString({ message: "reason 必须是字符串。" })
  @MinLength(1, { message: "reason 不能为空。" })
  @MaxLength(500, { message: "reason 不能超过 500 个字符。" })
  reason: string;
}

export class SubscriptionLookupDto {
  @Transform(trimString)
  @Matches(PHONE_PATTERN, { message: "phone 格式不正确。" })
  phone: string;
}

export class RefreshAdminSessionDto {
  @Transform(trimString)
  @IsString({ message: "refreshToken 必须是字符串。" })
  @MinLength(1, { message: "refreshToken 不能为空。" })
  @MaxLength(4096, { message: "refreshToken 不能超过 4096 个字符。" })
  refreshToken: string;
}

export class RevokeAdminSessionsByIdDto {
  @Transform(trimStringArray)
  @IsArray({ message: "sessionIds 必须是数组。" })
  @ArrayNotEmpty({ message: "sessionIds 不能为空。" })
  @ArrayMaxSize(100, { message: "sessionIds 最多允许 100 条。" })
  @ArrayUnique({ message: "sessionIds 不能包含重复值。" })
  @IsUUID("4", { each: true, message: "sessionIds 必须全部是合法 UUID。" })
  sessionIds: string[];
}

export class RevokeFilteredAdminSessionsDto {
  @Transform(trimString)
  @IsOptional()
  @IsIn(CLOUD_ADMIN_SESSION_STATUSES, {
    message: "status 不是合法的管理员会话状态。",
  })
  status?: (typeof CLOUD_ADMIN_SESSION_STATUSES)[number];

  @Transform(trimString)
  @IsOptional()
  @IsIn(CLOUD_ADMIN_SESSION_REVOCATION_REASONS, {
    message: "revocationReason 不是合法的管理员会话撤销原因。",
  })
  revocationReason?: (typeof CLOUD_ADMIN_SESSION_REVOCATION_REASONS)[number];

  @Transform(parseBoolean)
  @IsOptional()
  @IsBoolean({ message: "currentOnly 必须是布尔值。" })
  currentOnly?: boolean;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "query 必须是字符串。" })
  @MaxLength(255, { message: "query 不能超过 255 个字符。" })
  query?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "sourceKey 必须是字符串。" })
  @MinLength(1, { message: "sourceKey 不能为空。" })
  @MaxLength(1024, { message: "sourceKey 不能超过 1024 个字符。" })
  sourceKey?: string;
}

export class ListAdminSessionSourceGroupsQueryDto extends RevokeFilteredAdminSessionsDto {
  @Transform(trimString)
  @IsOptional()
  @IsIn(CLOUD_ADMIN_SESSION_SOURCE_GROUP_RISK_LEVELS, {
    message: "riskLevel 不是合法的管理员来源分组风险等级。",
  })
  riskLevel?: (typeof CLOUD_ADMIN_SESSION_SOURCE_GROUP_RISK_LEVELS)[number];

  @Transform(trimString)
  @IsOptional()
  @IsIn(CLOUD_ADMIN_SESSION_SOURCE_GROUP_SORT_FIELDS, {
    message: "sortBy 不是合法的管理员来源分组排序字段。",
  })
  sortBy?: (typeof CLOUD_ADMIN_SESSION_SOURCE_GROUP_SORT_FIELDS)[number];

  @Transform(trimString)
  @IsOptional()
  @IsIn(CLOUD_ADMIN_SESSION_SORT_DIRECTIONS, {
    message: "sortDirection 不是合法的管理员来源分组排序方向。",
  })
  sortDirection?: (typeof CLOUD_ADMIN_SESSION_SORT_DIRECTIONS)[number];

  @Transform(parseInteger)
  @IsOptional()
  @IsInt({ message: "page 必须是整数。" })
  @Min(1, { message: "page 最小为 1。" })
  page?: number;

  @Transform(parseInteger)
  @IsOptional()
  @IsInt({ message: "pageSize 必须是整数。" })
  @Min(1, { message: "pageSize 最小为 1。" })
  @Max(100, { message: "pageSize 最大为 100。" })
  pageSize?: number;
}

export class RevokeAdminSessionSourceGroupDto extends RevokeFilteredAdminSessionsDto {
  @Transform(trimString)
  @IsString({ message: "sourceKey 必须是字符串。" })
  @MinLength(1, { message: "sourceKey 不能为空。" })
  @MaxLength(1024, { message: "sourceKey 不能超过 1024 个字符。" })
  declare sourceKey: string;
}

export class CreateAdminSessionSourceGroupSnapshotDto extends RevokeAdminSessionSourceGroupDto {}

export class CreateAdminSessionSourceGroupRiskSnapshotDto extends RevokeFilteredAdminSessionsDto {
  @Transform(trimString)
  @IsIn(CLOUD_ADMIN_SESSION_SOURCE_GROUP_RISK_LEVELS, {
    message: "riskLevel 不是合法的管理员来源分组风险等级。",
  })
  riskLevel: (typeof CLOUD_ADMIN_SESSION_SOURCE_GROUP_RISK_LEVELS)[number];
}

export class RevokeAdminSessionSourceGroupsByRiskDto extends RevokeFilteredAdminSessionsDto {
  @Transform(trimString)
  @IsIn(CLOUD_ADMIN_SESSION_SOURCE_GROUP_RISK_LEVELS, {
    message: "riskLevel 不是合法的管理员来源分组风险等级。",
  })
  riskLevel: (typeof CLOUD_ADMIN_SESSION_SOURCE_GROUP_RISK_LEVELS)[number];
}

export class CreateWorldRequestDto {
  @Transform(trimString)
  @IsString({ message: "worldName 必须是字符串。" })
  @MinLength(1, { message: "worldName 不能为空。" })
  @MaxLength(80, { message: "worldName 不能超过 80 个字符。" })
  worldName: string;
}

export class ResolveWorldAccessDto {
  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "clientPlatform 必须是字符串。" })
  @MaxLength(32, { message: "clientPlatform 不能超过 32 个字符。" })
  clientPlatform?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "clientVersion 必须是字符串。" })
  @MaxLength(64, { message: "clientVersion 不能超过 64 个字符。" })
  clientVersion?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "preferredRegion 必须是字符串。" })
  @MaxLength(64, { message: "preferredRegion 不能超过 64 个字符。" })
  preferredRegion?: string;
}

export class ListWorldRequestsQueryDto {
  @Transform(trimString)
  @IsOptional()
  @IsIn(CLOUD_WORLD_REQUEST_STATUSES, { message: "status 不是合法的云世界申请状态。" })
  status?: (typeof CLOUD_WORLD_REQUEST_STATUSES)[number];
}

export class UpdateWorldRequestDto {
  @Transform(trimString)
  @IsOptional()
  @Matches(PHONE_PATTERN, { message: "phone 格式不正确。" })
  phone?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "worldName 必须是字符串。" })
  @MinLength(1, { message: "worldName 不能为空。" })
  @MaxLength(80, { message: "worldName 不能超过 80 个字符。" })
  worldName?: string;

  @Transform(trimString)
  @IsOptional()
  @IsIn(CLOUD_WORLD_REQUEST_STATUSES, { message: "status 不是合法的云世界申请状态。" })
  status?: (typeof CLOUD_WORLD_REQUEST_STATUSES)[number];

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "note 必须是字符串。" })
  @MaxLength(1000, { message: "note 不能超过 1000 个字符。" })
  note?: string | null;

  @Transform(trimString)
  @ValidateIf((_object, value) => value !== undefined && value !== null && value !== "")
  @IsUrl(URL_VALIDATION_OPTIONS, { message: "apiBaseUrl 必须是合法 URL。" })
  @MaxLength(2048, { message: "apiBaseUrl 不能超过 2048 个字符。" })
  apiBaseUrl?: string | null;

  @Transform(trimString)
  @ValidateIf((_object, value) => value !== undefined && value !== null && value !== "")
  @IsUrl(URL_VALIDATION_OPTIONS, { message: "adminUrl 必须是合法 URL。" })
  @MaxLength(2048, { message: "adminUrl 不能超过 2048 个字符。" })
  adminUrl?: string | null;
}

export class ListWorldsQueryDto {
  @Transform(trimString)
  @IsOptional()
  @IsIn(CLOUD_WORLD_LIFECYCLE_STATUSES, { message: "status 不是合法的云世界状态。" })
  status?: (typeof CLOUD_WORLD_LIFECYCLE_STATUSES)[number];
}

export class ListWorldInstancesQueryDto {
  @Transform(trimString)
  @IsOptional()
  @IsIn(CLOUD_WORLD_LIFECYCLE_STATUSES, { message: "status 不是合法的云世界状态。" })
  status?: (typeof CLOUD_WORLD_LIFECYCLE_STATUSES)[number];
}

export class UpdateWorldDto {
  @Transform(trimString)
  @IsOptional()
  @Matches(PHONE_PATTERN, { message: "phone 格式不正确。" })
  phone?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "name 必须是字符串。" })
  @MinLength(1, { message: "name 不能为空。" })
  @MaxLength(80, { message: "name 不能超过 80 个字符。" })
  name?: string;

  @Transform(trimString)
  @IsOptional()
  @IsIn(CLOUD_WORLD_LIFECYCLE_STATUSES, { message: "status 不是合法的云世界状态。" })
  status?: (typeof CLOUD_WORLD_LIFECYCLE_STATUSES)[number];

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "provisionStrategy 必须是字符串。" })
  @MaxLength(64, { message: "provisionStrategy 不能超过 64 个字符。" })
  provisionStrategy?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "providerKey 必须是字符串。" })
  @MaxLength(64, { message: "providerKey 不能超过 64 个字符。" })
  providerKey?: string | null;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "providerRegion 必须是字符串。" })
  @MaxLength(64, { message: "providerRegion 不能超过 64 个字符。" })
  providerRegion?: string | null;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "providerZone 必须是字符串。" })
  @MaxLength(64, { message: "providerZone 不能超过 64 个字符。" })
  providerZone?: string | null;

  @Transform(trimString)
  @ValidateIf((_object, value) => value !== undefined && value !== null && value !== "")
  @IsUrl(URL_VALIDATION_OPTIONS, { message: "apiBaseUrl 必须是合法 URL。" })
  @MaxLength(2048, { message: "apiBaseUrl 不能超过 2048 个字符。" })
  apiBaseUrl?: string | null;

  @Transform(trimString)
  @ValidateIf((_object, value) => value !== undefined && value !== null && value !== "")
  @IsUrl(URL_VALIDATION_OPTIONS, { message: "adminUrl 必须是合法 URL。" })
  @MaxLength(2048, { message: "adminUrl 不能超过 2048 个字符。" })
  adminUrl?: string | null;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "note 必须是字符串。" })
  @MaxLength(1000, { message: "note 不能超过 1000 个字符。" })
  note?: string | null;
}

export class ListJobsQueryDto {
  @Transform(trimString)
  @IsOptional()
  @IsUUID("4", { message: "worldId 必须是合法 UUID。" })
  worldId?: string;

  @Transform(trimString)
  @IsOptional()
  @IsIn(WORLD_LIFECYCLE_JOB_STATUSES, { message: "status 不是合法的生命周期任务状态。" })
  status?: (typeof WORLD_LIFECYCLE_JOB_STATUSES)[number];

  @Transform(trimString)
  @IsOptional()
  @IsIn(WORLD_LIFECYCLE_JOB_TYPES, { message: "jobType 不是合法的生命周期任务类型。" })
  jobType?: (typeof WORLD_LIFECYCLE_JOB_TYPES)[number];

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "provider 必须是字符串。" })
  @MaxLength(64, { message: "provider 不能超过 64 个字符。" })
  provider?: string;

  @Transform(trimString)
  @IsOptional()
  @IsIn(WORLD_LIFECYCLE_JOB_QUEUE_STATE_FILTERS, {
    message: "queueState 不是合法的生命周期任务队列过滤条件。",
  })
  queueState?: (typeof WORLD_LIFECYCLE_JOB_QUEUE_STATE_FILTERS)[number];

  @Transform(trimString)
  @IsOptional()
  @IsIn(WORLD_LIFECYCLE_JOB_AUDIT_FILTERS, {
    message: "audit 不是合法的生命周期任务审计过滤条件。",
  })
  audit?: (typeof WORLD_LIFECYCLE_JOB_AUDIT_FILTERS)[number];

  @Transform(trimString)
  @IsOptional()
  @IsIn(WORLD_LIFECYCLE_JOB_TYPES, {
    message: "supersededBy 不是合法的 superseded 生命周期任务类型。",
  })
  supersededBy?: (typeof WORLD_LIFECYCLE_JOB_TYPES)[number];

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "query 必须是字符串。" })
  @MaxLength(255, { message: "query 不能超过 255 个字符。" })
  query?: string;

  @Transform(trimString)
  @IsOptional()
  @IsIn(WORLD_LIFECYCLE_JOB_SORT_FIELDS, {
    message: "sortBy 不是合法的生命周期任务排序字段。",
  })
  sortBy?: (typeof WORLD_LIFECYCLE_JOB_SORT_FIELDS)[number];

  @Transform(trimString)
  @IsOptional()
  @IsIn(WORLD_LIFECYCLE_JOB_SORT_DIRECTIONS, {
    message: "sortDirection 不是合法的生命周期任务排序方向。",
  })
  sortDirection?: (typeof WORLD_LIFECYCLE_JOB_SORT_DIRECTIONS)[number];

  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: "page 必须是整数。" })
  @Min(1, { message: "page 必须大于或等于 1。" })
  page?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: "pageSize 必须是整数。" })
  @Min(1, { message: "pageSize 必须大于或等于 1。" })
  @Max(100, { message: "pageSize 不能超过 100。" })
  pageSize?: number;
}

export class ListWaitingSessionSyncTasksQueryDto {
  @Transform(trimString)
  @IsOptional()
  @IsIn(WAITING_SESSION_SYNC_TASK_STATUSES, {
    message: "status 不是合法的 waiting session 补偿任务状态。",
  })
  status?: (typeof WAITING_SESSION_SYNC_TASK_STATUSES)[number];

  @Transform(trimString)
  @IsOptional()
  @IsIn(WAITING_SESSION_SYNC_TASK_TYPES, {
    message: "taskType 不是合法的 waiting session 补偿任务类型。",
  })
  taskType?: (typeof WAITING_SESSION_SYNC_TASK_TYPES)[number];

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "query 必须是字符串。" })
  @MaxLength(255, { message: "query 不能超过 255 个字符。" })
  query?: string;

  @Transform(parseInteger)
  @IsOptional()
  @IsInt({ message: "page 必须是整数。" })
  @Min(1, { message: "page 最小为 1。" })
  page?: number;

  @Transform(parseInteger)
  @IsOptional()
  @IsInt({ message: "pageSize 必须是整数。" })
  @Min(1, { message: "pageSize 最小为 1。" })
  @Max(100, { message: "pageSize 最大为 100。" })
  pageSize?: number;
}

export class MutateFailedWaitingSessionSyncTasksDto {
  @Transform(trimStringArray)
  @IsArray({ message: "taskIds 必须是数组。" })
  @ArrayNotEmpty({ message: "taskIds 不能为空。" })
  @ArrayMaxSize(100, { message: "taskIds 最多允许 100 条。" })
  @ArrayUnique({ message: "taskIds 不能包含重复值。" })
  @IsUUID("4", { each: true, message: "taskIds 必须全部是合法 UUID。" })
  taskIds: string[];
}

export class MutateFilteredFailedWaitingSessionSyncTasksDto {
  @Transform(trimString)
  @IsOptional()
  @IsIn(WAITING_SESSION_SYNC_TASK_TYPES, {
    message: "taskType 不是合法的 waiting session 补偿任务类型。",
  })
  taskType?: (typeof WAITING_SESSION_SYNC_TASK_TYPES)[number];

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "query 必须是字符串。" })
  @MaxLength(255, { message: "query 不能超过 255 个字符。" })
  query?: string;
}

export class ListAdminSessionsQueryDto {
  @Transform(trimString)
  @IsOptional()
  @IsIn(CLOUD_ADMIN_SESSION_STATUSES, {
    message: "status 不是合法的管理员会话状态。",
  })
  status?: (typeof CLOUD_ADMIN_SESSION_STATUSES)[number];

  @Transform(trimString)
  @IsOptional()
  @IsIn(CLOUD_ADMIN_SESSION_REVOCATION_REASONS, {
    message: "revocationReason 不是合法的管理员会话撤销原因。",
  })
  revocationReason?: (typeof CLOUD_ADMIN_SESSION_REVOCATION_REASONS)[number];

  @Transform(parseBoolean)
  @IsOptional()
  @IsBoolean({ message: "currentOnly 必须是布尔值。" })
  currentOnly?: boolean;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "query 必须是字符串。" })
  @MaxLength(255, { message: "query 不能超过 255 个字符。" })
  query?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "sourceKey 必须是字符串。" })
  @MinLength(1, { message: "sourceKey 不能为空。" })
  @MaxLength(1024, { message: "sourceKey 不能超过 1024 个字符。" })
  sourceKey?: string;

  @Transform(trimString)
  @IsOptional()
  @IsIn(CLOUD_ADMIN_SESSION_SORT_FIELDS, {
    message: "sortBy 不是合法的管理员会话排序字段。",
  })
  sortBy?: (typeof CLOUD_ADMIN_SESSION_SORT_FIELDS)[number];

  @Transform(trimString)
  @IsOptional()
  @IsIn(CLOUD_ADMIN_SESSION_SORT_DIRECTIONS, {
    message: "sortDirection 不是合法的管理员会话排序方向。",
  })
  sortDirection?: (typeof CLOUD_ADMIN_SESSION_SORT_DIRECTIONS)[number];

  @Transform(parseInteger)
  @IsOptional()
  @IsInt({ message: "page 必须是整数。" })
  @Min(1, { message: "page 最小为 1。" })
  page?: number;

  @Transform(parseInteger)
  @IsOptional()
  @IsInt({ message: "pageSize 必须是整数。" })
  @Min(1, { message: "pageSize 最小为 1。" })
  @Max(100, { message: "pageSize 最大为 100。" })
  pageSize?: number;
}

export class UpdateRevenueSharingPolicyDto {
  @Transform(parseBoolean)
  @IsOptional()
  @IsBoolean({ message: "enabled 必须是布尔值。" })
  enabled?: boolean;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "currency 必须是字符串。" })
  @MinLength(3, { message: "currency 至少 3 个字符。" })
  @MaxLength(8, { message: "currency 不能超过 8 个字符。" })
  currency?: string;

  @IsOptional()
  @IsArray({ message: "eventPrices 必须是数组。" })
  @ArrayMaxSize(20, { message: "eventPrices 最多允许 20 条。" })
  eventPrices?: unknown[];

  @IsOptional()
  @IsArray({ message: "fixedShares 必须是数组。" })
  @ArrayMaxSize(10, { message: "fixedShares 最多允许 10 条。" })
  fixedShares?: unknown[];

  @Transform(parseInteger)
  @IsOptional()
  @IsInt({ message: "contributionPoolBasisPoints 必须是整数。" })
  @Min(0, { message: "contributionPoolBasisPoints 不能小于 0。" })
  @Max(10000, { message: "contributionPoolBasisPoints 不能超过 10000。" })
  contributionPoolBasisPoints?: number;

  @IsOptional()
  @IsArray({ message: "contributionWeights 必须是数组。" })
  @ArrayMaxSize(20, { message: "contributionWeights 最多允许 20 条。" })
  contributionWeights?: unknown[];

  @Transform(parseInteger)
  @IsOptional()
  @IsInt({ message: "contributionWindowDays 必须是整数。" })
  @Min(1, { message: "contributionWindowDays 至少为 1。" })
  @Max(3650, { message: "contributionWindowDays 最多为 3650。" })
  contributionWindowDays?: number;

  @Transform(parseInteger)
  @IsOptional()
  @IsInt({ message: "minimumSettlementCents 必须是整数。" })
  @Min(0, { message: "minimumSettlementCents 不能小于 0。" })
  @Max(100000000, { message: "minimumSettlementCents 不能超过 100000000。" })
  minimumSettlementCents?: number;
}

export class UpsertRevenuePayeeDto {
  @Transform(trimString)
  @IsOptional()
  @IsUUID("4", { message: "id 必须是合法 UUID。" })
  id?: string;

  @Transform(trimString)
  @IsString({ message: "displayName 必须是字符串。" })
  @MinLength(1, { message: "displayName 不能为空。" })
  @MaxLength(128, { message: "displayName 不能超过 128 个字符。" })
  displayName: string;

  @Transform(trimString)
  @IsOptional()
  @IsIn(REVENUE_PAYEE_STATUSES, { message: "status 不是合法的收益人状态。" })
  status?: (typeof REVENUE_PAYEE_STATUSES)[number];

  @Transform(trimString)
  @IsIn(REVENUE_PAYEE_EXTERNAL_REF_TYPES, {
    message: "externalRefType 不是合法的收益人外部引用类型。",
  })
  externalRefType: (typeof REVENUE_PAYEE_EXTERNAL_REF_TYPES)[number];

  @Transform(trimString)
  @IsString({ message: "externalRefId 必须是字符串。" })
  @MinLength(1, { message: "externalRefId 不能为空。" })
  @MaxLength(255, { message: "externalRefId 不能超过 255 个字符。" })
  externalRefId: string;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "contact 必须是字符串。" })
  @MaxLength(500, { message: "contact 不能超过 500 个字符。" })
  contact?: string | null;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "payoutNote 必须是字符串。" })
  @MaxLength(1000, { message: "payoutNote 不能超过 1000 个字符。" })
  payoutNote?: string | null;
}

export class ListRevenueLedgerQueryDto {
  @Transform(trimString)
  @IsOptional()
  @IsUUID("4", { message: "worldId 必须是合法 UUID。" })
  worldId?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "characterId 必须是字符串。" })
  @MaxLength(255, { message: "characterId 不能超过 255 个字符。" })
  characterId?: string;

  @Transform(trimString)
  @IsOptional()
  @IsUUID("4", { message: "payeeId 必须是合法 UUID。" })
  payeeId?: string;

  @Transform(trimString)
  @IsOptional()
  @IsIn(REVENUE_ALLOCATION_STATUSES, {
    message: "status 不是合法的收益分配状态。",
  })
  status?: (typeof REVENUE_ALLOCATION_STATUSES)[number];

  @Transform(parseInteger)
  @IsOptional()
  @IsInt({ message: "page 必须是整数。" })
  @Min(1, { message: "page 最小为 1。" })
  page?: number;

  @Transform(parseInteger)
  @IsOptional()
  @IsInt({ message: "pageSize 必须是整数。" })
  @Min(1, { message: "pageSize 最小为 1。" })
  @Max(100, { message: "pageSize 最大为 100。" })
  pageSize?: number;
}

export class ListRevenueEventsQueryDto {
  @Transform(trimString)
  @IsOptional()
  @IsUUID("4", { message: "worldId 必须是合法 UUID。" })
  worldId?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "characterId 必须是字符串。" })
  @MaxLength(255, { message: "characterId 不能超过 255 个字符。" })
  characterId?: string;
}

export class RevenueSettlementPreviewDto {
  @Transform(trimString)
  @IsOptional()
  @IsISO8601({ strict: true }, { message: "from 必须是 ISO8601 时间。" })
  from?: string;

  @Transform(trimString)
  @IsOptional()
  @IsISO8601({ strict: true }, { message: "to 必须是 ISO8601 时间。" })
  to?: string;

  @Transform(trimString)
  @IsOptional()
  @IsUUID("4", { message: "payeeId 必须是合法 UUID。" })
  payeeId?: string;
}

export class RevenueContributionEventDto {
  @Transform(trimString)
  @IsString({ message: "sourceEventId 必须是字符串。" })
  @MinLength(1, { message: "sourceEventId 不能为空。" })
  @MaxLength(255, { message: "sourceEventId 不能超过 255 个字符。" })
  sourceEventId: string;

  @Transform(trimString)
  @IsIn(REVENUE_CONTRIBUTION_EVENT_TYPES, {
    message: "eventType 不是合法的贡献事件类型。",
  })
  eventType: (typeof REVENUE_CONTRIBUTION_EVENT_TYPES)[number];

  @Transform(trimString)
  @IsString({ message: "characterId 必须是字符串。" })
  @MinLength(1, { message: "characterId 不能为空。" })
  @MaxLength(255, { message: "characterId 不能超过 255 个字符。" })
  characterId: string;

  @Transform(trimString)
  @IsIn(REVENUE_PAYEE_EXTERNAL_REF_TYPES, {
    message: "contributorExternalRefType 不是合法的收益人引用类型。",
  })
  contributorExternalRefType: (typeof REVENUE_PAYEE_EXTERNAL_REF_TYPES)[number];

  @Transform(trimString)
  @IsString({ message: "contributorExternalRefId 必须是字符串。" })
  @MinLength(1, { message: "contributorExternalRefId 不能为空。" })
  @MaxLength(255, { message: "contributorExternalRefId 不能超过 255 个字符。" })
  contributorExternalRefId: string;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "contributorDisplayName 必须是字符串。" })
  @MaxLength(128, { message: "contributorDisplayName 不能超过 128 个字符。" })
  contributorDisplayName?: string | null;

  @Transform(trimString)
  @IsOptional()
  @IsISO8601({ strict: true }, { message: "occurredAt 必须是 ISO8601 时间。" })
  occurredAt?: string | null;

  @Transform(trimString)
  @IsOptional()
  @IsISO8601({ strict: true }, { message: "reversedAt 必须是 ISO8601 时间。" })
  reversedAt?: string | null;

  metadata?: Record<string, unknown> | null;
}

export class ReportRevenueContributionEventsDto {
  @IsArray({ message: "events 必须是数组。" })
  @ArrayMaxSize(100, { message: "events 最多允许 100 条。" })
  events: RevenueContributionEventDto[];
}

export class RevenueUsageEventDto {
  @Transform(trimString)
  @IsString({ message: "sourceEventId 必须是字符串。" })
  @MinLength(1, { message: "sourceEventId 不能为空。" })
  @MaxLength(255, { message: "sourceEventId 不能超过 255 个字符。" })
  sourceEventId: string;

  @Transform(trimString)
  @IsIn(REVENUE_USAGE_EVENT_TYPES, {
    message: "eventType 不是合法的角色使用事件类型。",
  })
  eventType: (typeof REVENUE_USAGE_EVENT_TYPES)[number];

  @Transform(trimString)
  @IsString({ message: "characterId 必须是字符串。" })
  @MinLength(1, { message: "characterId 不能为空。" })
  @MaxLength(255, { message: "characterId 不能超过 255 个字符。" })
  characterId: string;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "characterName 必须是字符串。" })
  @MaxLength(128, { message: "characterName 不能超过 128 个字符。" })
  characterName?: string | null;

  @Transform(parseInteger)
  @IsOptional()
  @IsInt({ message: "quantity 必须是整数。" })
  @Min(1, { message: "quantity 至少为 1。" })
  @Max(100000, { message: "quantity 不能超过 100000。" })
  quantity?: number;

  @Transform(trimString)
  @IsOptional()
  @IsISO8601({ strict: true }, { message: "occurredAt 必须是 ISO8601 时间。" })
  occurredAt?: string | null;

  metadata?: Record<string, unknown> | null;
}

export class ReportRevenueUsageEventsDto {
  @IsArray({ message: "events 必须是数组。" })
  @ArrayMaxSize(100, { message: "events 最多允许 100 条。" })
  events: RevenueUsageEventDto[];
}

export class RuntimeCallbackDto {
  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "callbackToken 必须是字符串。" })
  @MaxLength(255, { message: "callbackToken 不能超过 255 个字符。" })
  callbackToken?: string | null;

  @Transform(trimString)
  @ValidateIf((_object, value) => value !== undefined && value !== null && value !== "")
  @IsUrl(URL_VALIDATION_OPTIONS, { message: "apiBaseUrl 必须是合法 URL。" })
  @MaxLength(2048, { message: "apiBaseUrl 不能超过 2048 个字符。" })
  apiBaseUrl?: string | null;

  @Transform(trimString)
  @ValidateIf((_object, value) => value !== undefined && value !== null && value !== "")
  @IsUrl(URL_VALIDATION_OPTIONS, { message: "adminUrl 必须是合法 URL。" })
  @MaxLength(2048, { message: "adminUrl 不能超过 2048 个字符。" })
  adminUrl?: string | null;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "runtimeVersion 必须是字符串。" })
  @MaxLength(128, { message: "runtimeVersion 不能超过 128 个字符。" })
  runtimeVersion?: string | null;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "healthStatus 必须是字符串。" })
  @MaxLength(64, { message: "healthStatus 不能超过 64 个字符。" })
  healthStatus?: string | null;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "healthMessage 必须是字符串。" })
  @MaxLength(1000, { message: "healthMessage 不能超过 1000 个字符。" })
  healthMessage?: string | null;

  @Transform(trimString)
  @IsOptional()
  @IsISO8601({ strict: true }, { message: "reportedAt 必须是合法 ISO 时间字符串。" })
  reportedAt?: string | null;

  @Transform(trimString)
  @IsOptional()
  @IsISO8601({ strict: true }, { message: "lastInteractiveAt 必须是合法 ISO 时间字符串。" })
  lastInteractiveAt?: string | null;
}

export class RuntimeFailureDto extends RuntimeCallbackDto {
  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "failureCode 必须是字符串。" })
  @MaxLength(128, { message: "failureCode 不能超过 128 个字符。" })
  failureCode?: string | null;

  @Transform(trimString)
  @IsOptional()
  @IsString({ message: "failureMessage 必须是字符串。" })
  @MaxLength(1000, { message: "failureMessage 不能超过 1000 个字符。" })
  failureMessage?: string | null;
}
// i18n-ignore-end
