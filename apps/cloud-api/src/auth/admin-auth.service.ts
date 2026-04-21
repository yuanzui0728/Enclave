import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import type {
  CloudAdminSessionSourceGroupSnapshot,
  CloudAdminSessionSourceGroupRiskSnapshot,
  CloudAdminSessionSourceGroupSnapshotSummary,
  CloudAdminSessionListQuery,
  CloudAdminSessionListResponse,
  CloudAdminSessionSourceGroupListResponse,
  CloudAdminSessionSourceGroupQuery,
  CloudAdminSessionSourceGroupRiskLevel,
  CloudAdminSessionSourceGroupRiskSignal,
  CloudAdminSessionSourceGroupSortField,
  CloudAdminSessionSourceGroupSummary,
  CloudAdminSessionStatus,
  CloudAdminSessionRevocationReason,
  CloudAdminSessionSortDirection,
  CloudAdminSessionSortField,
  CloudAdminSessionSummary,
  CreateCloudAdminSessionSourceGroupRiskSnapshotRequest,
  CreateCloudAdminSessionSourceGroupSnapshotRequest,
  IssueCloudAdminAccessTokenResponse,
  RevokeCloudAdminSessionSourceGroupRequest,
  RevokeCloudAdminSessionSourceGroupResponse,
  RevokeCloudAdminSessionSourceGroupsByRiskRequest,
  RevokeCloudAdminSessionSourceGroupsByRiskResponse,
  RevokeCloudAdminSessionResponse,
  RevokeCloudAdminSessionsByFilterRequest,
  RevokeCloudAdminSessionsByFilterResponse,
  RevokeCloudAdminSessionsByIdResponse,
} from "@yinjie/contracts";
import { Brackets, In, Repository, SelectQueryBuilder } from "typeorm";
import {
  parseJwtDurationToMs,
  resolveCloudAdminJwtAudience,
  resolveCloudAdminRefreshJwtAudience,
  resolveCloudAdminRefreshTokenTtl,
  resolveCloudAdminSecret,
  resolveCloudAdminTokenTtl,
  resolveCloudJwtIssuer,
} from "../config/cloud-runtime-config";
import { CloudAdminSessionEntity } from "../entities/cloud-admin-session.entity";
import { matchesCloudAdminSecret } from "./admin-secret";
import type { AdminSessionAuditContext } from "./admin-session-audit";
import {
  CLOUD_ADMIN_ACCESS_TOKEN_PURPOSE,
  CLOUD_ADMIN_ACCESS_TOKEN_ROLE,
  CLOUD_ADMIN_ACCESS_TOKEN_SUBJECT,
  CLOUD_ADMIN_REFRESH_TOKEN_PURPOSE,
} from "./cloud-jwt.constants";

const FALLBACK_ADMIN_TOKEN_TTL_MS = 15 * 60 * 1000;
const FALLBACK_ADMIN_REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ADMIN_SESSION_LAST_USED_TOUCH_WINDOW_MS = 60 * 1000;
const DEFAULT_ADMIN_SESSION_PAGE = 1;
const DEFAULT_ADMIN_SESSION_PAGE_SIZE = 10;
const DEFAULT_ADMIN_SESSION_SORT_FIELD: CloudAdminSessionSortField = "updatedAt";
const DEFAULT_ADMIN_SESSION_SORT_DIRECTION: CloudAdminSessionSortDirection =
  "desc";
const DEFAULT_ADMIN_SESSION_SOURCE_GROUP_PAGE = 1;
const DEFAULT_ADMIN_SESSION_SOURCE_GROUP_PAGE_SIZE = 6;
const DEFAULT_ADMIN_SESSION_SOURCE_GROUP_SORT_FIELD: CloudAdminSessionSourceGroupSortField =
  "activeSessions";
const DEFAULT_ADMIN_SESSION_SOURCE_GROUP_SORT_DIRECTION: CloudAdminSessionSortDirection =
  "desc";
const WATCH_SOURCE_GROUP_ACTIVE_SESSION_THRESHOLD = 2;
const CRITICAL_SOURCE_GROUP_ACTIVE_SESSION_THRESHOLD = 4;
const WATCH_SOURCE_GROUP_REVOKED_SESSION_THRESHOLD = 2;
const ADMIN_SESSION_SORT_COLUMN_MAP: Record<
  CloudAdminSessionSortField,
  string
> = {
  updatedAt: "session.updatedAt",
  createdAt: "session.createdAt",
  expiresAt: "session.expiresAt",
  lastUsedAt: "session.lastUsedAt",
  revokedAt: "session.revokedAt",
};

type AdminRefreshJwtPayload = {
  purpose?: string;
  rid?: string;
  sub?: string;
};

