import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsBoolean,
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