@Injectable()
export class AdminAuthService {
  constructor(
    @InjectRepository(CloudAdminSessionEntity)
    private readonly adminSessionRepo: Repository<CloudAdminSessionEntity>,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async issueAccessToken(
    providedSecret: string | undefined,
    auditContext?: AdminSessionAuditContext,
  ): Promise<IssueCloudAdminAccessTokenResponse> {
    const normalizedSecret = providedSecret?.trim();
    const expectedSecret = resolveCloudAdminSecret(this.configService);

    if (
      !normalizedSecret ||
      !matchesCloudAdminSecret(normalizedSecret, expectedSecret)
    ) {
      throw new UnauthorizedException("云世界管理平台未授权。");
    }

    const now = new Date();
    const session = this.adminSessionRepo.create({
      currentRefreshTokenId: randomUUID(),
      expiresAt: this.createAdminRefreshExpiry(now),
      issuedFromIp: auditContext?.ip ?? null,
      issuedUserAgent: auditContext?.userAgent ?? null,
      lastUsedAt: now,
      lastUsedIp: auditContext?.ip ?? null,
      lastUsedUserAgent: auditContext?.userAgent ?? null,
      lastRefreshedAt: null,
      revokedAt: null,
      revokedBySessionId: null,
      revocationReason: null,
    });
    await this.adminSessionRepo.save(session);

    return this.buildSessionResponse(session);
  }

  async refreshAccessToken(
    refreshToken: string,
    auditContext?: AdminSessionAuditContext,
  ): Promise<IssueCloudAdminAccessTokenResponse> {
    const session = await this.resolveActiveSessionFromRefreshToken(
      refreshToken,
      auditContext,
    );
    const now = new Date();

    session.currentRefreshTokenId = randomUUID();
    session.expiresAt = this.createAdminRefreshExpiry(now);
    this.applySessionAudit(session, now, auditContext);
    session.lastRefreshedAt = now;
    await this.adminSessionRepo.save(session);

    return this.buildSessionResponse(session);
  }

  async revokeSession(
    refreshToken: string,
    auditContext?: AdminSessionAuditContext,
  ): Promise<RevokeCloudAdminSessionResponse> {
    const session = await this.resolveActiveSessionFromRefreshToken(
      refreshToken,
      auditContext,
    );
    return this.revokeSessionEntity(session, {
      auditContext,
      revokedBySessionId: session.id,
      revocationReason: "logout",
    });
  }

  async listSessions(
    currentSessionId?: string | null,
    query?: CloudAdminSessionListQuery,
  ): Promise<CloudAdminSessionListResponse> {
    const now = new Date();
    const sortBy = query?.sortBy ?? DEFAULT_ADMIN_SESSION_SORT_FIELD;
    const sortDirection =
      query?.sortDirection ?? DEFAULT_ADMIN_SESSION_SORT_DIRECTION;
    const page = Math.max(
      DEFAULT_ADMIN_SESSION_PAGE,
      query?.page ?? DEFAULT_ADMIN_SESSION_PAGE,
    );
    const pageSize = Math.min(
      100,
      Math.max(
        1,
        query?.pageSize ?? DEFAULT_ADMIN_SESSION_PAGE_SIZE,
      ),
    );
    if (query?.currentOnly && !currentSessionId) {
      return {
        items: [],
        total: 0,
        page,
        pageSize,
        totalPages: 1,
      };
    }

    const sessionsQuery = this.adminSessionRepo.createQueryBuilder("session");

    this.applySessionListFilters(sessionsQuery, currentSessionId, now, query);
    this.applySessionListSorting(sessionsQuery, sortBy, sortDirection);
    const [sessions, total] = await sessionsQuery
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      items: sessions.map((session) =>
        this.buildSessionSummary(session, now, currentSessionId),
      ),
      total,
      page,
      pageSize,
      totalPages: total === 0 ? 1 : Math.ceil(total / pageSize),
    };
  }

  async revokeSessionById(
    sessionId: string,
    revokedBySessionId?: string | null,
  ): Promise<RevokeCloudAdminSessionResponse> {
    const session = await this.adminSessionRepo.findOne({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException("找不到该管理员会话。");
    }

    return this.revokeSessionEntity(session, {
      markAsUsed: false,
      revokedBySessionId,
      revocationReason: "manual-revocation",
    });
  }

  async revokeSessionsById(
    sessionIds: string[],
    revokedBySessionId?: string | null,
  ): Promise<RevokeCloudAdminSessionsByIdResponse> {
    const normalizedSessionIds = [...new Set(sessionIds.map((id) => id.trim()))];
    const sessions = await this.adminSessionRepo.find({
      where: {
        id: In(normalizedSessionIds),
      },
    });
    const sessionMap = new Map(sessions.map((session) => [session.id, session]));
    const revokedSessionIds: string[] = [];
    const skippedSessionIds: string[] = [];

    for (const sessionId of normalizedSessionIds) {
      const session = sessionMap.get(sessionId);
      if (!session || session.revokedAt) {
        skippedSessionIds.push(sessionId);
        continue;
      }

      await this.revokeSessionEntity(session, {
        markAsUsed: false,
        revokedBySessionId,
        revocationReason: "manual-revocation",
      });
      revokedSessionIds.push(session.id);
    }

    return {
      success: true,
      revokedSessionIds,
      skippedSessionIds,
    };
  }

  async revokeFilteredSessions(
    currentSessionId: string | null | undefined,
    filter?: RevokeCloudAdminSessionsByFilterRequest,
  ): Promise<RevokeCloudAdminSessionsByFilterResponse> {
    if (filter?.currentOnly && !currentSessionId) {
      return {
        success: true,
        revokedCount: 0,
        skippedCount: 0,
        revokedCurrentSession: false,
      };
    }

    const now = new Date();
    const sessionsQuery = this.adminSessionRepo.createQueryBuilder("session");
    this.applySessionListFilters(sessionsQuery, currentSessionId, now, filter);

    const sessions = await sessionsQuery.getMany();
    let revokedCount = 0;
    let skippedCount = 0;
    let revokedCurrentSession = false;

    for (const session of sessions) {
      if (session.revokedAt || session.expiresAt.getTime() <= now.getTime()) {
        skippedCount += 1;
        continue;
      }

      await this.revokeSessionEntity(session, {
        markAsUsed: false,
        revokedBySessionId: currentSessionId,
        revocationReason: "manual-revocation",
      });
      revokedCount += 1;
      if (currentSessionId && session.id === currentSessionId) {
        revokedCurrentSession = true;
      }
    }

    return {
      success: true,
      revokedCount,
      skippedCount,
      revokedCurrentSession,
    };
  }

  async listSessionSourceGroups(
    currentSessionId: string | null | undefined,
    query?: CloudAdminSessionSourceGroupQuery,
  ): Promise<CloudAdminSessionSourceGroupListResponse> {
    const sortBy =
      query?.sortBy ?? DEFAULT_ADMIN_SESSION_SOURCE_GROUP_SORT_FIELD;
    const sortDirection =
      query?.sortDirection ??
      DEFAULT_ADMIN_SESSION_SOURCE_GROUP_SORT_DIRECTION;
    const page = Math.max(
      DEFAULT_ADMIN_SESSION_SOURCE_GROUP_PAGE,
      query?.page ?? DEFAULT_ADMIN_SESSION_SOURCE_GROUP_PAGE,
    );
    const pageSize = Math.min(
      100,
      Math.max(
        1,
        query?.pageSize ?? DEFAULT_ADMIN_SESSION_SOURCE_GROUP_PAGE_SIZE,
      ),
    );
    if (query?.currentOnly && !currentSessionId) {
      return {
        items: [],
        total: 0,
        page,
        pageSize,
        totalPages: 1,
      };
    }

    const now = new Date();
    const sessionsQuery = this.adminSessionRepo.createQueryBuilder("session");
    this.applySessionListFilters(sessionsQuery, currentSessionId, now, query);
    const sessions = await sessionsQuery.getMany();
    const groups = this.buildSessionSourceGroupSummaries(
      sessions,
      now,
      currentSessionId,
    ).filter((group) =>
      this.matchesSessionSourceGroupRiskLevel(group, query?.riskLevel),
    );

    const sortedGroups = [...groups].sort((left, right) =>
      this.compareSessionSourceGroups(left, right, sortBy, sortDirection),
    );
    const total = sortedGroups.length;
    const items = sortedGroups.slice((page - 1) * pageSize, page * pageSize);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: total === 0 ? 1 : Math.ceil(total / pageSize),
    };
  }

  async revokeSessionSourceGroup(
    currentSessionId: string | null | undefined,
    request: RevokeCloudAdminSessionSourceGroupRequest,
  ): Promise<RevokeCloudAdminSessionSourceGroupResponse> {
    if (request.currentOnly && !currentSessionId) {
      return {
        success: true,
        revokedCount: 0,
        skippedCount: 0,
        revokedCurrentSession: false,
      };
    }

    const now = new Date();
    const sessionsQuery = this.adminSessionRepo.createQueryBuilder("session");
    this.applySessionListFilters(sessionsQuery, currentSessionId, now, request);

    const sessions = await sessionsQuery.getMany();
    let revokedCount = 0;
    let skippedCount = 0;
    let revokedCurrentSession = false;

    for (const session of sessions) {
      if (session.revokedAt || session.expiresAt.getTime() <= now.getTime()) {
        skippedCount += 1;
        continue;
      }

      await this.revokeSessionEntity(session, {
        markAsUsed: false,
        revokedBySessionId: currentSessionId,
        revocationReason: "manual-revocation",
      });
      revokedCount += 1;
      if (currentSessionId && session.id === currentSessionId) {
        revokedCurrentSession = true;
      }
    }

    return {
      success: true,
      revokedCount,
      skippedCount,
      revokedCurrentSession,
    };
  }

  async revokeSessionSourceGroupsByRisk(
    currentSessionId: string | null | undefined,
    request: RevokeCloudAdminSessionSourceGroupsByRiskRequest,
  ): Promise<RevokeCloudAdminSessionSourceGroupsByRiskResponse> {
    if (request.currentOnly && !currentSessionId) {
      return {
        success: true,
        matchedGroupCount: 0,
        revokedGroupCount: 0,
        revokedSessionCount: 0,
        skippedSessionCount: 0,
        revokedCurrentSession: false,
      };
    }

    const now = new Date();
    const sessionsQuery = this.adminSessionRepo.createQueryBuilder("session");
    this.applySessionListFilters(sessionsQuery, currentSessionId, now, request);
    const sessions = await sessionsQuery.getMany();
    const matchingGroups = this.buildSessionSourceGroupSummaries(
      sessions,
      now,
      currentSessionId,
    ).filter((group) =>
      this.matchesSessionSourceGroupRiskLevel(group, request.riskLevel),
    );
    const matchingSourceKeys = new Set(
      matchingGroups.map((group) => group.sourceKey),
    );
    const revokedSourceKeys = new Set<string>();
    let revokedSessionCount = 0;
    let skippedSessionCount = 0;
    let revokedCurrentSession = false;

    for (const session of sessions) {
      const sourceKey = this.createSessionSourceGroupKey(
        session.issuedFromIp,
        session.issuedUserAgent,
      );
      if (!matchingSourceKeys.has(sourceKey)) {
        continue;
      }
      if (session.revokedAt || session.expiresAt.getTime() <= now.getTime()) {
        skippedSessionCount += 1;
        continue;
      }

      await this.revokeSessionEntity(session, {
        markAsUsed: false,
        revokedBySessionId: currentSessionId,
        revocationReason: "manual-revocation",
      });
      revokedSourceKeys.add(sourceKey);
      revokedSessionCount += 1;
      if (currentSessionId && session.id === currentSessionId) {
        revokedCurrentSession = true;
      }
    }

    return {
      success: true,
      matchedGroupCount: matchingGroups.length,
      revokedGroupCount: revokedSourceKeys.size,
      revokedSessionCount,
      skippedSessionCount,
      revokedCurrentSession,
    };
  }

  async createSessionSourceGroupSnapshot(
    currentSessionId: string | null | undefined,
    request: CreateCloudAdminSessionSourceGroupSnapshotRequest,
  ): Promise<CloudAdminSessionSourceGroupSnapshot> {
    const now = new Date();
    const source = this.parseSessionSourceGroupKey(request.sourceKey);
    const sourceKey = this.createSessionSourceGroupKey(
      source.issuedFromIp,
      source.issuedUserAgent,
    );
    if (request.currentOnly && !currentSessionId) {
      return {
        generatedAt: now.toISOString(),
        filters: {
          status: request.status,
          revocationReason: request.revocationReason,
          currentOnly: request.currentOnly,
          query: request.query,
          sourceKey: request.sourceKey,
        },
        group: {
          sourceKey,
          issuedFromIp: source.issuedFromIp,
          issuedUserAgent: source.issuedUserAgent,
          totalSessions: 0,
          activeSessions: 0,
          expiredSessions: 0,
          revokedSessions: 0,
          refreshTokenReuseRevocations: 0,
          currentSessions: 0,
          riskLevel: "normal",
          riskSignals: [],
          latestCreatedAt: null,
          latestLastUsedAt: null,
          latestRevokedAt: null,
        },
        sessions: [],
      };
    }

    const sessionsQuery = this.adminSessionRepo.createQueryBuilder("session");
    this.applySessionListFilters(sessionsQuery, currentSessionId, now, request);
    this.applySessionListSorting(
      sessionsQuery,
      DEFAULT_ADMIN_SESSION_SORT_FIELD,
      DEFAULT_ADMIN_SESSION_SORT_DIRECTION,
    );
    const sessions = await sessionsQuery.getMany();

    return {
      generatedAt: now.toISOString(),
      filters: {
        status: request.status,
        revocationReason: request.revocationReason,
        currentOnly: request.currentOnly,
        query: request.query,
        sourceKey: request.sourceKey,
      },
      group: this.buildSessionSourceGroupSnapshotSummary(
        sessions,
        now,
        currentSessionId,
        sourceKey,
        source,
      ),
      sessions: sessions.map((session) =>
        this.buildSessionSummary(session, now, currentSessionId),
      ),
    };
  }

  async createSessionSourceGroupRiskSnapshot(
    currentSessionId: string | null | undefined,
    request: CreateCloudAdminSessionSourceGroupRiskSnapshotRequest,
  ): Promise<CloudAdminSessionSourceGroupRiskSnapshot> {
    const now = new Date();
    if (request.currentOnly && !currentSessionId) {
      return {
        generatedAt: now.toISOString(),
        filters: {
          status: request.status,
          revocationReason: request.revocationReason,
          currentOnly: request.currentOnly,
          query: request.query,
          sourceKey: request.sourceKey,
          riskLevel: request.riskLevel,
        },
        totalGroups: 0,
        totalSessions: 0,
        groups: [],
        sessions: [],
      };
    }

    const sessionsQuery = this.adminSessionRepo.createQueryBuilder("session");
    this.applySessionListFilters(sessionsQuery, currentSessionId, now, request);
    this.applySessionListSorting(
      sessionsQuery,
      DEFAULT_ADMIN_SESSION_SORT_FIELD,
      DEFAULT_ADMIN_SESSION_SORT_DIRECTION,
    );
    const sessions = await sessionsQuery.getMany();
    const matchingGroups = this.buildSessionSourceGroupSummaries(
      sessions,
      now,
      currentSessionId,
    )
      .filter((group) =>
        this.matchesSessionSourceGroupRiskLevel(group, request.riskLevel),
      )
      .sort((left, right) =>
        this.compareSessionSourceGroups(
          left,
          right,
          DEFAULT_ADMIN_SESSION_SOURCE_GROUP_SORT_FIELD,
          DEFAULT_ADMIN_SESSION_SOURCE_GROUP_SORT_DIRECTION,
        ),
      );
    const matchingSourceKeys = new Set(
      matchingGroups.map((group) => group.sourceKey),
    );
    const matchingSessions = sessions.filter((session) =>
      matchingSourceKeys.has(
        this.createSessionSourceGroupKey(
          session.issuedFromIp,
          session.issuedUserAgent,
        ),
      ),
    );

    return {
      generatedAt: now.toISOString(),
      filters: {
        status: request.status,
        revocationReason: request.revocationReason,
        currentOnly: request.currentOnly,
        query: request.query,
        sourceKey: request.sourceKey,
        riskLevel: request.riskLevel,
      },
      totalGroups: matchingGroups.length,
      totalSessions: matchingSessions.length,
      groups: matchingGroups,
      sessions: matchingSessions.map((session) =>
        this.buildSessionSummary(session, now, currentSessionId),
      ),
    };
  }

  async requireSessionForAccess(
    sessionId: string,
    auditContext?: AdminSessionAuditContext,
  ) {
    const session = await this.adminSessionRepo.findOne({
      where: { id: sessionId },
    });
    if (!session) {
      throw new UnauthorizedException("云世界管理平台未授权。");
    }

    const now = new Date();
    if (session.revokedAt || session.expiresAt.getTime() <= now.getTime()) {
      throw new UnauthorizedException("云世界管理平台未授权。");
    }

    if (this.shouldTouchSessionUsage(session, now, auditContext)) {
      this.applySessionAudit(session, now, auditContext);
      await this.adminSessionRepo.save(session);
    }

    return session;
  }

  private async buildSessionResponse(
    session: CloudAdminSessionEntity,
  ): Promise<IssueCloudAdminAccessTokenResponse> {
    const accessExpiresIn = resolveCloudAdminTokenTtl(this.configService);
    const issuer = resolveCloudJwtIssuer(this.configService);
    const accessAudience = resolveCloudAdminJwtAudience(this.configService);
    const refreshAudience = resolveCloudAdminRefreshJwtAudience(
      this.configService,
    );
    const accessToken = await this.jwtService.signAsync(
      {
        sid: session.id,
        role: CLOUD_ADMIN_ACCESS_TOKEN_ROLE,
        purpose: CLOUD_ADMIN_ACCESS_TOKEN_PURPOSE,
      },
      {
        expiresIn: accessExpiresIn as never,
        issuer,
        audience: accessAudience,
        subject: CLOUD_ADMIN_ACCESS_TOKEN_SUBJECT,
      },
    );
    const refreshToken = await this.jwtService.signAsync(
      {
        rid: session.currentRefreshTokenId,
        purpose: CLOUD_ADMIN_REFRESH_TOKEN_PURPOSE,
      },
      {
        expiresIn: resolveCloudAdminRefreshTokenTtl(this.configService) as never,
        issuer,
        audience: refreshAudience,
        subject: session.id,
      },
    );

    return {
      accessToken,
      expiresAt: new Date(
        Date.now() +
          (parseJwtDurationToMs(accessExpiresIn) ?? FALLBACK_ADMIN_TOKEN_TTL_MS),
      ).toISOString(),
      refreshToken,
      refreshExpiresAt: session.expiresAt.toISOString(),
      tokenType: "Bearer",
    };
  }

  private async resolveActiveSessionFromRefreshToken(
    refreshToken: string,
    auditContext?: AdminSessionAuditContext,
  ) {
    const token = refreshToken.trim();
    if (!token) {
      throw new UnauthorizedException("云世界管理平台未授权。");
    }

    let payload: AdminRefreshJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<AdminRefreshJwtPayload>(token, {
        issuer: resolveCloudJwtIssuer(this.configService),
        audience: resolveCloudAdminRefreshJwtAudience(this.configService),
      });
    } catch {
      throw new UnauthorizedException("云世界管理平台未授权。");
    }

    if (
      payload.purpose !== CLOUD_ADMIN_REFRESH_TOKEN_PURPOSE ||
      !payload.rid ||
      !payload.sub
    ) {
      throw new UnauthorizedException("云世界管理平台未授权。");
    }

    const session = await this.adminSessionRepo.findOne({
      where: { id: payload.sub },
    });
    if (!session) {
      throw new UnauthorizedException("云世界管理平台未授权。");
    }

    const now = new Date();
    if (session.revokedAt || session.expiresAt.getTime() <= now.getTime()) {
      throw new UnauthorizedException("云世界管理平台未授权。");
    }

    if (session.currentRefreshTokenId !== payload.rid) {
      await this.revokeSessionEntity(session, {
        auditContext,
        revocationReason: "refresh-token-reuse",
      });
      throw new UnauthorizedException("云世界管理平台未授权。");
    }

    return session;
  }

  private async revokeSessionEntity(
    session: CloudAdminSessionEntity,
    options?: {
      auditContext?: AdminSessionAuditContext;
      markAsUsed?: boolean;
      revokedBySessionId?: string | null;
      revocationReason?: CloudAdminSessionRevocationReason | null;
    },
  ): Promise<RevokeCloudAdminSessionResponse> {
    const now = new Date();
    session.revokedAt = session.revokedAt ?? now;
    session.revokedBySessionId =
      session.revokedBySessionId ?? options?.revokedBySessionId ?? null;
    session.revocationReason =
      session.revocationReason ?? options?.revocationReason ?? null;
    if (options?.markAsUsed !== false) {
      this.applySessionAudit(session, now, options?.auditContext);
    }
    await this.adminSessionRepo.save(session);

    return {
      success: true,
    };
  }

  private buildSessionSummary(
    session: CloudAdminSessionEntity,
    now: Date,
    currentSessionId?: string | null,
  ): CloudAdminSessionSummary {
    return {
      id: session.id,
      status: this.resolveSessionStatus(session, now),
      isCurrent: session.id === currentSessionId,
      expiresAt: session.expiresAt.toISOString(),
      issuedFromIp: session.issuedFromIp,
      issuedUserAgent: session.issuedUserAgent,
      lastUsedAt: session.lastUsedAt?.toISOString() ?? null,
      lastUsedIp: session.lastUsedIp,
      lastUsedUserAgent: session.lastUsedUserAgent,
      lastRefreshedAt: session.lastRefreshedAt?.toISOString() ?? null,
      revokedAt: session.revokedAt?.toISOString() ?? null,
      revokedBySessionId: session.revokedBySessionId,
      revocationReason: (session.revocationReason as
        | CloudAdminSessionRevocationReason
        | null
        | undefined) ?? null,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }

  private resolveSessionStatus(
    session: CloudAdminSessionEntity,
    now: Date,
  ): CloudAdminSessionStatus {
    if (session.revokedAt) {
      return "revoked";
    }
    if (session.expiresAt.getTime() <= now.getTime()) {
      return "expired";
    }

    return "active";
  }

  private buildSessionSourceGroupSnapshotSummary(
    sessions: CloudAdminSessionEntity[],
    now: Date,
    currentSessionId: string | null | undefined,
    sourceKey: string,
    source: {
      issuedFromIp: string | null;
      issuedUserAgent: string | null;
    },
  ): CloudAdminSessionSourceGroupSnapshotSummary {
    const summary: CloudAdminSessionSourceGroupSnapshotSummary = {
      sourceKey,
      issuedFromIp: source.issuedFromIp,
      issuedUserAgent: source.issuedUserAgent,
      totalSessions: 0,
      activeSessions: 0,
      expiredSessions: 0,
      revokedSessions: 0,
      refreshTokenReuseRevocations: 0,
      currentSessions: 0,
      riskLevel: "normal",
      riskSignals: [],
      latestCreatedAt: null,
      latestLastUsedAt: null,
      latestRevokedAt: null,
    };

    for (const session of sessions) {
      const status = this.resolveSessionStatus(session, now);
      summary.totalSessions += 1;
      if (status === "active") {
        summary.activeSessions += 1;
      } else if (status === "expired") {
        summary.expiredSessions += 1;
      } else {
        summary.revokedSessions += 1;
      }
      if (session.revocationReason === "refresh-token-reuse") {
        summary.refreshTokenReuseRevocations += 1;
      }
      if (currentSessionId && session.id === currentSessionId) {
        summary.currentSessions += 1;
      }

      const createdAt = session.createdAt.toISOString();
      const lastUsedAt = session.lastUsedAt?.toISOString() ?? null;
      const revokedAt = session.revokedAt?.toISOString() ?? null;
      if (
        this.compareOptionalIsoDateStrings(
          createdAt,
          summary.latestCreatedAt,
        ) < 0
      ) {
        summary.latestCreatedAt = createdAt;
      }
      if (
        this.compareOptionalIsoDateStrings(
          lastUsedAt,
          summary.latestLastUsedAt,
        ) < 0
      ) {
        summary.latestLastUsedAt = lastUsedAt;
      }
      if (
        this.compareOptionalIsoDateStrings(
          revokedAt,
          summary.latestRevokedAt,
        ) < 0
      ) {
        summary.latestRevokedAt = revokedAt;
      }
    }

    this.applySessionSourceGroupRisk(summary);

    return summary;
  }

  private buildSessionSourceGroupSummaries(
    sessions: CloudAdminSessionEntity[],
    now: Date,
    currentSessionId: string | null | undefined,
  ) {
    const groups = new Map<string, CloudAdminSessionSourceGroupSummary>();

    for (const session of sessions) {
      const status = this.resolveSessionStatus(session, now);
      const issuedFromIp = session.issuedFromIp ?? null;
      const issuedUserAgent = session.issuedUserAgent ?? null;
      const sourceKey = this.createSessionSourceGroupKey(
        issuedFromIp,
        issuedUserAgent,
      );
      const createdAt = session.createdAt.toISOString();
      const lastUsedAt = session.lastUsedAt?.toISOString() ?? null;
      const revokedAt = session.revokedAt?.toISOString() ?? null;
      const existingGroup = groups.get(sourceKey);
      if (!existingGroup) {
        groups.set(sourceKey, {
          sourceKey,
          issuedFromIp,
          issuedUserAgent,
          totalSessions: 1,
          activeSessions: status === "active" ? 1 : 0,
          expiredSessions: status === "expired" ? 1 : 0,
          revokedSessions: status === "revoked" ? 1 : 0,
          refreshTokenReuseRevocations:
            session.revocationReason === "refresh-token-reuse" ? 1 : 0,
          currentSessions:
            currentSessionId && session.id === currentSessionId ? 1 : 0,
          riskLevel: "normal",
          riskSignals: [],
          latestCreatedAt: createdAt,
          latestLastUsedAt: lastUsedAt,
          latestRevokedAt: revokedAt,
        });
        continue;
      }

      existingGroup.totalSessions += 1;
      if (status === "active") {
        existingGroup.activeSessions += 1;
      } else if (status === "expired") {
        existingGroup.expiredSessions += 1;
      } else {
        existingGroup.revokedSessions += 1;
      }
      if (session.revocationReason === "refresh-token-reuse") {
        existingGroup.refreshTokenReuseRevocations += 1;
      }
      if (currentSessionId && session.id === currentSessionId) {
        existingGroup.currentSessions += 1;
      }
      if (
        this.compareOptionalIsoDateStrings(
          createdAt,
          existingGroup.latestCreatedAt,
        ) < 0
      ) {
        existingGroup.latestCreatedAt = createdAt;
      }
      if (
        this.compareOptionalIsoDateStrings(
          lastUsedAt,
          existingGroup.latestLastUsedAt,
        ) < 0
      ) {
        existingGroup.latestLastUsedAt = lastUsedAt;
      }
      if (
        this.compareOptionalIsoDateStrings(
          revokedAt,
          existingGroup.latestRevokedAt,
        ) < 0
      ) {
        existingGroup.latestRevokedAt = revokedAt;
      }
    }

    const summaries = [...groups.values()];
    for (const group of summaries) {
      this.applySessionSourceGroupRisk(group);
    }
    return summaries;
  }

  private applySessionSourceGroupRisk(
    summary:
      | CloudAdminSessionSourceGroupSummary
      | CloudAdminSessionSourceGroupSnapshotSummary,
  ) {
    const riskSignals: CloudAdminSessionSourceGroupRiskSignal[] = [];
    if (
      summary.activeSessions >= WATCH_SOURCE_GROUP_ACTIVE_SESSION_THRESHOLD
    ) {
      riskSignals.push("multiple-active-sessions");
    }
    if (
      summary.revokedSessions >= WATCH_SOURCE_GROUP_REVOKED_SESSION_THRESHOLD
    ) {
      riskSignals.push("repeated-revocations");
    }
    if (summary.refreshTokenReuseRevocations > 0) {
      riskSignals.push("refresh-token-reuse");
    }

    let riskLevel: CloudAdminSessionSourceGroupRiskLevel = "normal";
    if (
      summary.refreshTokenReuseRevocations > 0 ||
      summary.activeSessions >= CRITICAL_SOURCE_GROUP_ACTIVE_SESSION_THRESHOLD
    ) {
      riskLevel = "critical";
    } else if (riskSignals.length > 0) {
      riskLevel = "watch";
    }

    summary.riskLevel = riskLevel;
    summary.riskSignals = riskSignals;
  }

  private matchesSessionSourceGroupRiskLevel(
    summary: CloudAdminSessionSourceGroupSummary,
    riskLevel?: CloudAdminSessionSourceGroupRiskLevel,
  ) {
    if (!riskLevel) {
      return true;
    }

    return summary.riskLevel === riskLevel;
  }

  private createAdminRefreshExpiry(now = new Date()) {
    const ttlMs =
      parseJwtDurationToMs(
        resolveCloudAdminRefreshTokenTtl(this.configService),
      ) ?? FALLBACK_ADMIN_REFRESH_TOKEN_TTL_MS;
    return new Date(now.getTime() + ttlMs);
  }

  private applySessionAudit(
    session: CloudAdminSessionEntity,
    now: Date,
    auditContext?: AdminSessionAuditContext,
  ) {
    session.lastUsedAt = now;
    session.lastUsedIp = auditContext?.ip ?? null;
    session.lastUsedUserAgent = auditContext?.userAgent ?? null;
  }

  private shouldTouchSessionUsage(
    session: CloudAdminSessionEntity,
    now: Date,
    auditContext?: AdminSessionAuditContext,
  ) {
    if (!session.lastUsedAt) {
      return true;
    }
    if ((auditContext?.ip ?? null) !== (session.lastUsedIp ?? null)) {
      return true;
    }
    if (
      (auditContext?.userAgent ?? null) !==
      (session.lastUsedUserAgent ?? null)
    ) {
      return true;
    }

    return (
      now.getTime() - session.lastUsedAt.getTime() >=
      ADMIN_SESSION_LAST_USED_TOUCH_WINDOW_MS
    );
  }

  private applySessionListFilters(
    sessionsQuery: SelectQueryBuilder<CloudAdminSessionEntity>,
    currentSessionId: string | null | undefined,
    now: Date,
    query?: Pick<
      CloudAdminSessionListQuery,
      "status" | "revocationReason" | "currentOnly" | "query" | "sourceKey"
    >,
  ) {
    const nowForSql = this.formatSqliteDateTime(now);
    if (query?.status === "active") {
      this.applyActiveSessionOnlyFilter(sessionsQuery, now);
    } else if (query?.status === "expired") {
      sessionsQuery.andWhere("session.revokedAt IS NULL");
      sessionsQuery.andWhere("session.expiresAt <= :expiredNow", {
        expiredNow: nowForSql,
      });
    } else if (query?.status === "revoked") {
      sessionsQuery.andWhere("session.revokedAt IS NOT NULL");
    }

    if (query?.revocationReason) {
      sessionsQuery.andWhere("session.revocationReason = :revocationReason", {
        revocationReason: query.revocationReason,
      });
    }

    if (query?.currentOnly && currentSessionId) {
      sessionsQuery.andWhere("session.id = :currentSessionId", {
        currentSessionId,
      });
    }

    if (query?.sourceKey) {
      const source = this.parseSessionSourceGroupKey(query.sourceKey);
      this.applySessionSourceGroupFilter(sessionsQuery, source);
    }

    const search = query?.query?.trim().toLowerCase();
    if (search) {
      const like = `%${search}%`;
      sessionsQuery.andWhere(
        new Brackets((builder) => {
          builder.where("LOWER(session.id) LIKE :sessionSearch", {
            sessionSearch: like,
          });
          builder.orWhere("LOWER(COALESCE(session.issuedFromIp, '')) LIKE :sessionSearch", {
            sessionSearch: like,
          });
          builder.orWhere("LOWER(COALESCE(session.issuedUserAgent, '')) LIKE :sessionSearch", {
            sessionSearch: like,
          });
          builder.orWhere("LOWER(COALESCE(session.lastUsedIp, '')) LIKE :sessionSearch", {
            sessionSearch: like,
          });
          builder.orWhere("LOWER(COALESCE(session.lastUsedUserAgent, '')) LIKE :sessionSearch", {
            sessionSearch: like,
          });
          builder.orWhere("LOWER(COALESCE(session.revokedBySessionId, '')) LIKE :sessionSearch", {
            sessionSearch: like,
          });
          builder.orWhere("LOWER(COALESCE(session.revocationReason, '')) LIKE :sessionSearch", {
            sessionSearch: like,
          });
        }),
      );
    }
  }

  private createSessionSourceGroupKey(
    issuedFromIp?: string | null,
    issuedUserAgent?: string | null,
  ) {
    return Buffer.from(
      JSON.stringify([issuedFromIp ?? null, issuedUserAgent ?? null]),
      "utf8",
    ).toString("base64url");
  }

  private parseSessionSourceGroupKey(sourceKey: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(
        Buffer.from(sourceKey.trim(), "base64url").toString("utf8"),
      );
    } catch {
      throw new BadRequestException("sourceKey 无效。");
    }

    if (!Array.isArray(parsed) || parsed.length !== 2) {
      throw new BadRequestException("sourceKey 无效。");
    }

    const [issuedFromIp, issuedUserAgent] = parsed;
    if (issuedFromIp !== null && typeof issuedFromIp !== "string") {
      throw new BadRequestException("sourceKey 无效。");
    }
    if (issuedUserAgent !== null && typeof issuedUserAgent !== "string") {
      throw new BadRequestException("sourceKey 无效。");
    }

    return {
      issuedFromIp,
      issuedUserAgent,
    };
  }

  private applySessionSourceGroupFilter(
    sessionsQuery: SelectQueryBuilder<CloudAdminSessionEntity>,
    source: {
      issuedFromIp: string | null;
      issuedUserAgent: string | null;
    },
  ) {
    if (source.issuedFromIp === null) {
      sessionsQuery.andWhere("session.issuedFromIp IS NULL");
    } else {
      sessionsQuery.andWhere("session.issuedFromIp = :issuedFromIp", {
        issuedFromIp: source.issuedFromIp,
      });
    }

    if (source.issuedUserAgent === null) {
      sessionsQuery.andWhere("session.issuedUserAgent IS NULL");
    } else {
      sessionsQuery.andWhere("session.issuedUserAgent = :issuedUserAgent", {
        issuedUserAgent: source.issuedUserAgent,
      });
    }
  }

  private applyActiveSessionOnlyFilter(
    sessionsQuery: SelectQueryBuilder<CloudAdminSessionEntity>,
    now: Date,
  ) {
    sessionsQuery.andWhere("session.revokedAt IS NULL");
    sessionsQuery.andWhere("session.expiresAt > :activeNow", {
      activeNow: this.formatSqliteDateTime(now),
    });
  }

  private applySessionListSorting(
    sessionsQuery: SelectQueryBuilder<CloudAdminSessionEntity>,
    sortBy: CloudAdminSessionSortField,
    sortDirection: CloudAdminSessionSortDirection,
  ) {
    const sortColumn =
      ADMIN_SESSION_SORT_COLUMN_MAP[sortBy] ??
      ADMIN_SESSION_SORT_COLUMN_MAP[DEFAULT_ADMIN_SESSION_SORT_FIELD];
    const direction = this.resolveSqlSortDirection(sortDirection);

    sessionsQuery
      .orderBy(`CASE WHEN ${sortColumn} IS NULL THEN 1 ELSE 0 END`, "ASC")
      .addOrderBy(sortColumn, direction);

    if (sortColumn !== "session.updatedAt") {
      sessionsQuery.addOrderBy("session.updatedAt", "DESC");
    }
    if (sortColumn !== "session.createdAt") {
      sessionsQuery.addOrderBy("session.createdAt", "DESC");
    }

    sessionsQuery.addOrderBy("session.id", "ASC");
  }

  private resolveSqlSortDirection(
    sortDirection: CloudAdminSessionSortDirection,
  ): "ASC" | "DESC" {
    return sortDirection === "asc" ? "ASC" : "DESC";
  }

  private compareOptionalIsoDateStrings(
    left?: string | null,
    right?: string | null,
  ) {
    const leftTimestamp = left ? Date.parse(left) : Number.NaN;
    const rightTimestamp = right ? Date.parse(right) : Number.NaN;
    const hasLeft = Number.isFinite(leftTimestamp);
    const hasRight = Number.isFinite(rightTimestamp);

    if (!hasLeft && !hasRight) {
      return 0;
    }
    if (!hasLeft) {
      return 1;
    }
    if (!hasRight) {
      return -1;
    }
    if (leftTimestamp === rightTimestamp) {
      return 0;
    }

    return rightTimestamp - leftTimestamp;
  }

  private compareNumericValues(
    left: number,
    right: number,
    sortDirection: CloudAdminSessionSortDirection,
  ) {
    if (left === right) {
      return 0;
    }

    return sortDirection === "asc" ? left - right : right - left;
  }

  private compareDateValues(
    left?: string | null,
    right?: string | null,
    sortDirection: CloudAdminSessionSortDirection = "desc",
  ) {
    const result = this.compareOptionalIsoDateStrings(left, right);
    return sortDirection === "asc" ? result * -1 : result;
  }

  private compareSessionSourceGroups(
    left: CloudAdminSessionSourceGroupSummary,
    right: CloudAdminSessionSourceGroupSummary,
    sortBy: CloudAdminSessionSourceGroupSortField,
    sortDirection: CloudAdminSessionSortDirection,
  ) {
    let primaryResult = 0;

    switch (sortBy) {
      case "activeSessions":
        primaryResult = this.compareNumericValues(
          left.activeSessions,
          right.activeSessions,
          sortDirection,
        );
        break;
      case "totalSessions":
        primaryResult = this.compareNumericValues(
          left.totalSessions,
          right.totalSessions,
          sortDirection,
        );
        break;
      case "latestCreatedAt":
        primaryResult = this.compareDateValues(
          left.latestCreatedAt,
          right.latestCreatedAt,
          sortDirection,
        );
        break;
      case "latestLastUsedAt":
        primaryResult = this.compareDateValues(
          left.latestLastUsedAt,
          right.latestLastUsedAt,
          sortDirection,
        );
        break;
      case "latestRevokedAt":
        primaryResult = this.compareDateValues(
          left.latestRevokedAt,
          right.latestRevokedAt,
          sortDirection,
        );
        break;
      default:
        primaryResult = 0;
        break;
    }

    if (primaryResult !== 0) {
      return primaryResult;
    }

    const activeSessionsResult = this.compareNumericValues(
      left.activeSessions,
      right.activeSessions,
      "desc",
    );
    if (activeSessionsResult !== 0) {
      return activeSessionsResult;
    }

    const totalSessionsResult = this.compareNumericValues(
      left.totalSessions,
      right.totalSessions,
      "desc",
    );
    if (totalSessionsResult !== 0) {
      return totalSessionsResult;
    }

    const latestLastUsedResult = this.compareDateValues(
      left.latestLastUsedAt,
      right.latestLastUsedAt,
      "desc",
    );
    if (latestLastUsedResult !== 0) {
      return latestLastUsedResult;
    }

    const latestCreatedResult = this.compareDateValues(
      left.latestCreatedAt,
      right.latestCreatedAt,
      "desc",
    );
    if (latestCreatedResult !== 0) {
      return latestCreatedResult;
    }

    return left.sourceKey.localeCompare(right.sourceKey);
  }

  private formatSqliteDateTime(value: Date) {
    return value.toISOString().replace("T", " ").replace("Z", "");
  }
}
