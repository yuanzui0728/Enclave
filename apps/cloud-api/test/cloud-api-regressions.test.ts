import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { WorldLifecycleJobType } from "@yinjie/contracts";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { DataSource } from "typeorm";
import { AdminCloudController } from "../src/admin/admin-cloud.controller";
import { AdminAuthService } from "../src/auth/admin-auth.service";
import { CloudAdminSessionEntity } from "../src/entities/cloud-admin-session.entity";
import { CloudService } from "../src/cloud/cloud.service";
import { CloudInstanceEntity } from "../src/entities/cloud-instance.entity";
import { CloudWorldEntity } from "../src/entities/cloud-world.entity";
import { CloudWorldRequestEntity } from "../src/entities/cloud-world-request.entity";
import {
  CreateAdminSessionSourceGroupRiskSnapshotDto,
  CreateAdminSessionSourceGroupSnapshotDto,
  ListAdminSessionSourceGroupsQueryDto,
  ListAdminSessionsQueryDto,
  ListJobsQueryDto,
  ListWaitingSessionSyncTasksQueryDto,
  MutateFailedWaitingSessionSyncTasksDto,
  MutateFilteredFailedWaitingSessionSyncTasksDto,
  RevokeAdminSessionSourceGroupDto,
  RevokeAdminSessionSourceGroupsByRiskDto,
  RevokeFilteredAdminSessionsDto,
} from "../src/http-dto/cloud-api.dto";
import { WorldAccessSessionEntity } from "../src/entities/world-access-session.entity";
import { WaitingSessionSyncTaskEntity } from "../src/entities/waiting-session-sync-task.entity";
import { WorldLifecycleJobEntity } from "../src/entities/world-lifecycle-job.entity";
import { WorldLifecycleWorkerService } from "../src/orchestration/world-lifecycle-worker.service";
import { WorldRuntimeService } from "../src/runtime-callbacks/world-runtime.service";
import {
  getRequestPhoneAvailability,
  type RequestPhoneAvailabilityWorld,
} from "../src/request-phone-availability";
import {
  getRequestGateState,
  REQUEST_GATE_FAILURE_CODE_BY_STATUS,
  type RequestGateFailureCode,
} from "../src/request-gate-state";
import {
  getRequestRecordProjection,
  getRequestVisibleWorldProjection,
  getRequestWorldProjection,
  getRequestWorldSyncDecision,
} from "../src/request-world-sync-state";
import { WorldAccessService } from "../src/world-access/world-access.service";
import { WaitingSessionSyncService } from "../src/world-access/waiting-session-sync.service";

const providerSummary = {
  key: "manual-docker",
  label: "Manual Docker",
  description: "test provider",
  provisionStrategy: "manual-docker",
  deploymentMode: "manual-docker",
  defaultRegion: "manual",
  defaultZone: "docker-host-a",
  capabilities: {
    managedProvisioning: false,
    managedLifecycle: false,
    bootstrapPackage: true,
    snapshots: false,
  },
};

const REQUEST_GATE_PENDING_FAILURE_CODE =
  REQUEST_GATE_FAILURE_CODE_BY_STATUS.pending;
const REQUEST_GATE_DISABLED_FAILURE_CODE =
  REQUEST_GATE_FAILURE_CODE_BY_STATUS.disabled;
const REQUEST_GATE_REJECTED_FAILURE_CODE =
  REQUEST_GATE_FAILURE_CODE_BY_STATUS.rejected;
const PHONE_CHANGE_INVALIDATED_ACCESS_SESSION_REASON =
  "该申请绑定的手机号已变更，请使用新的手机号重新发起进入。";
const REQUEST_PHONE_AVAILABILITY_PLACEHOLDER_WORLD: RequestPhoneAvailabilityWorld =
  {
    status: "disabled",
    failureCode: REQUEST_GATE_PENDING_FAILURE_CODE,
    apiBaseUrl: null,
    adminUrl: null,
    lastAccessedAt: null,
    lastInteractiveAt: null,
    lastBootedAt: null,
    lastHeartbeatAt: null,
    lastSuspendedAt: null,
  };
const REQUEST_PHONE_AVAILABILITY_VISIBLE_WORLD: RequestPhoneAvailabilityWorld = {
  status: "ready",
  failureCode: null,
  apiBaseUrl: "https://visible-world.example.com",
  adminUrl: "https://visible-world-admin.example.com",
  lastAccessedAt: null,
  lastInteractiveAt: null,
  lastBootedAt: null,
  lastHeartbeatAt: null,
  lastSuspendedAt: null,
};

type RequestGateStatusForTest = "pending" | "disabled" | "rejected";

function getRequestGateFailureReasonForTest(
  status: RequestGateStatusForTest,
  note?: string | null,
) {
  return getRequestGateState(status, note).failureReason;
}

function getRequestGateDisplayStatusForTest(
  status: RequestGateStatusForTest,
) {
  return getRequestGateState(status).displayStatus;
}

async function createTestDataSource() {
  const dataSource = new DataSource({
    type: "better-sqlite3",
    database: ":memory:",
    entities: [
      CloudAdminSessionEntity,
      CloudWorldEntity,
      CloudInstanceEntity,
      CloudWorldRequestEntity,
      WorldLifecycleJobEntity,
      WorldAccessSessionEntity,
      WaitingSessionSyncTaskEntity,
    ],
    synchronize: true,
  });

  await dataSource.initialize();
  return dataSource;
}

function createCloudService(
  dataSource: DataSource,
  overrides?: {
    waitingSessionSyncService?: Pick<
      WaitingSessionSyncService,
      | "refreshWaitingSessionsForWorld"
      | "refreshWaitingSessionsForPhone"
      | "invalidateWaitingSessionsForPhone"
      | "replayFailedTasks"
      | "clearFailedTasks"
    >;
    worldLifecycleWorker?: Pick<WorldLifecycleWorkerService, "reconcileWorldNow">;
  },
) {
  return new CloudService(
    dataSource.getRepository(CloudWorldEntity),
    dataSource.getRepository(CloudInstanceEntity),
    dataSource.getRepository(CloudWorldRequestEntity),
    dataSource.getRepository(WorldLifecycleJobEntity),
    dataSource.getRepository(WaitingSessionSyncTaskEntity),
    {
      get: () => undefined,
    } as never,
    {
      normalizePhone: (phone: string) => phone.trim(),
    } as never,
    {
      getProvider: () => ({
        key: providerSummary.key,
        summary: providerSummary,
        inspectInstance: async () => ({
          deploymentState: "running" as const,
          providerMessage: null,
          rawStatus: "running",
        }),
      }),
      getDefaultProviderKey: () => providerSummary.key,
      listProviders: () => [providerSummary],
    } as never,
    (overrides?.worldLifecycleWorker ?? {}) as never,
    (overrides?.waitingSessionSyncService ?? {
      refreshWaitingSessionsForWorld: async () => undefined,
      refreshWaitingSessionsForPhone: async () => undefined,
      invalidateWaitingSessionsForPhone: async () => undefined,
      replayFailedTasks: async () => ({
        success: true as const,
        replayedTaskIds: [],
        skippedTaskIds: [],
      }),
      clearFailedTasks: async () => ({
        success: true as const,
        clearedTaskIds: [],
        skippedTaskIds: [],
      }),
    }) as never,
  );
}

function createWorldAccessService(dataSource: DataSource) {
  return new WorldAccessService(
    dataSource.getRepository(CloudWorldEntity),
    dataSource.getRepository(CloudInstanceEntity),
    dataSource.getRepository(CloudWorldRequestEntity),
    dataSource.getRepository(WorldLifecycleJobEntity),
    dataSource.getRepository(WorldAccessSessionEntity),
    {
      getProvider: () => ({
        key: providerSummary.key,
        summary: providerSummary,
      }),
      getDefaultProviderKey: () => providerSummary.key,
    } as never,
    {
      normalizePhone: (phone: string) => phone.trim(),
    } as never,
  );
}

function createWaitingSessionSyncService(
  dataSource: DataSource,
  worldAccessService: Pick<
    WorldAccessService,
    | "refreshWaitingSessionsForWorld"
    | "refreshWaitingSessionsForPhone"
    | "invalidateWaitingSessionsForPhone"
  >,
  config: Record<string, string | undefined> = {},
) {
  return new WaitingSessionSyncService(
    dataSource.getRepository(WaitingSessionSyncTaskEntity),
    worldAccessService as never,
    {
      get: (key: string) => config[key],
    } as never,
  );
}

function createWorldRuntimeService(
  dataSource: DataSource,
  overrides?: {
    waitingSessionSyncService?: Pick<
      WaitingSessionSyncService,
      "refreshWaitingSessionsForWorld"
    >;
  },
) {
  return new WorldRuntimeService(
    dataSource.getRepository(CloudWorldEntity),
    dataSource.getRepository(CloudInstanceEntity),
    (overrides?.waitingSessionSyncService ?? {
      refreshWaitingSessionsForWorld: async () => undefined,
    }) as never,
  );
}

function createAdminAuthService(dataSource: DataSource) {
  return new AdminAuthService(
    dataSource.getRepository(CloudAdminSessionEntity),
    {} as never,
    {} as never,
  );
}

function createWorkerService(
  dataSource: DataSource,
  config: Record<string, string | undefined> = {},
  overrides?: {
    waitingSessionSyncService?: Pick<
      WaitingSessionSyncService,
      "refreshWaitingSessionsForWorld"
    >;
  },
) {
  return new WorldLifecycleWorkerService(
    dataSource.getRepository(CloudWorldEntity),
    dataSource.getRepository(CloudInstanceEntity),
    dataSource.getRepository(WorldLifecycleJobEntity),
    dataSource.getRepository(WorldAccessSessionEntity),
    {
      get: (key: string) => config[key],
    } as never,
    {
      notifyJobFailed: async () => undefined,
      notifyProviderError: async () => undefined,
    } as never,
    {
      getProvider: () => ({
        key: providerSummary.key,
        summary: providerSummary,
        createInstance: async () => {
          throw new Error("not used in regression tests");
        },
        startInstance: async () => {
          throw new Error("not used in regression tests");
        },
        stopInstance: async () => {
          throw new Error("not used in regression tests");
        },
        inspectInstance: async () => ({
          deploymentState: "missing" as const,
          providerMessage: null,
          rawStatus: "missing",
        }),
      }),
    } as never,
    (overrides?.waitingSessionSyncService ?? {
      refreshWaitingSessionsForWorld: async () => undefined,
    }) as never,
  );
}

function getPrivateMethod<TArgs extends unknown[], TResult>(
  target: object,
  key: string,
) {
  const method = Reflect.get(target, key);
  assert.equal(typeof method, "function");
  return method as (...args: TArgs) => TResult;
}

async function waitForCondition(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 250,
  intervalMs = 5,
) {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for condition.");
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

function encodeSessionSourceGroupKey(
  issuedFromIp: string | null,
  issuedUserAgent: string | null,
) {
  return Buffer.from(
    JSON.stringify([issuedFromIp, issuedUserAgent]),
    "utf8",
  ).toString("base64url");
}

async function saveAdminSession(
  dataSource: DataSource,
  overrides: Partial<CloudAdminSessionEntity> = {},
) {
  const sessionRepo = dataSource.getRepository(CloudAdminSessionEntity);
  const now = new Date("2026-04-20T00:00:00.000Z");
  const session = sessionRepo.create({
    currentRefreshTokenId: overrides.currentRefreshTokenId ?? randomUUID(),
    expiresAt: overrides.expiresAt ?? new Date("2026-04-27T00:00:00.000Z"),
    issuedFromIp: overrides.issuedFromIp ?? "203.0.113.10",
    issuedUserAgent: overrides.issuedUserAgent ?? "Regression Admin Session/1.0",
    lastUsedAt: overrides.lastUsedAt ?? now,
    lastUsedIp: overrides.lastUsedIp ?? "203.0.113.10",
    lastUsedUserAgent:
      overrides.lastUsedUserAgent ?? "Regression Admin Session/1.0",
    lastRefreshedAt: overrides.lastRefreshedAt ?? null,
    revokedAt: overrides.revokedAt ?? null,
    revokedBySessionId: overrides.revokedBySessionId ?? null,
    revocationReason: overrides.revocationReason ?? null,
  });

  return sessionRepo.save(session);
}

async function saveRequestGatePlaceholderWorld(
  dataSource: DataSource,
  overrides: Partial<CloudWorldEntity> & {
    phone: string;
    name: string;
    slug: string;
    failureCode: RequestGateFailureCode;
    failureMessage: string;
  },
) {
  const worldRepo = dataSource.getRepository(CloudWorldEntity);
  const {
    phone,
    name,
    slug,
    failureCode,
    failureMessage,
    ...restOverrides
  } = overrides;
  return worldRepo.save(
    worldRepo.create({
      phone,
      name,
      status: "disabled",
      slug,
      desiredState: "sleeping",
      provisionStrategy: "manual-docker",
      providerKey: providerSummary.key,
      providerRegion: "manual",
      providerZone: "docker-host-a",
      runtimeVersion: null,
      apiBaseUrl: null,
      adminUrl: null,
      callbackToken: "token",
      healthStatus:
        failureCode === REQUEST_GATE_PENDING_FAILURE_CODE
          ? "creating"
          : "failed",
      healthMessage: failureMessage,
      lastAccessedAt: null,
      lastInteractiveAt: null,
      lastBootedAt: null,
      lastHeartbeatAt: null,
      lastSuspendedAt: null,
      failureCode,
      failureMessage,
      retryCount: 0,
      note: failureMessage,
      ...restOverrides,
    }),
  );
}

test("updateWorld preserves nullable fields omitted from patch payload", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createCloudService(dataSource);
  const worldRepo = dataSource.getRepository(CloudWorldEntity);

  const savedWorld = await worldRepo.save(
    worldRepo.create({
      phone: "+8613800138000",
      name: "Regression World",
      status: "ready",
      slug: "world-8000-oldhash",
      desiredState: "running",
      provisionStrategy: "manual-docker",
      providerKey: providerSummary.key,
      providerRegion: "manual",
      providerZone: "docker-host-a",
      runtimeVersion: "test-runtime",
      apiBaseUrl: "https://api.example.com",
      adminUrl: "https://admin.example.com",
      callbackToken: "token",
      healthStatus: "healthy",
      healthMessage: "ready",
      lastAccessedAt: null,
      lastInteractiveAt: null,
      lastBootedAt: null,
      lastHeartbeatAt: null,
      lastSuspendedAt: null,
      failureCode: null,
      failureMessage: null,
      retryCount: 0,
      note: "keep me",
    }),
  );

  const updated = await service.updateWorld(savedWorld.id, {
    status: "sleeping",
  });

  assert.equal(updated.apiBaseUrl, "https://api.example.com");
  assert.equal(updated.adminUrl, "https://admin.example.com");
  assert.equal(updated.note, "keep me");

  const persisted = await worldRepo.findOneByOrFail({ id: savedWorld.id });
  assert.equal(persisted.apiBaseUrl, "https://api.example.com");
  assert.equal(persisted.adminUrl, "https://admin.example.com");
  assert.equal(persisted.note, "keep me");
});

test("updateWorld rejects changing phone to a phone with an existing world", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createCloudService(dataSource);
  const worldRepo = dataSource.getRepository(CloudWorldEntity);

  const sourceWorld = await worldRepo.save(
    worldRepo.create({
      phone: "+8613800138100",
      name: "Source World",
      status: "ready",
      slug: "world-8100-source",
      desiredState: "running",
      provisionStrategy: "manual-docker",
      providerKey: providerSummary.key,
      providerRegion: "manual",
      providerZone: "docker-host-a",
      runtimeVersion: "test-runtime",
      apiBaseUrl: "https://source-world.example.com",
      adminUrl: "https://source-world-admin.example.com",
      callbackToken: "token-source",
      healthStatus: "healthy",
      healthMessage: "ready",
      lastAccessedAt: null,
      lastInteractiveAt: null,
      lastBootedAt: null,
      lastHeartbeatAt: null,
      lastSuspendedAt: null,
      failureCode: null,
      failureMessage: null,
      retryCount: 0,
      note: null,
    }),
  );
  await worldRepo.save(
    worldRepo.create({
      phone: "+8613800138101",
      name: "Existing Target World",
      status: "ready",
      slug: "world-8101-target",
      desiredState: "running",
      provisionStrategy: "manual-docker",
      providerKey: providerSummary.key,
      providerRegion: "manual",
      providerZone: "docker-host-a",
      runtimeVersion: "test-runtime",
      apiBaseUrl: "https://target-world.example.com",
      adminUrl: "https://target-world-admin.example.com",
      callbackToken: "token-target",
      healthStatus: "healthy",
      healthMessage: "ready",
      lastAccessedAt: null,
      lastInteractiveAt: null,
      lastBootedAt: null,
      lastHeartbeatAt: null,
      lastSuspendedAt: null,
      failureCode: null,
      failureMessage: null,
      retryCount: 0,
      note: null,
    }),
  );

  await assert.rejects(
    () =>
      service.updateWorld(sourceWorld.id, {
        phone: "+8613800138101",
      }),
    /该手机号已经存在云世界记录，不能改绑到这个手机号。/,
  );

  const persistedSourceWorld = await worldRepo.findOneByOrFail({
    id: sourceWorld.id,
  });
  assert.equal(persistedSourceWorld.phone, "+8613800138100");
});

test("updateWorld rejects changing phone to a phone with an active request", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createCloudService(dataSource);
  const worldRepo = dataSource.getRepository(CloudWorldEntity);
  const requestRepo = dataSource.getRepository(CloudWorldRequestEntity);

  const sourceWorld = await worldRepo.save(
    worldRepo.create({
      phone: "+8613800138102",
      name: "Source World",
      status: "ready",
      slug: "world-8102-source",
      desiredState: "running",
      provisionStrategy: "manual-docker",
      providerKey: providerSummary.key,
      providerRegion: "manual",
      providerZone: "docker-host-a",
      runtimeVersion: "test-runtime",
      apiBaseUrl: "https://source-world-2.example.com",
      adminUrl: "https://source-world-2-admin.example.com",
      callbackToken: "token-source-2",
      healthStatus: "healthy",
      healthMessage: "ready",
      lastAccessedAt: null,
      lastInteractiveAt: null,
      lastBootedAt: null,
      lastHeartbeatAt: null,
      lastSuspendedAt: null,
      failureCode: null,
      failureMessage: null,
      retryCount: 0,
      note: null,
    }),
  );
  await requestRepo.save(
    requestRepo.create({
      phone: "+8613800138103",
      worldName: "Pending Request",
      status: "pending",
      note: "等待审核。",
      source: "app",
    }),
  );

  await assert.rejects(
    () =>
      service.updateWorld(sourceWorld.id, {
        phone: "+8613800138103",
      }),
    /该手机号已经存在待处理申请，不能改绑到这个手机号。/,
  );

  const persistedSourceWorld = await worldRepo.findOneByOrFail({
    id: sourceWorld.id,
  });
  assert.equal(persistedSourceWorld.phone, "+8613800138102");
});

test("updateWorld invalidates waiting sessions on the previous phone when the world phone changes", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const worldAccessService = createWorldAccessService(dataSource);
  const service = createCloudService(dataSource, {
    waitingSessionSyncService: createWaitingSessionSyncService(
      dataSource,
      worldAccessService,
    ),
  });
  const worldRepo = dataSource.getRepository(CloudWorldEntity);

  const savedWorld = await worldRepo.save(
    worldRepo.create({
      phone: "+8613800138104",
      name: "Reassignable World",
      status: "sleeping",
      slug: "world-8104-reassign",
      desiredState: "sleeping",
      provisionStrategy: "manual-docker",
      providerKey: providerSummary.key,
      providerRegion: "manual",
      providerZone: "docker-host-a",
      runtimeVersion: "test-runtime",
      apiBaseUrl: "https://reassignable-world.example.com",
      adminUrl: "https://reassignable-world-admin.example.com",
      callbackToken: "token-reassign",
      healthStatus: "sleeping",
      healthMessage: "sleeping",
      lastAccessedAt: null,
      lastInteractiveAt: null,
      lastBootedAt: null,
      lastHeartbeatAt: null,
      lastSuspendedAt: null,
      failureCode: null,
      failureMessage: null,
      retryCount: 0,
      note: null,
    }),
  );

  const accessSession = await worldAccessService.resolveWorldAccessByPhone(
    "+8613800138104",
    {
      clientPlatform: "web",
    },
  );
  assert.equal(accessSession.status, "waiting");

  const updatedWorld = await service.updateWorld(savedWorld.id, {
    phone: "+8613800138998",
  });
  assert.equal(updatedWorld.phone, "+8613800138998");

  const invalidatedSession =
    await worldAccessService.getWorldAccessSessionByPhone(
      "+8613800138104",
      accessSession.id,
    );
  assert.equal(invalidatedSession.worldId, null);
  assert.equal(invalidatedSession.status, "failed");
  assert.equal(invalidatedSession.phase, "failed");
  assert.equal(invalidatedSession.resolvedApiBaseUrl, null);
  assert.equal(
    invalidatedSession.failureReason,
    PHONE_CHANGE_INVALIDATED_ACCESS_SESSION_REASON,
  );

  assert.equal(
    await worldRepo.findOne({
      where: { phone: "+8613800138104" },
    }),
    null,
  );
  const persistedWorld = await worldRepo.findOneByOrFail({
    id: savedWorld.id,
  });
  assert.equal(persistedWorld.phone, "+8613800138998");
});

test("createWorldRequest rejects phones that already have a visible world", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createCloudService(dataSource);
  const worldRepo = dataSource.getRepository(CloudWorldEntity);
  const requestRepo = dataSource.getRepository(CloudWorldRequestEntity);

  await worldRepo.save(
    worldRepo.create({
      phone: "+8613800138001",
      name: "Existing Visible World",
      status: "ready",
      slug: "world-8001-existing",
      desiredState: "running",
      provisionStrategy: "manual-docker",
      providerKey: providerSummary.key,
      providerRegion: "manual",
      providerZone: "docker-host-a",
      runtimeVersion: "test-runtime",
      apiBaseUrl: "https://visible-world.example.com",
      adminUrl: "https://visible-world-admin.example.com",
      callbackToken: "token",
      healthStatus: "healthy",
      healthMessage: "ready",
      lastAccessedAt: null,
      lastInteractiveAt: null,
      lastBootedAt: null,
      lastHeartbeatAt: null,
      lastSuspendedAt: null,
      failureCode: null,
      failureMessage: null,
      retryCount: 0,
      note: null,
    }),
  );

  await assert.rejects(
    () => service.createWorldRequest("+8613800138001", "Duplicate Request"),
    /该手机号已经存在云世界记录，不能重复创建。/,
  );

  assert.equal(await requestRepo.countBy({ phone: "+8613800138001" }), 0);
});

test("createWorldRequest rejects phones that already have an active request", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createCloudService(dataSource);
  const requestRepo = dataSource.getRepository(CloudWorldRequestEntity);

  await requestRepo.save(
    requestRepo.create({
      phone: "+8613800138002",
      worldName: "Pending Existing Request",
      status: "provisioning",
      note: null,
      source: "app",
    }),
  );

  await assert.rejects(
    () => service.createWorldRequest("+8613800138002", "Duplicate Request"),
    /该手机号已经存在待处理申请，不能重复创建。/,
  );

  assert.equal(await requestRepo.countBy({ phone: "+8613800138002" }), 1);
});

test("createWorldRequest can reuse phones that only have rejected request history", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createCloudService(dataSource);
  const worldRepo = dataSource.getRepository(CloudWorldEntity);
  const requestRepo = dataSource.getRepository(CloudWorldRequestEntity);

  await requestRepo.save(
    requestRepo.create({
      phone: "+8613800138003",
      worldName: "Rejected History",
      status: "rejected",
      note: "历史拒绝。",
      source: "app",
    }),
  );
  const stalePlaceholder = await saveRequestGatePlaceholderWorld(dataSource, {
    phone: "+8613800138003",
    name: "Rejected History",
    slug: "world-8003-rejected-history",
    failureCode: REQUEST_GATE_REJECTED_FAILURE_CODE,
    failureMessage: getRequestGateFailureReasonForTest("rejected", "历史拒绝。"),
  });

  const created = await service.createWorldRequest(
    "+8613800138003",
    "Fresh Request",
  );

  assert.equal(created.phone, "+8613800138003");
  assert.equal(created.worldName, "Fresh Request");
  assert.equal(created.status, "pending");

  const requests = await requestRepo.find({
    where: { phone: "+8613800138003" },
    order: { createdAt: "ASC" },
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.status, "rejected");
  assert.equal(requests[1]?.status, "pending");
  assert.equal(requests[1]?.worldName, "Fresh Request");

  assert.equal(
    await worldRepo.findOne({
      where: { id: stalePlaceholder.id },
    }),
    null,
  );
});

test("updateRequest preserves existing urls and note when patch omits them", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createCloudService(dataSource);
  const worldRepo = dataSource.getRepository(CloudWorldEntity);
  const requestRepo = dataSource.getRepository(CloudWorldRequestEntity);

  await worldRepo.save(
    worldRepo.create({
      phone: "+8613800138001",
      name: "Requested World",
      status: "creating",
      slug: "world-8001-oldhash",
      desiredState: "running",
      provisionStrategy: "manual-docker",
      providerKey: providerSummary.key,
      providerRegion: "manual",
      providerZone: "docker-host-a",
      runtimeVersion: null,
      apiBaseUrl: "https://requested-api.example.com",
      adminUrl: "https://requested-admin.example.com",
      callbackToken: "token",
      healthStatus: "creating",
      healthMessage: "creating",
      lastAccessedAt: null,
      lastInteractiveAt: null,
      lastBootedAt: null,
      lastHeartbeatAt: null,
      lastSuspendedAt: null,
      failureCode: null,
      failureMessage: null,
      retryCount: 0,
      note: "ops note",
    }),
  );

  const savedRequest = await requestRepo.save(
    requestRepo.create({
      phone: "+8613800138001",
      worldName: "Requested World",
      status: "provisioning",
      note: "ops note",
      source: "app",
    }),
  );

  const updated = await service.updateRequest(savedRequest.id, {
    status: "active",
  });

  assert.equal(updated.apiBaseUrl, "https://requested-api.example.com");
  assert.equal(updated.adminUrl, "https://requested-admin.example.com");
  assert.equal(updated.note, "ops note");

  const persistedRequest = await requestRepo.findOneByOrFail({ id: savedRequest.id });
  const persistedWorld = await worldRepo.findOneByOrFail({ phone: "+8613800138001" });
  assert.equal(persistedRequest.note, "ops note");
  assert.equal(persistedWorld.apiBaseUrl, "https://requested-api.example.com");
  assert.equal(persistedWorld.adminUrl, "https://requested-admin.example.com");
});

test("updateRequest refreshes visible world health and failure fields when request enters provisioning", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createCloudService(dataSource);
  const worldRepo = dataSource.getRepository(CloudWorldEntity);
  const requestRepo = dataSource.getRepository(CloudWorldRequestEntity);

  await worldRepo.save(
    worldRepo.create({
      phone: "+8613800138004",
      name: "Provisioning Reset World",
      status: "disabled",
      slug: "world-8004-oldhash",
      desiredState: "sleeping",
      provisionStrategy: "manual-docker",
      providerKey: providerSummary.key,
      providerRegion: "manual",
      providerZone: "docker-host-a",
      runtimeVersion: null,
      apiBaseUrl: "https://provisioning-reset-api.example.com",
      adminUrl: "https://provisioning-reset-admin.example.com",
      callbackToken: "token",
      healthStatus: "disabled",
      healthMessage: "旧的停用文案",
      lastAccessedAt: null,
      lastInteractiveAt: null,
      lastBootedAt: null,
      lastHeartbeatAt: null,
      lastSuspendedAt: null,
      failureCode: "manually_disabled",
      failureMessage: "旧的停用文案",
      retryCount: 0,
      note: "旧的停用文案",
    }),
  );

  const savedRequest = await requestRepo.save(
    requestRepo.create({
      phone: "+8613800138004",
      worldName: "Provisioning Reset World",
      status: "disabled",
      note: "旧的停用文案",
      source: "app",
    }),
  );

  const updated = await service.updateRequest(savedRequest.id, {
    status: "provisioning",
    note: "进入创建中。",
  });

  assert.equal(updated.displayStatus, "世界正在创建中。");
  assert.equal(updated.failureReason, null);
  assert.equal(updated.projectedWorldStatus, "creating");
  assert.equal(updated.projectedDesiredState, "running");

  const persistedWorld = await worldRepo.findOneByOrFail({
    phone: "+8613800138004",
  });
  assert.equal(persistedWorld.status, "creating");
  assert.equal(persistedWorld.desiredState, "running");
  assert.equal(persistedWorld.healthStatus, "creating");
  assert.equal(persistedWorld.healthMessage, "世界正在创建中。");
  assert.equal(persistedWorld.failureCode, null);
  assert.equal(persistedWorld.failureMessage, null);
  assert.equal(persistedWorld.note, "进入创建中。");
});

test("updateRequest rolls back request changes when world sync fails", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createCloudService(dataSource);
  const requestRepo = dataSource.getRepository(CloudWorldRequestEntity);

  const savedRequest = await requestRepo.save(
    requestRepo.create({
      phone: "+8613800138005",
      worldName: "Transactional Request",
      status: "pending",
      note: "等待审核。",
      source: "app",
    }),
  );

  await assert.rejects(
    () =>
      service.updateRequest(savedRequest.id, {
        status: "active",
        note: "should roll back",
      }),
    /激活云世界时必须提供 apiBaseUrl。/,
  );

  const persistedRequest = await requestRepo.findOneByOrFail({
    id: savedRequest.id,
  });
  assert.equal(persistedRequest.status, "pending");
  assert.equal(persistedRequest.note, "等待审核。");
  assert.equal(persistedRequest.phone, "+8613800138005");
});

test("updateRequest keeps committed state when waiting session refresh falls back to retry", async (t) => {
  const dataSource = await createTestDataSource();
  let refreshCalls = 0;
  const waitingSessionSyncService = createWaitingSessionSyncService(
    dataSource,
    {
      refreshWaitingSessionsForWorld: async () => undefined,
      refreshWaitingSessionsForPhone: async () => {
        refreshCalls += 1;
        throw new Error("refresh failed");
      },
      invalidateWaitingSessionsForPhone: async () => undefined,
    },
    {
      CLOUD_WAITING_SESSION_SYNC_RETRY_ATTEMPTS: "2",
      CLOUD_WAITING_SESSION_SYNC_RETRY_DELAY_MS: "0",
    },
  );
  t.after(async () => {
    waitingSessionSyncService.onModuleDestroy();
    await dataSource.destroy();
  });

  const service = createCloudService(dataSource, {
    waitingSessionSyncService,
  });
  const requestRepo = dataSource.getRepository(CloudWorldRequestEntity);
  const worldRepo = dataSource.getRepository(CloudWorldEntity);

  const savedRequest = await requestRepo.save(
    requestRepo.create({
      phone: "+8613800138055",
      worldName: "Retryable Waiting Session Refresh",
      status: "pending",
      note: "等待审核。",
      source: "app",
    }),
  );

  const updated = await service.updateRequest(savedRequest.id, {
    status: "active",
    apiBaseUrl: "https://retry-refresh-world.example.com",
    adminUrl: "https://retry-refresh-world-admin.example.com",
  });

  assert.equal(updated.status, "active");
  const persistedRequest = await requestRepo.findOneByOrFail({
    id: savedRequest.id,
  });
  assert.equal(persistedRequest.status, "active");
  const persistedWorld = await worldRepo.findOneByOrFail({
    phone: "+8613800138055",
  });
  assert.equal(persistedWorld.status, "ready");
  assert.equal(
    persistedWorld.apiBaseUrl,
    "https://retry-refresh-world.example.com",
  );

  await waitForCondition(() => refreshCalls >= 2);
});

test("updateRequest rejects changing phone to a phone with an existing world", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createCloudService(dataSource);
  const worldRepo = dataSource.getRepository(CloudWorldEntity);
  const requestRepo = dataSource.getRepository(CloudWorldRequestEntity);

  await worldRepo.save(
    worldRepo.create({
      phone: "+8613800138010",
      name: "Occupied World",
      status: "ready",
      slug: "world-8010-occupied",
      desiredState: "running",
      provisionStrategy: "manual-docker",
      providerKey: providerSummary.key,
      providerRegion: "manual",
      providerZone: "docker-host-a",
      runtimeVersion: null,
      apiBaseUrl: "https://occupied-world.example.com",
      adminUrl: "https://occupied-world-admin.example.com",
      callbackToken: "occupied-token",
      healthStatus: "healthy",
      healthMessage: "ready",
      lastAccessedAt: null,
      lastInteractiveAt: null,
      lastBootedAt: null,
      lastHeartbeatAt: null,
      lastSuspendedAt: null,
      failureCode: null,
      failureMessage: null,
      retryCount: 0,
      note: null,
    }),
  );

  const savedRequest = await requestRepo.save(
    requestRepo.create({
      phone: "+8613800138008",
      worldName: "Source Request",
      status: "pending",
      note: null,
      source: "app",
    }),
  );

  await assert.rejects(
    () =>
      service.updateRequest(savedRequest.id, {
        phone: "+8613800138010",
      }),
    /该手机号已经存在云世界记录，不能改绑到这个手机号。/,
  );

  const persistedRequest = await requestRepo.findOneByOrFail({
    id: savedRequest.id,
  });
  assert.equal(persistedRequest.phone, "+8613800138008");
  assert.equal(
    (await worldRepo.findOneByOrFail({ phone: "+8613800138010" })).name,
    "Occupied World",
  );
});

test("updateRequest rejects changing phone to a phone with an active request", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createCloudService(dataSource);
  const requestRepo = dataSource.getRepository(CloudWorldRequestEntity);

  const savedRequest = await requestRepo.save(
    requestRepo.create({
      phone: "+8613800138009",
      worldName: "Source Request",
      status: "pending",
      note: null,
      source: "app",
    }),
  );

  await requestRepo.save(
    requestRepo.create({
      phone: "+8613800138011",
      worldName: "Target Pending Request",
      status: "provisioning",
      note: null,
      source: "app",
    }),
  );

  await assert.rejects(
    () =>
      service.updateRequest(savedRequest.id, {
        phone: "+8613800138011",
      }),
    /该手机号已经存在待处理申请，不能改绑到这个手机号。/,
  );

  const persistedRequest = await requestRepo.findOneByOrFail({
    id: savedRequest.id,
  });
  assert.equal(persistedRequest.phone, "+8613800138009");
});

test("updateRequest can reuse a phone that only has rejected request history", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createCloudService(dataSource);
  const worldRepo = dataSource.getRepository(CloudWorldEntity);
  const requestRepo = dataSource.getRepository(CloudWorldRequestEntity);

  const savedRequest = await requestRepo.save(
    requestRepo.create({
      phone: "+8613800138012",
      worldName: "Reusable Request",
      status: "pending",
      note: null,
      source: "app",
    }),
  );

  await requestRepo.save(
    requestRepo.create({
      phone: "+8613800138013",
      worldName: "Rejected History",
      status: "rejected",
      note: "历史拒绝。",
      source: "app",
    }),
  );
  await saveRequestGatePlaceholderWorld(dataSource, {
    phone: "+8613800138013",
    name: "Rejected History",
    slug: "world-8013-rejected-history",
    failureCode: REQUEST_GATE_REJECTED_FAILURE_CODE,
    failureMessage: getRequestGateFailureReasonForTest("rejected", "历史拒绝。"),
  });

  const updated = await service.updateRequest(savedRequest.id, {
    phone: "+8613800138013",
  });

  assert.equal(updated.phone, "+8613800138013");
  assert.equal(
    await worldRepo.findOne({
      where: { phone: "+8613800138013" },
    }),
    null,
  );

  const persistedRequest = await requestRepo.findOneByOrFail({
    id: savedRequest.id,
  });
  assert.equal(persistedRequest.phone, "+8613800138013");
});

test("updateRequest invalidates waiting sessions on the previous phone when the request phone changes", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const worldAccessService = createWorldAccessService(dataSource);
  const cloudService = createCloudService(dataSource, {
    waitingSessionSyncService: createWaitingSessionSyncService(
      dataSource,
      worldAccessService,
    ),
  });
  const requestRepo = dataSource.getRepository(CloudWorldRequestEntity);
  const worldRepo = dataSource.getRepository(CloudWorldEntity);

  const savedRequest = await requestRepo.save(
    requestRepo.create({
      phone: "+8613800138007",
      worldName: "Phone Reassigned World",
      status: "pending",
      note: "等待审核。",
      source: "app",
    }),
  );

  const accessSession = await worldAccessService.resolveWorldAccessByPhone(
    "+8613800138007",
    {
      clientPlatform: "web",
    },
  );
  assert.equal(accessSession.status, "pending");
  assert.equal(accessSession.worldId, null);

  await cloudService.updateRequest(savedRequest.id, {
    phone: "+8613800138999",
    status: "active",
    apiBaseUrl: "https://reassigned-world.example.com",
    adminUrl: "https://reassigned-world-admin.example.com",
  });

  const invalidatedSession = await worldAccessService.getWorldAccessSessionByPhone(
    "+8613800138007",
    accessSession.id,
  );
  assert.equal(invalidatedSession.worldId, null);
  assert.equal(invalidatedSession.status, "failed");
  assert.equal(invalidatedSession.phase, "failed");
  assert.equal(invalidatedSession.resolvedApiBaseUrl, null);
  assert.equal(
    invalidatedSession.failureReason,
    PHONE_CHANGE_INVALIDATED_ACCESS_SESSION_REASON,
  );

  const migratedWorld = await worldRepo.findOneByOrFail({
    phone: "+8613800138999",
  });
  assert.equal(migratedWorld.status, "ready");
  assert.equal(migratedWorld.apiBaseUrl, "https://reassigned-world.example.com");
  assert.equal(
    await worldRepo.findOne({
      where: { phone: "+8613800138007" },
    }),
    null,
  );

  await worldAccessService.refreshWaitingSessionsForWorld(migratedWorld.id);

  const invalidatedSessionAfterWorldRefresh =
    await worldAccessService.getWorldAccessSessionByPhone(
      "+8613800138007",
      accessSession.id,
    );
  assert.equal(invalidatedSessionAfterWorldRefresh.worldId, null);
  assert.equal(invalidatedSessionAfterWorldRefresh.status, "failed");
  assert.equal(
    invalidatedSessionAfterWorldRefresh.failureReason,
    PHONE_CHANGE_INVALIDATED_ACCESS_SESSION_REASON,
  );
});

test("getRequestGateState centralizes gate copy for pending disabled and rejected", () => {
  assert.deepEqual(getRequestGateState("pending"), {
    accessStatus: "pending",
    accessPhase: "creating",
    displayStatus: "世界申请审核中。",
    retryAfterSeconds: 5,
    estimatedWaitSeconds: null,
    failureCode: REQUEST_GATE_PENDING_FAILURE_CODE,
    placeholderHealthStatus: "creating",
    failureReason: "管理员审核通过后才会开始创建世界。",
  });
  assert.deepEqual(getRequestGateState("disabled", " 已停用 "), {
    accessStatus: "disabled",
    accessPhase: "disabled",
    displayStatus: "世界当前已被停用。",
    retryAfterSeconds: 0,
    estimatedWaitSeconds: null,
    failureCode: REQUEST_GATE_DISABLED_FAILURE_CODE,
    placeholderHealthStatus: "disabled",
    failureReason: "已停用",
  });
  assert.deepEqual(getRequestGateState("rejected"), {
    accessStatus: "failed",
    accessPhase: "failed",
    displayStatus: "世界申请未通过。",
    retryAfterSeconds: 0,
    estimatedWaitSeconds: null,
    failureCode: REQUEST_GATE_REJECTED_FAILURE_CODE,
    placeholderHealthStatus: "failed",
    failureReason: "世界申请未通过，暂时无法进入。",
  });
});

test("getRequestPhoneAvailability centralizes request phone reuse rules", () => {
  assert.equal(
    getRequestPhoneAvailability({
      world: REQUEST_PHONE_AVAILABILITY_VISIBLE_WORLD,
      latestRequest: null,
    }),
    "conflict_world",
  );
  assert.equal(
    getRequestPhoneAvailability({
      world: REQUEST_PHONE_AVAILABILITY_PLACEHOLDER_WORLD,
      latestRequest: { status: "rejected" },
    }),
    "cleanup_rejected_placeholder",
  );
  assert.equal(
    getRequestPhoneAvailability({
      world: null,
      latestRequest: { status: "pending" },
    }),
    "conflict_request",
  );
  assert.equal(
    getRequestPhoneAvailability({
      world: null,
      latestRequest: { status: "rejected" },
    }),
    "available",
  );
});

test("getRequestWorldSyncDecision centralizes request world sync rules", () => {
  assert.deepEqual(
    getRequestRecordProjection("pending", "等待审批。"),
    {
      displayStatus: "世界申请审核中。",
      failureReason: "等待审批。",
      projectedWorldStatus: "queued",
      projectedDesiredState: "running",
    },
  );
  assert.deepEqual(
    getRequestRecordProjection("active"),
    {
      displayStatus: "人工交付的世界已准备好。",
      failureReason: null,
      projectedWorldStatus: "ready",
      projectedDesiredState: "running",
    },
  );
  assert.deepEqual(
    getRequestRecordProjection("rejected"),
    {
      displayStatus: "世界申请未通过。",
      failureReason: "世界申请未通过，暂时无法进入。",
      projectedWorldStatus: "failed",
      projectedDesiredState: "running",
    },
  );
  assert.deepEqual(
    getRequestVisibleWorldProjection("active", "ignored"),
    {
      worldStatus: "ready",
      desiredState: "running",
      healthStatus: "healthy",
      healthMessage: "人工交付的世界已准备好。",
      failureCode: null,
      failureMessage: null,
    },
  );
  assert.deepEqual(
    getRequestVisibleWorldProjection("disabled", " 已停用 "),
    {
      worldStatus: "disabled",
      desiredState: "sleeping",
      healthStatus: "disabled",
      healthMessage: "已停用",
      failureCode: "manually_disabled",
      failureMessage: "已停用",
    },
  );
  assert.deepEqual(
    getRequestVisibleWorldProjection("rejected"),
    {
      worldStatus: "failed",
      desiredState: "running",
      healthStatus: "failed",
      healthMessage: "申请已被拒绝。",
      failureCode: REQUEST_GATE_REJECTED_FAILURE_CODE,
      failureMessage: "申请已被拒绝。",
    },
  );
  assert.deepEqual(
    getRequestVisibleWorldProjection("provisioning"),
    {
      worldStatus: "creating",
      desiredState: "running",
      healthStatus: "creating",
      healthMessage: "世界正在创建中。",
      failureCode: null,
      failureMessage: null,
    },
  );
  assert.deepEqual(getRequestWorldProjection("active"), {
    worldStatus: "ready",
    desiredState: "running",
  });
  assert.deepEqual(getRequestWorldProjection("disabled"), {
    worldStatus: "disabled",
    desiredState: "sleeping",
  });
  assert.deepEqual(getRequestWorldProjection("provisioning"), {
    worldStatus: "creating",
    desiredState: "running",
  });
  assert.deepEqual(
    getRequestWorldSyncDecision({
      requestStatus: "pending",
      hasWorld: true,
      hasGatePlaceholderWorld: true,
    }),
    { action: "sync_gate_placeholder" },
  );
  assert.deepEqual(
    getRequestWorldSyncDecision({
      requestStatus: "disabled",
      hasWorld: false,
      hasGatePlaceholderWorld: false,
    }),
    { action: "skip" },
  );
  assert.deepEqual(
    getRequestWorldSyncDecision({
      requestStatus: "disabled",
      hasWorld: true,
      hasGatePlaceholderWorld: false,
    }),
    {
      action: "upsert_visible_world",
      worldStatus: "disabled",
      desiredState: "sleeping",
    },
  );
  assert.deepEqual(
    getRequestWorldSyncDecision({
      requestStatus: "rejected",
      hasWorld: true,
      hasGatePlaceholderWorld: true,
    }),
    { action: "delete_gate_placeholder" },
  );
  assert.deepEqual(
    getRequestWorldSyncDecision({
      requestStatus: "active",
      hasWorld: false,
      hasGatePlaceholderWorld: false,
    }),
    {
      action: "upsert_visible_world",
      worldStatus: "ready",
      desiredState: "running",
    },
  );
});

test("resolveWorldAccessByPhone blocks rejected requests without enqueuing lifecycle jobs", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createWorldAccessService(dataSource);
  const requestRepo = dataSource.getRepository(CloudWorldRequestEntity);
  const worldRepo = dataSource.getRepository(CloudWorldEntity);
  const jobRepo = dataSource.getRepository(WorldLifecycleJobEntity);
  const rejectedGateFailureReason = getRequestGateFailureReasonForTest(
    "rejected",
    "申请未通过，请联系管理员。",
  );

  await requestRepo.save(
    requestRepo.create({
      phone: "+8613800138002",
      worldName: "Rejected Access World",
      status: "rejected",
      note: "申请未通过，请联系管理员。",
      source: "app",
    }),
  );

  const session = await service.resolveWorldAccessByPhone("+8613800138002", {
    clientPlatform: "app",
  });

  assert.equal(session.status, "failed");
  assert.equal(session.phase, "failed");
  assert.equal(session.resolvedApiBaseUrl, null);
  assert.equal(session.failureReason, rejectedGateFailureReason);

  const persistedWorld = await worldRepo.findOneByOrFail({
    phone: "+8613800138002",
  });
  assert.equal(session.worldId, null);
  assert.equal(persistedWorld.status, "disabled");
  assert.equal(persistedWorld.desiredState, "sleeping");
  assert.equal(persistedWorld.failureCode, REQUEST_GATE_REJECTED_FAILURE_CODE);
  assert.equal(persistedWorld.failureMessage, rejectedGateFailureReason);

  const jobs = await jobRepo.find({
    where: { worldId: persistedWorld.id },
  });
  assert.equal(jobs.length, 0);
});

test("pending request access sessions refresh to ready after the request is approved", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const worldAccessService = createWorldAccessService(dataSource);
  const cloudService = createCloudService(dataSource, {
    waitingSessionSyncService: createWaitingSessionSyncService(
      dataSource,
      worldAccessService,
    ),
  });
  const requestRepo = dataSource.getRepository(CloudWorldRequestEntity);
  const worldRepo = dataSource.getRepository(CloudWorldEntity);
  const jobRepo = dataSource.getRepository(WorldLifecycleJobEntity);
  const pendingGateFailureReason = getRequestGateFailureReasonForTest(
    "pending",
    "等待审核。",
  );

  const request = await requestRepo.save(
    requestRepo.create({
      phone: "+8613800138003",
      worldName: "Pending Access World",
      status: "pending",
      note: "等待审核。",
      source: "app",
    }),
  );

  const accessSession = await worldAccessService.resolveWorldAccessByPhone(
    "+8613800138003",
    {
      clientPlatform: "web",
    },
  );

  assert.equal(accessSession.status, "pending");
  assert.equal(accessSession.phase, "creating");
  assert.equal(accessSession.failureReason, pendingGateFailureReason);

  const placeholderWorld = await worldRepo.findOneByOrFail({
    phone: "+8613800138003",
  });
  assert.equal(accessSession.worldId, null);
  assert.equal(placeholderWorld.status, "disabled");
  assert.equal(placeholderWorld.failureCode, REQUEST_GATE_PENDING_FAILURE_CODE);

  const pendingJobs = await jobRepo.find({
    where: { worldId: placeholderWorld.id },
  });
  assert.equal(pendingJobs.length, 0);

  await cloudService.updateRequest(request.id, {
    status: "active",
    apiBaseUrl: "https://approved-world.example.com",
    adminUrl: "https://approved-world-admin.example.com",
  });

  const refreshedSession = await worldAccessService.getWorldAccessSessionByPhone(
    "+8613800138003",
    accessSession.id,
  );
  assert.equal(refreshedSession.worldId, placeholderWorld.id);
  assert.equal(refreshedSession.status, "ready");
  assert.equal(refreshedSession.phase, "ready");
  assert.equal(
    refreshedSession.resolvedApiBaseUrl,
    "https://approved-world.example.com",
  );

  const approvedWorld = await worldRepo.findOneByOrFail({
    id: placeholderWorld.id,
  });
  assert.equal(approvedWorld.status, "ready");
  assert.equal(approvedWorld.desiredState, "running");
  assert.equal(approvedWorld.apiBaseUrl, "https://approved-world.example.com");
  assert.equal(
    approvedWorld.adminUrl,
    "https://approved-world-admin.example.com",
  );
});

test("pending request access sessions refresh to failed after the request is rejected", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const worldAccessService = createWorldAccessService(dataSource);
  const cloudService = createCloudService(dataSource, {
    waitingSessionSyncService: createWaitingSessionSyncService(
      dataSource,
      worldAccessService,
    ),
  });
  const requestRepo = dataSource.getRepository(CloudWorldRequestEntity);
  const worldRepo = dataSource.getRepository(CloudWorldEntity);
  const rejectedGateDisplayStatus = getRequestGateDisplayStatusForTest("rejected");
  const rejectedGateFailureReason = getRequestGateFailureReasonForTest(
    "rejected",
    "申请未通过。",
  );

  const request = await requestRepo.save(
    requestRepo.create({
      phone: "+8613800138018",
      worldName: "Rejected Access World",
      status: "pending",
      note: "等待审核。",
      source: "app",
    }),
  );

  const accessSession = await worldAccessService.resolveWorldAccessByPhone(
    "+8613800138018",
    {
      clientPlatform: "web",
    },
  );

  assert.equal(accessSession.status, "pending");
  assert.equal(accessSession.phase, "creating");

  await cloudService.updateRequest(request.id, {
    status: "rejected",
    note: "申请未通过。",
  });

  const refreshedSession = await worldAccessService.getWorldAccessSessionByPhone(
    "+8613800138018",
    accessSession.id,
  );
  assert.equal(refreshedSession.worldId, null);
  assert.equal(refreshedSession.status, "failed");
  assert.equal(refreshedSession.phase, "failed");
  assert.equal(refreshedSession.displayStatus, rejectedGateDisplayStatus);
  assert.equal(refreshedSession.failureReason, rejectedGateFailureReason);

  assert.equal(
    await worldRepo.findOne({
      where: { phone: "+8613800138018" },
    }),
    null,
  );
});

test("pending request session refresh keeps the request gate state", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const worldAccessService = createWorldAccessService(dataSource);
  const cloudService = createCloudService(dataSource, {
    waitingSessionSyncService: createWaitingSessionSyncService(
      dataSource,
      worldAccessService,
    ),
  });
  const requestRepo = dataSource.getRepository(CloudWorldRequestEntity);
  const worldRepo = dataSource.getRepository(CloudWorldEntity);
  const initialPendingGateFailureReason = getRequestGateFailureReasonForTest(
    "pending",
    "等待初审。",
  );
  const updatedPendingGateFailureReason = getRequestGateFailureReasonForTest(
    "pending",
    "仍在审核，请继续等待。",
  );
  const pendingGateDisplayStatus = getRequestGateDisplayStatusForTest("pending");

  const request = await requestRepo.save(
    requestRepo.create({
      phone: "+8613800138019",
      worldName: "Pending Gate Refresh World",
      status: "pending",
      note: "等待初审。",
      source: "app",
    }),
  );

  const accessSession = await worldAccessService.resolveWorldAccessByPhone(
    "+8613800138019",
    {
      clientPlatform: "web",
    },
  );
  assert.equal(accessSession.worldId, null);
  assert.equal(accessSession.status, "pending");
  assert.equal(accessSession.phase, "creating");
  assert.equal(accessSession.failureReason, initialPendingGateFailureReason);

  await cloudService.updateRequest(request.id, {
    worldName: "Pending Gate Refresh World v2",
    note: "仍在审核，请继续等待。",
  });

  const refreshedSession = await worldAccessService.getWorldAccessSessionByPhone(
    "+8613800138019",
    accessSession.id,
  );
  assert.equal(refreshedSession.worldId, null);
  assert.equal(refreshedSession.status, "pending");
  assert.equal(refreshedSession.phase, "creating");
  assert.equal(refreshedSession.displayStatus, pendingGateDisplayStatus);
  assert.equal(refreshedSession.failureReason, updatedPendingGateFailureReason);

  const syncedWorld = await worldRepo.findOneByOrFail({
    phone: "+8613800138019",
  });
  assert.equal(syncedWorld.name, "Pending Gate Refresh World v2");
  assert.equal(syncedWorld.status, "disabled");
  assert.equal(syncedWorld.desiredState, "sleeping");
  assert.equal(syncedWorld.healthStatus, "creating");
  assert.equal(syncedWorld.healthMessage, pendingGateDisplayStatus);
  assert.equal(syncedWorld.failureCode, REQUEST_GATE_PENDING_FAILURE_CODE);
  assert.equal(syncedWorld.failureMessage, updatedPendingGateFailureReason);
  assert.equal(syncedWorld.note, "仍在审核，请继续等待。");
});

test("pending request session refresh keeps disabled gate placeholders hidden", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const worldAccessService = createWorldAccessService(dataSource);
  const cloudService = createCloudService(dataSource, {
    waitingSessionSyncService: createWaitingSessionSyncService(
      dataSource,
      worldAccessService,
    ),
  });
  const requestRepo = dataSource.getRepository(CloudWorldRequestEntity);
  const worldRepo = dataSource.getRepository(CloudWorldEntity);
  const disabledGateDisplayStatus = getRequestGateDisplayStatusForTest("disabled");
  const disabledGateFailureReason = getRequestGateFailureReasonForTest(
    "disabled",
    "该申请已被停用。",
  );

  const request = await requestRepo.save(
    requestRepo.create({
      phone: "+8613800138021",
      worldName: "Disabled Gate Refresh World",
      status: "pending",
      note: "等待审核。",
      source: "app",
    }),
  );

  const accessSession = await worldAccessService.resolveWorldAccessByPhone(
    "+8613800138021",
    {
      clientPlatform: "web",
    },
  );
  assert.equal(accessSession.worldId, null);
  assert.equal(accessSession.status, "pending");

  await cloudService.updateRequest(request.id, {
    status: "disabled",
    note: "该申请已被停用。",
  });

  const refreshedSession = await worldAccessService.getWorldAccessSessionByPhone(
    "+8613800138021",
    accessSession.id,
  );
  assert.equal(refreshedSession.worldId, null);
  assert.equal(refreshedSession.status, "disabled");
  assert.equal(refreshedSession.phase, "disabled");
  assert.equal(refreshedSession.displayStatus, disabledGateDisplayStatus);
  assert.equal(refreshedSession.failureReason, disabledGateFailureReason);

  const syncedWorld = await worldRepo.findOneByOrFail({
    phone: "+8613800138021",
  });
  assert.equal(syncedWorld.status, "disabled");
  assert.equal(syncedWorld.desiredState, "sleeping");
  assert.equal(syncedWorld.apiBaseUrl, null);
  assert.equal(syncedWorld.adminUrl, null);
  assert.equal(syncedWorld.healthStatus, "disabled");
  assert.equal(syncedWorld.healthMessage, disabledGateDisplayStatus);
  assert.equal(syncedWorld.failureCode, REQUEST_GATE_DISABLED_FAILURE_CODE);
  assert.equal(syncedWorld.failureMessage, disabledGateFailureReason);
});

test("updateRequest does not create a visible disabled world for request-only records", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const cloudService = createCloudService(dataSource);
  const requestRepo = dataSource.getRepository(CloudWorldRequestEntity);
  const worldRepo = dataSource.getRepository(CloudWorldEntity);

  const request = await requestRepo.save(
    requestRepo.create({
      phone: "+8613800138022",
      worldName: "Request Only Disabled World",
      status: "pending",
      note: "等待审核。",
      source: "app",
    }),
  );

  await cloudService.updateRequest(request.id, {
    status: "disabled",
    note: "不再开放。",
  });

  assert.equal(
    await worldRepo.findOne({
      where: { phone: "+8613800138022" },
    }),
    null,
  );

  const lookup = await cloudService.getWorldLookupByPhone("+8613800138022");
  assert.equal(lookup.status, "disabled");
  assert.equal(lookup.world, null);
  assert.equal(lookup.latestRequest?.status, "disabled");
  assert.equal(lookup.latestRequest?.note, "不再开放。");
});

test("resolveWorldAccessByPhone restores stale request gate placeholders before normal access", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createWorldAccessService(dataSource);
  const worldRepo = dataSource.getRepository(CloudWorldEntity);
  const jobRepo = dataSource.getRepository(WorldLifecycleJobEntity);
  const placeholderWorld = await saveRequestGatePlaceholderWorld(dataSource, {
    phone: "+8613800138020",
    name: "Stale Placeholder World",
    slug: "world-8020-stale-gate",
    failureCode: REQUEST_GATE_PENDING_FAILURE_CODE,
    failureMessage: getRequestGateFailureReasonForTest("pending", "旧的占位世界。"),
  });

  const accessSession = await service.resolveWorldAccessByPhone("+8613800138020", {
    clientPlatform: "app",
  });

  assert.equal(accessSession.worldId, placeholderWorld.id);
  assert.equal(accessSession.status, "waiting");
  assert.equal(accessSession.phase, "creating");

  const restoredWorld = await worldRepo.findOneByOrFail({
    id: placeholderWorld.id,
  });
  assert.equal(restoredWorld.status, "queued");
  assert.equal(restoredWorld.desiredState, "running");
  assert.equal(restoredWorld.failureCode, null);
  assert.equal(restoredWorld.failureMessage, null);
  assert.equal(restoredWorld.healthStatus, "queued");
  assert.equal(restoredWorld.lastAccessedAt instanceof Date, true);

  const jobs = await jobRepo.find({
    where: { worldId: placeholderWorld.id },
  });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0]?.jobType, "provision");
  assert.equal(jobs[0]?.status, "pending");
});

test("getWorldLookupByPhone prefers pending request status over request gate placeholders", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createCloudService(dataSource);
  const requestRepo = dataSource.getRepository(CloudWorldRequestEntity);

  await requestRepo.save(
    requestRepo.create({
      phone: "+8613800138004",
      worldName: "Lookup Pending World",
      status: "pending",
      note: "等待审批。",
      source: "app",
    }),
  );
  await saveRequestGatePlaceholderWorld(dataSource, {
    phone: "+8613800138004",
    name: "Lookup Pending World",
    slug: "world-8004-pending-gate",
    failureCode: REQUEST_GATE_PENDING_FAILURE_CODE,
    failureMessage: getRequestGateFailureReasonForTest("pending", "等待审批。"),
  });

  const lookup = await service.getWorldLookupByPhone("+8613800138004");

  assert.equal(lookup.status, "pending");
  assert.equal(lookup.world, null);
  assert.equal(lookup.latestRequest?.status, "pending");
  assert.equal(lookup.latestRequest?.displayStatus, "世界申请审核中。");
  assert.equal(lookup.latestRequest?.failureReason, "等待审批。");
  assert.equal(lookup.latestRequest?.projectedWorldStatus, "queued");
  assert.equal(lookup.latestRequest?.projectedDesiredState, "running");
  assert.equal(lookup.latestRequest?.note, "等待审批。");
});

test("getWorldLookupByPhone prefers rejected request status over request gate placeholders", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createCloudService(dataSource);
  const requestRepo = dataSource.getRepository(CloudWorldRequestEntity);

  await requestRepo.save(
    requestRepo.create({
      phone: "+8613800138005",
      worldName: "Lookup Rejected World",
      status: "rejected",
      note: "申请未通过。",
      source: "app",
    }),
  );
  await saveRequestGatePlaceholderWorld(dataSource, {
    phone: "+8613800138005",
    name: "Lookup Rejected World",
    slug: "world-8005-rejected-gate",
    failureCode: REQUEST_GATE_REJECTED_FAILURE_CODE,
    failureMessage: getRequestGateFailureReasonForTest("rejected", "申请未通过。"),
  });

  const lookup = await service.getWorldLookupByPhone("+8613800138005");

  assert.equal(lookup.status, "rejected");
  assert.equal(lookup.world, null);
  assert.equal(lookup.latestRequest?.status, "rejected");
  assert.equal(lookup.latestRequest?.displayStatus, "世界申请未通过。");
  assert.equal(
    lookup.latestRequest?.failureReason,
    getRequestGateFailureReasonForTest("rejected", "申请未通过。"),
  );
  assert.equal(lookup.latestRequest?.projectedWorldStatus, "failed");
  assert.equal(lookup.latestRequest?.projectedDesiredState, "running");
  assert.equal(lookup.latestRequest?.note, "申请未通过。");
});

test("getWorldLookupByPhone hides stale request gate placeholders when no request exists", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createCloudService(dataSource);

  await saveRequestGatePlaceholderWorld(dataSource, {
    phone: "+8613800138006",
    name: "Lookup Stale Placeholder World",
    slug: "world-8006-stale-gate",
    failureCode: REQUEST_GATE_PENDING_FAILURE_CODE,
    failureMessage: getRequestGateFailureReasonForTest("pending", "历史占位世界。"),
  });

  const lookup = await service.getWorldLookupByPhone("+8613800138006");

  assert.equal(lookup.status, "none");
  assert.equal(lookup.world, null);
  assert.equal(lookup.latestRequest, null);
});

test("listWorlds excludes request gate placeholders", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createCloudService(dataSource);
  const worldRepo = dataSource.getRepository(CloudWorldEntity);

  await saveRequestGatePlaceholderWorld(dataSource, {
    phone: "+8613800138006",
    name: "Hidden Placeholder World",
    slug: "world-8006-hidden-gate",
    failureCode: REQUEST_GATE_PENDING_FAILURE_CODE,
    failureMessage: getRequestGateFailureReasonForTest("pending", "等待审批。"),
  });
  const visibleWorld = await worldRepo.save(
    worldRepo.create({
      phone: "+8613800138007",
      name: "Visible Ready World",
      status: "ready",
      slug: "world-8007-visible",
      desiredState: "running",
      provisionStrategy: "manual-docker",
      providerKey: providerSummary.key,
      providerRegion: "manual",
      providerZone: "docker-host-a",
      runtimeVersion: "test-runtime",
      apiBaseUrl: "https://visible-world.example.com",
      adminUrl: "https://visible-world-admin.example.com",
      callbackToken: "token",
      healthStatus: "healthy",
      healthMessage: "World is ready.",
      lastAccessedAt: null,
      lastInteractiveAt: null,
      lastBootedAt: null,
      lastHeartbeatAt: null,
      lastSuspendedAt: null,
      failureCode: null,
      failureMessage: null,
      retryCount: 0,
      note: null,
    }),
  );

  const worlds = await service.listWorlds();

  assert.equal(worlds.length, 1);
  assert.equal(worlds[0]?.id, visibleWorld.id);
  assert.equal(worlds[0]?.name, "Visible Ready World");
});

test("listWorldInstances excludes request gate placeholders", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createCloudService(dataSource);
  const worldRepo = dataSource.getRepository(CloudWorldEntity);
  const instanceRepo = dataSource.getRepository(CloudInstanceEntity);

  await saveRequestGatePlaceholderWorld(dataSource, {
    phone: "+8613800138008",
    name: "Hidden Fleet Placeholder",
    slug: "world-8008-fleet-gate",
    failureCode: REQUEST_GATE_REJECTED_FAILURE_CODE,
    failureMessage: getRequestGateFailureReasonForTest("rejected", "申请未通过。"),
  });
  const visibleWorld = await worldRepo.save(
    worldRepo.create({
      phone: "+8613800138009",
      name: "Fleet Visible World",
      status: "ready",
      slug: "world-8009-visible",
      desiredState: "running",
      provisionStrategy: "manual-docker",
      providerKey: providerSummary.key,
      providerRegion: "manual",
      providerZone: "docker-host-a",
      runtimeVersion: "test-runtime",
      apiBaseUrl: "https://fleet-visible.example.com",
      adminUrl: "https://fleet-visible-admin.example.com",
      callbackToken: "token",
      healthStatus: "healthy",
      healthMessage: "World is ready.",
      lastAccessedAt: null,
      lastInteractiveAt: null,
      lastBootedAt: null,
      lastHeartbeatAt: null,
      lastSuspendedAt: null,
      failureCode: null,
      failureMessage: null,
      retryCount: 0,
      note: null,
    }),
  );
  await instanceRepo.save(
    instanceRepo.create({
      worldId: visibleWorld.id,
      providerKey: providerSummary.key,
      providerInstanceId: "instance-visible-fleet",
      providerVolumeId: null,
      providerSnapshotId: null,
      name: "fleet-visible-instance",
      region: "manual",
      zone: "docker-host-a",
      privateIp: "10.0.0.9",
      publicIp: "198.51.100.9",
      powerState: "running",
      imageId: null,
      flavor: null,
      diskSizeGb: 20,
      launchConfig: null,
      bootstrappedAt: null,
      lastHeartbeatAt: null,
      lastOperationAt: null,
    }),
  );

  const fleet = await service.listWorldInstances();

  assert.equal(fleet.length, 1);
  assert.equal(fleet[0]?.world.id, visibleWorld.id);
  assert.equal(fleet[0]?.instance?.providerInstanceId, "instance-visible-fleet");
});

test("getWorldDriftSummary ignores request gate placeholders", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createCloudService(dataSource);
  const worldRepo = dataSource.getRepository(CloudWorldEntity);

  await saveRequestGatePlaceholderWorld(dataSource, {
    phone: "+8613800138011",
    name: "Hidden Drift Placeholder",
    slug: "world-8011-drift-gate",
    failureCode: REQUEST_GATE_DISABLED_FAILURE_CODE,
    failureMessage: getRequestGateFailureReasonForTest("disabled", "该世界已停用。"),
  });
  await worldRepo.save(
    worldRepo.create({
      phone: "+8613800138012",
      name: "Drift Visible World",
      status: "ready",
      slug: "world-8012-visible",
      desiredState: "running",
      provisionStrategy: "manual-docker",
      providerKey: providerSummary.key,
      providerRegion: "manual",
      providerZone: "docker-host-a",
      runtimeVersion: "test-runtime",
      apiBaseUrl: "https://drift-visible.example.com",
      adminUrl: "https://drift-visible-admin.example.com",
      callbackToken: "token",
      healthStatus: "healthy",
      healthMessage: "World is ready.",
      lastAccessedAt: null,
      lastInteractiveAt: null,
      lastBootedAt: null,
      lastHeartbeatAt: new Date(),
      lastSuspendedAt: null,
      failureCode: null,
      failureMessage: null,
      retryCount: 0,
      note: null,
    }),
  );

  const summary = await service.getWorldDriftSummary();

  assert.equal(summary.totalWorlds, 1);
  assert.equal(summary.readyWorlds, 1);
  assert.equal(summary.failedWorlds, 0);
  assert.equal(
    summary.attentionItems.some(
      (item) => item.phone === "+8613800138011",
    ),
    false,
  );
});

test("direct world admin endpoints hide request gate placeholders", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createCloudService(dataSource, {
    worldLifecycleWorker: {
      reconcileWorldNow: async () => {
        throw new Error("reconcile should not run for hidden placeholder worlds");
      },
    },
  });
  const placeholderWorld = await saveRequestGatePlaceholderWorld(dataSource, {
    phone: "+8613800138013",
    name: "Hidden Detail Placeholder",
    slug: "world-8013-detail-gate",
    failureCode: REQUEST_GATE_PENDING_FAILURE_CODE,
    failureMessage: getRequestGateFailureReasonForTest("pending", "等待审批。"),
  });

  const hiddenWorldCalls = [
    () => service.getWorldById(placeholderWorld.id),
    () => service.getWorldInstance(placeholderWorld.id),
    () => service.getWorldBootstrapConfig(placeholderWorld.id),
    () => service.getWorldRuntimeStatus(placeholderWorld.id),
    () => service.getWorldAlertSummary(placeholderWorld.id),
    () => service.updateWorld(placeholderWorld.id, { note: "should stay hidden" }),
    () => service.reconcileWorld(placeholderWorld.id),
    () => service.rotateWorldCallbackToken(placeholderWorld.id),
    () => service.resumeWorld(placeholderWorld.id),
    () => service.suspendWorld(placeholderWorld.id),
    () => service.retryWorld(placeholderWorld.id),
  ];

  for (const invoke of hiddenWorldCalls) {
    await assert.rejects(invoke, /找不到该云世界。/);
  }
});

test("listJobs excludes request gate placeholder jobs from the global queue", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createCloudService(dataSource);
  const worldRepo = dataSource.getRepository(CloudWorldEntity);
  const jobRepo = dataSource.getRepository(WorldLifecycleJobEntity);

  const placeholderWorld = await saveRequestGatePlaceholderWorld(dataSource, {
    phone: "+8613800138014",
    name: "Hidden Queue Placeholder",
    slug: "world-8014-job-gate",
    failureCode: REQUEST_GATE_PENDING_FAILURE_CODE,
    failureMessage: getRequestGateFailureReasonForTest("pending", "等待审批。"),
  });
  const visibleWorld = await worldRepo.save(
    worldRepo.create({
      phone: "+8613800138015",
      name: "Visible Queue World",
      status: "ready",
      slug: "world-8015-visible",
      desiredState: "running",
      provisionStrategy: "manual-docker",
      providerKey: providerSummary.key,
      providerRegion: "manual",
      providerZone: "docker-host-a",
      runtimeVersion: "test-runtime",
      apiBaseUrl: "https://queue-visible.example.com",
      adminUrl: "https://queue-visible-admin.example.com",
      callbackToken: "token",
      healthStatus: "healthy",
      healthMessage: "World is ready.",
      lastAccessedAt: null,
      lastInteractiveAt: null,
      lastBootedAt: null,
      lastHeartbeatAt: null,
      lastSuspendedAt: null,
      failureCode: null,
      failureMessage: null,
      retryCount: 0,
      note: null,
    }),
  );

  const hiddenJob = await jobRepo.save(
    jobRepo.create({
      worldId: placeholderWorld.id,
      jobType: "resume",
      status: "pending",
      priority: 50,
      payload: { source: "placeholder" },
      attempt: 0,
      maxAttempts: 3,
      leaseOwner: null,
      leaseExpiresAt: null,
      availableAt: new Date(),
      startedAt: null,
      finishedAt: null,
      failureCode: null,
      failureMessage: null,
      resultPayload: null,
    }),
  );
  const visibleJob = await jobRepo.save(
    jobRepo.create({
      worldId: visibleWorld.id,
      jobType: "resume",
      status: "pending",
      priority: 50,
      payload: { source: "visible" },
      attempt: 0,
      maxAttempts: 3,
      leaseOwner: null,
      leaseExpiresAt: null,
      availableAt: new Date(),
      startedAt: null,
      finishedAt: null,
      failureCode: null,
      failureMessage: null,
      resultPayload: null,
    }),
  );

  const jobs = await service.listJobs();

  assert.deepEqual(
    jobs.map((job) => job.id),
    [visibleJob.id],
  );
  assert.equal(jobs.some((job) => job.id === hiddenJob.id), false);
});

test("job endpoints hide request gate placeholder jobs", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createCloudService(dataSource);
  const jobRepo = dataSource.getRepository(WorldLifecycleJobEntity);
  const placeholderWorld = await saveRequestGatePlaceholderWorld(dataSource, {
    phone: "+8613800138016",
    name: "Hidden Job Detail Placeholder",
    slug: "world-8016-job-detail-gate",
    failureCode: REQUEST_GATE_REJECTED_FAILURE_CODE,
    failureMessage: getRequestGateFailureReasonForTest("rejected", "申请未通过。"),
  });
  const hiddenJob = await jobRepo.save(
    jobRepo.create({
      worldId: placeholderWorld.id,
      jobType: "resume",
      status: "failed",
      priority: 50,
      payload: { source: "placeholder" },
      attempt: 3,
      maxAttempts: 3,
      leaseOwner: null,
      leaseExpiresAt: null,
      availableAt: new Date(),
      startedAt: null,
      finishedAt: new Date(),
      failureCode: REQUEST_GATE_REJECTED_FAILURE_CODE,
      failureMessage: getRequestGateFailureReasonForTest("rejected", "申请未通过。"),
      resultPayload: null,
    }),
  );

  await assert.rejects(
    () =>
      service.listJobs({
        worldId: placeholderWorld.id,
      }),
    /找不到该云世界。/,
  );
  await assert.rejects(
    () => service.getJobById(hiddenJob.id),
    /找不到该生命周期任务。/,
  );
});

test("runtime callbacks reject request gate placeholders", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  let refreshCount = 0;
  const service = createWorldRuntimeService(dataSource, {
    waitingSessionSyncService: {
      refreshWaitingSessionsForWorld: async () => {
        refreshCount += 1;
      },
    },
  });
  const worldRepo = dataSource.getRepository(CloudWorldEntity);
  const instanceRepo = dataSource.getRepository(CloudInstanceEntity);
  const placeholderWorld = await saveRequestGatePlaceholderWorld(dataSource, {
    phone: "+8613800138018",
    name: "Hidden Runtime Placeholder",
    slug: "world-8018-runtime-gate",
    failureCode: REQUEST_GATE_PENDING_FAILURE_CODE,
    failureMessage: getRequestGateFailureReasonForTest("pending", "等待审批。"),
    callbackToken: "runtime-token",
  });
  const originalUpdatedAt = placeholderWorld.updatedAt.toISOString();

  const runtimeCalls = [
    () =>
      service.reportBootstrap(placeholderWorld.id, {
        callbackToken: "runtime-token",
        apiBaseUrl: "https://should-not-bootstrap.example.com",
      }),
    () =>
      service.reportHeartbeat(placeholderWorld.id, {
        callbackToken: "runtime-token",
        apiBaseUrl: "https://should-not-heartbeat.example.com",
      }),
    () =>
      service.reportActivity(placeholderWorld.id, {
        callbackToken: "runtime-token",
        lastInteractiveAt: new Date().toISOString(),
      }),
    () =>
      service.reportHealth(placeholderWorld.id, {
        callbackToken: "runtime-token",
        healthStatus: "healthy",
        healthMessage: "should stay hidden",
      }),
    () =>
      service.reportFailure(placeholderWorld.id, {
        callbackToken: "runtime-token",
        failureCode: "runtime_failure",
        failureMessage: "should not apply",
      }),
  ];

  for (const invoke of runtimeCalls) {
    await assert.rejects(invoke, /World not found\./);
  }

  const persistedWorld = await worldRepo.findOneByOrFail({
    id: placeholderWorld.id,
  });
  assert.equal(persistedWorld.status, "disabled");
  assert.equal(persistedWorld.failureCode, REQUEST_GATE_PENDING_FAILURE_CODE);
  assert.equal(
    persistedWorld.failureMessage,
    getRequestGateFailureReasonForTest("pending", "等待审批。"),
  );
  assert.equal(persistedWorld.apiBaseUrl, null);
  assert.equal(persistedWorld.adminUrl, null);
  assert.equal(persistedWorld.lastBootedAt, null);
  assert.equal(persistedWorld.lastHeartbeatAt, null);
  assert.equal(persistedWorld.lastInteractiveAt, null);
  assert.equal(persistedWorld.updatedAt.toISOString(), originalUpdatedAt);
  assert.equal(
    await instanceRepo.count({
      where: { worldId: placeholderWorld.id },
    }),
    0,
  );
  assert.equal(refreshCount, 0);
});

test("listWaitingSessionSyncTasks exposes pending running and failed retry tasks", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createCloudService(dataSource);
  const taskRepo = dataSource.getRepository(WaitingSessionSyncTaskEntity);
  const now = new Date("2026-04-21T06:00:00.000Z");

  await taskRepo.save(
    taskRepo.create({
      taskKey: "refresh-phone:+8613800138111",
      taskType: "refresh_phone",
      targetValue: "+8613800138111",
      context: "cloud.updateRequest",
      status: "pending",
      attempt: 1,
      maxAttempts: 3,
      availableAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: "first retry failed",
      finishedAt: null,
    }),
  );
  const runningTask = await taskRepo.save(
    taskRepo.create({
      taskKey: "refresh-world:world-running-task",
      taskType: "refresh_world",
      targetValue: "world-running-task",
      context: "runtime.heartbeat",
      status: "running",
      attempt: 2,
      maxAttempts: 3,
      availableAt: now,
      leaseOwner: "worker-running",
      leaseExpiresAt: new Date(Date.now() + 60_000),
      lastError: "still retrying",
      finishedAt: null,
    }),
  );
  const failedTask = await taskRepo.save(
    taskRepo.create({
      taskKey: "invalidate-phone:+8613800138222",
      taskType: "invalidate_phone",
      targetValue: "+8613800138222",
      context: "cloud.updateWorld",
      status: "failed",
      attempt: 3,
      maxAttempts: 3,
      availableAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: "retry exhausted",
      finishedAt: now,
    }),
  );

  const failedResult = await service.listWaitingSessionSyncTasks({
    status: "failed",
    query: "exhausted",
    page: 1,
    pageSize: 5,
  });
  assert.equal(failedResult.total, 1);
  assert.equal(failedResult.items[0]?.id, failedTask.id);
  assert.equal(failedResult.items[0]?.status, "failed");
  assert.equal(failedResult.items[0]?.taskType, "invalidate_phone");
  assert.equal(
    failedResult.items[0]?.finishedAt,
    failedTask.finishedAt?.toISOString() ?? null,
  );

  const runningResult = await service.listWaitingSessionSyncTasks({
    status: "running",
    taskType: "refresh_world",
  });
  assert.equal(runningResult.total, 1);
  assert.equal(runningResult.items[0]?.id, runningTask.id);
  assert.equal(runningResult.items[0]?.leaseOwner, "worker-running");
  assert.equal(runningResult.items[0]?.status, "running");

  const pagedResult = await service.listWaitingSessionSyncTasks({
    page: 1,
    pageSize: 1,
  });
  assert.equal(pagedResult.page, 1);
  assert.equal(pagedResult.pageSize, 1);
  assert.equal(pagedResult.total, 3);
  assert.equal(pagedResult.totalPages, 3);
});

test("replayFilteredFailedWaitingSessionSyncTasks matches failed tasks by current filters", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const taskRepo = dataSource.getRepository(WaitingSessionSyncTaskEntity);
  const replayCalls: string[][] = [];
  const service = createCloudService(dataSource, {
    waitingSessionSyncService: {
      refreshWaitingSessionsForWorld: async () => undefined,
      refreshWaitingSessionsForPhone: async () => undefined,
      invalidateWaitingSessionsForPhone: async () => undefined,
      replayFailedTasks: async (taskIds: string[]) => {
        replayCalls.push(taskIds);
        return {
          success: true,
          replayedTaskIds: taskIds.slice(0, 1),
          skippedTaskIds: taskIds.slice(1),
        };
      },
      clearFailedTasks: async () => ({
        success: true,
        clearedTaskIds: [],
        skippedTaskIds: [],
      }),
    },
  });

  const matchedTaskA = await taskRepo.save(
    taskRepo.create({
      taskKey: "refresh-world:filtered-replay-a",
      taskType: "refresh_world",
      targetValue: "filtered-replay-a",
      context: "filtered replay target batch",
      status: "failed",
      attempt: 3,
      maxAttempts: 3,
      availableAt: new Date("2026-04-21T06:08:00.000Z"),
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: "batch replay failed",
      finishedAt: new Date("2026-04-21T06:08:00.000Z"),
    }),
  );
  const matchedTaskB = await taskRepo.save(
    taskRepo.create({
      taskKey: "refresh-world:filtered-replay-b",
      taskType: "refresh_world",
      targetValue: "filtered-replay-b",
      context: "filtered replay target batch",
      status: "failed",
      attempt: 2,
      maxAttempts: 3,
      availableAt: new Date("2026-04-21T06:09:00.000Z"),
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: "batch replay failed",
      finishedAt: new Date("2026-04-21T06:09:00.000Z"),
    }),
  );
  await taskRepo.save(
    taskRepo.create({
      taskKey: "refresh-phone:+8613800138777",
      taskType: "refresh_phone",
      targetValue: "+8613800138777",
      context: "filtered replay target batch",
      status: "failed",
      attempt: 3,
      maxAttempts: 3,
      availableAt: new Date("2026-04-21T06:10:00.000Z"),
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: "batch replay failed",
      finishedAt: new Date("2026-04-21T06:10:00.000Z"),
    }),
  );
  await taskRepo.save(
    taskRepo.create({
      taskKey: "refresh-world:filtered-replay-pending",
      taskType: "refresh_world",
      targetValue: "filtered-replay-pending",
      context: "filtered replay target batch",
      status: "pending",
      attempt: 1,
      maxAttempts: 3,
      availableAt: new Date("2099-04-21T06:11:00.000Z"),
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: "not failed yet",
      finishedAt: null,
    }),
  );

  const response = await service.replayFilteredFailedWaitingSessionSyncTasks({
    taskType: "refresh_world",
    query: " target batch ",
  });

  assert.deepEqual(response, {
    success: true,
    matchedCount: 2,
    replayedCount: 1,
    skippedCount: 1,
  });
  assert.deepEqual(
    replayCalls.map((taskIds) => [...taskIds].sort()),
    [[matchedTaskA.id, matchedTaskB.id].sort()],
  );
});

test("clearFilteredFailedWaitingSessionSyncTasks matches failed tasks by current filters", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const taskRepo = dataSource.getRepository(WaitingSessionSyncTaskEntity);
  const clearCalls: string[][] = [];
  const service = createCloudService(dataSource, {
    waitingSessionSyncService: {
      refreshWaitingSessionsForWorld: async () => undefined,
      refreshWaitingSessionsForPhone: async () => undefined,
      invalidateWaitingSessionsForPhone: async () => undefined,
      replayFailedTasks: async () => ({
        success: true,
        replayedTaskIds: [],
        skippedTaskIds: [],
      }),
      clearFailedTasks: async (taskIds: string[]) => {
        clearCalls.push(taskIds);
        return {
          success: true,
          clearedTaskIds: taskIds.slice(0, 1),
          skippedTaskIds: taskIds.slice(1),
        };
      },
    },
  });

  const matchedTaskA = await taskRepo.save(
    taskRepo.create({
      taskKey: "refresh-world:filtered-clear-a",
      taskType: "refresh_world",
      targetValue: "filtered-clear-a",
      context: "filtered clear target batch",
      status: "failed",
      attempt: 3,
      maxAttempts: 3,
      availableAt: new Date("2026-04-21T06:12:00.000Z"),
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: "batch clear failed",
      finishedAt: new Date("2026-04-21T06:12:00.000Z"),
    }),
  );
  const matchedTaskB = await taskRepo.save(
    taskRepo.create({
      taskKey: "refresh-world:filtered-clear-b",
      taskType: "refresh_world",
      targetValue: "filtered-clear-b",
      context: "filtered clear target batch",
      status: "failed",
      attempt: 2,
      maxAttempts: 3,
      availableAt: new Date("2026-04-21T06:13:00.000Z"),
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: "batch clear failed",
      finishedAt: new Date("2026-04-21T06:13:00.000Z"),
    }),
  );
  await taskRepo.save(
    taskRepo.create({
      taskKey: "refresh-world:filtered-clear-running",
      taskType: "refresh_world",
      targetValue: "filtered-clear-running",
      context: "filtered clear target batch",
      status: "running",
      attempt: 2,
      maxAttempts: 3,
      availableAt: new Date("2026-04-21T06:14:00.000Z"),
      leaseOwner: "worker-running",
      leaseExpiresAt: new Date("2026-04-21T06:15:00.000Z"),
      lastError: "still running",
      finishedAt: null,
    }),
  );

  const response = await service.clearFilteredFailedWaitingSessionSyncTasks({
    taskType: "refresh_world",
    query: "clear target batch",
  });

  assert.deepEqual(response, {
    success: true,
    matchedCount: 2,
    clearedCount: 1,
    skippedCount: 1,
  });
  assert.deepEqual(
    clearCalls.map((taskIds) => [...taskIds].sort()),
    [[matchedTaskA.id, matchedTaskB.id].sort()],
  );
});

test("replayFailedTasks requeues failed waiting session sync tasks and skips non-failed ids", async (t) => {
  const dataSource = await createTestDataSource();
  const taskRepo = dataSource.getRepository(WaitingSessionSyncTaskEntity);
  let refreshWorldCalls = 0;
  const waitingSessionSyncService = createWaitingSessionSyncService(
    dataSource,
    {
      refreshWaitingSessionsForWorld: async (worldId: string) => {
        refreshWorldCalls += 1;
        assert.equal(worldId, "world-replay-target");
      },
      refreshWaitingSessionsForPhone: async () => undefined,
      invalidateWaitingSessionsForPhone: async () => undefined,
    },
    {
      CLOUD_WAITING_SESSION_SYNC_RETRY_ATTEMPTS: "3",
      CLOUD_WAITING_SESSION_SYNC_RETRY_DELAY_MS: "0",
      CLOUD_WAITING_SESSION_SYNC_POLL_INTERVAL_MS: "60000",
    },
  );
  t.after(async () => {
    waitingSessionSyncService.onModuleDestroy();
    await dataSource.destroy();
  });

  const failedTask = await taskRepo.save(
    taskRepo.create({
      taskKey: "refresh-world:world-replay-target",
      taskType: "refresh_world",
      targetValue: "world-replay-target",
      context: "worker.reconcile",
      status: "failed",
      attempt: 3,
      maxAttempts: 3,
      availableAt: new Date("2026-04-21T06:05:00.000Z"),
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: "retry exhausted",
      finishedAt: new Date("2026-04-21T06:05:00.000Z"),
    }),
  );
  const pendingTask = await taskRepo.save(
    taskRepo.create({
      taskKey: "refresh-phone:+8613800138555",
      taskType: "refresh_phone",
      targetValue: "+8613800138555",
      context: "cloud.updateRequest",
      status: "pending",
      attempt: 1,
      maxAttempts: 3,
      availableAt: new Date("2099-04-21T06:06:00.000Z"),
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: "still retrying",
      finishedAt: null,
    }),
  );
  const missingTaskId = "f0f0f0f0-1111-4222-8333-444444444444";

  const response = await waitingSessionSyncService.replayFailedTasks([
    failedTask.id,
    pendingTask.id,
    missingTaskId,
  ]);

  assert.deepEqual(response, {
    success: true,
    replayedTaskIds: [failedTask.id],
    skippedTaskIds: [pendingTask.id, missingTaskId],
  });
  await waitForCondition(async () => {
    return (await taskRepo.findOne({ where: { id: failedTask.id } })) === null;
  });
  assert.equal(refreshWorldCalls, 1);
  assert.equal(
    (await taskRepo.findOne({ where: { id: pendingTask.id } }))?.status,
    "pending",
  );
});

test("clearFailedTasks deletes only failed waiting session sync tasks", async (t) => {
  const dataSource = await createTestDataSource();
  const taskRepo = dataSource.getRepository(WaitingSessionSyncTaskEntity);
  const waitingSessionSyncService = createWaitingSessionSyncService(
    dataSource,
    {
      refreshWaitingSessionsForWorld: async () => undefined,
      refreshWaitingSessionsForPhone: async () => undefined,
      invalidateWaitingSessionsForPhone: async () => undefined,
    },
  );
  t.after(async () => {
    waitingSessionSyncService.onModuleDestroy();
    await dataSource.destroy();
  });

  const failedTask = await taskRepo.save(
    taskRepo.create({
      taskKey: "invalidate-phone:+8613800138666",
      taskType: "invalidate_phone",
      targetValue: "+8613800138666",
      context: "cloud.updateWorld",
      status: "failed",
      attempt: 3,
      maxAttempts: 3,
      availableAt: new Date("2026-04-21T06:10:00.000Z"),
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: "retry exhausted",
      finishedAt: new Date("2026-04-21T06:10:00.000Z"),
    }),
  );
  const runningTask = await taskRepo.save(
    taskRepo.create({
      taskKey: "refresh-world:world-running-task",
      taskType: "refresh_world",
      targetValue: "world-running-task",
      context: "runtime.heartbeat",
      status: "running",
      attempt: 2,
      maxAttempts: 3,
      availableAt: new Date("2026-04-21T06:10:00.000Z"),
      leaseOwner: "worker-running",
      leaseExpiresAt: new Date(Date.now() + 60_000),
      lastError: "still retrying",
      finishedAt: null,
    }),
  );
  const missingTaskId = "0f0f0f0f-2222-4333-8444-555555555555";

  const response = await waitingSessionSyncService.clearFailedTasks([
    runningTask.id,
    failedTask.id,
    missingTaskId,
  ]);

  assert.deepEqual(response, {
    success: true,
    clearedTaskIds: [failedTask.id],
    skippedTaskIds: [runningTask.id, missingTaskId],
  });
  assert.equal(
    await taskRepo.findOne({ where: { id: failedTask.id } }),
    null,
  );
  assert.equal(
    (await taskRepo.findOne({ where: { id: runningTask.id } }))?.status,
    "running",
  );
});

test("runtime heartbeat keeps world updates when waiting session refresh falls back to retry", async (t) => {
  const dataSource = await createTestDataSource();
  let refreshCalls = 0;
  const waitingSessionSyncService = createWaitingSessionSyncService(
    dataSource,
    {
      refreshWaitingSessionsForWorld: async () => {
        refreshCalls += 1;
        throw new Error("refresh failed");
      },
      refreshWaitingSessionsForPhone: async () => undefined,
      invalidateWaitingSessionsForPhone: async () => undefined,
    },
    {
      CLOUD_WAITING_SESSION_SYNC_RETRY_ATTEMPTS: "2",
      CLOUD_WAITING_SESSION_SYNC_RETRY_DELAY_MS: "0",
    },
  );
  t.after(async () => {
    waitingSessionSyncService.onModuleDestroy();
    await dataSource.destroy();
  });

  const service = createWorldRuntimeService(dataSource, {
    waitingSessionSyncService,
  });
  const worldRepo = dataSource.getRepository(CloudWorldEntity);

  const world = await worldRepo.save(
    worldRepo.create({
      phone: "+8613800138077",
      name: "Runtime Retry World",
      status: "starting",
      slug: "world-8077-runtime-retry",
      desiredState: "running",
      provisionStrategy: "manual-docker",
      providerKey: providerSummary.key,
      providerRegion: "manual",
      providerZone: "docker-host-a",
      runtimeVersion: "runtime-v1",
      apiBaseUrl: "https://runtime-retry-world.example.com",
      adminUrl: "https://runtime-retry-world-admin.example.com",
      callbackToken: "runtime-retry-token",
      healthStatus: "starting",
      healthMessage: "starting",
      lastAccessedAt: null,
      lastInteractiveAt: null,
      lastBootedAt: null,
      lastHeartbeatAt: null,
      lastSuspendedAt: null,
      failureCode: null,
      failureMessage: null,
      retryCount: 0,
      note: null,
    }),
  );

  const result = await service.reportHeartbeat(world.id, {
    callbackToken: "runtime-retry-token",
    healthStatus: "healthy",
    healthMessage: "world is ready",
    reportedAt: "2026-04-21T12:00:00.000Z",
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "ready");
  const persistedWorld = await worldRepo.findOneByOrFail({
    id: world.id,
  });
  assert.equal(persistedWorld.status, "ready");
  assert.equal(persistedWorld.healthStatus, "healthy");
  assert.equal(persistedWorld.healthMessage, "world is ready");

  await waitForCondition(() => refreshCalls >= 2);
});

test("waiting session sync resumes persisted retries after service restart", async (t) => {
  const dataSource = await createTestDataSource();
  let refreshCalls = 0;
  const worldAccessService = {
    refreshWaitingSessionsForWorld: async () => {
      refreshCalls += 1;
      if (refreshCalls === 1) {
        throw new Error("refresh failed");
      }
    },
    refreshWaitingSessionsForPhone: async () => undefined,
    invalidateWaitingSessionsForPhone: async () => undefined,
  };
  const taskRepo = dataSource.getRepository(WaitingSessionSyncTaskEntity);
  t.after(async () => {
    await dataSource.destroy();
  });

  const firstService = createWaitingSessionSyncService(
    dataSource,
    worldAccessService,
    {
      CLOUD_WAITING_SESSION_SYNC_RETRY_ATTEMPTS: "3",
      CLOUD_WAITING_SESSION_SYNC_RETRY_DELAY_MS: "25",
      CLOUD_WAITING_SESSION_SYNC_POLL_INTERVAL_MS: "10",
    },
  );

  await firstService.refreshWaitingSessionsForWorld(
    "world-restart-retry",
    "restart-test",
  );
  assert.equal(
    await taskRepo.count({
      where: { taskKey: "refresh-world:world-restart-retry" },
    }),
    1,
  );

  firstService.onModuleDestroy();

  const secondService = createWaitingSessionSyncService(
    dataSource,
    worldAccessService,
    {
      CLOUD_WAITING_SESSION_SYNC_RETRY_ATTEMPTS: "3",
      CLOUD_WAITING_SESSION_SYNC_RETRY_DELAY_MS: "25",
      CLOUD_WAITING_SESSION_SYNC_POLL_INTERVAL_MS: "10",
    },
  );
  secondService.onModuleInit();
  t.after(() => {
    secondService.onModuleDestroy();
  });

  await waitForCondition(() => refreshCalls >= 2, 500);
  await waitForCondition(
    async () =>
      (await taskRepo.count({
        where: { taskKey: "refresh-world:world-restart-retry" },
      })) === 0,
    500,
  );
});

test("listSessions returns an empty result for currentOnly without a current session id", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createAdminAuthService(dataSource);
  await saveAdminSession(dataSource, {
    issuedUserAgent: "CurrentOnly Regression/1.0",
  });

  const result = await service.listSessions(null, {
    currentOnly: true,
    page: 3,
    pageSize: 5,
  });

  assert.deepEqual(result, {
    items: [],
    total: 0,
    page: 3,
    pageSize: 5,
    totalPages: 1,
  });
});

test("listSessions sorts by expiresAt ascending and marks the current session", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createAdminAuthService(dataSource);
  const latestSession = await saveAdminSession(dataSource, {
    issuedUserAgent: "Sort Latest Session/1.0",
    expiresAt: new Date("2026-04-29T00:00:00.000Z"),
  });
  const currentSession = await saveAdminSession(dataSource, {
    issuedUserAgent: "Sort Current Session/1.0",
    expiresAt: new Date("2026-04-21T00:00:00.000Z"),
  });
  const middleSession = await saveAdminSession(dataSource, {
    issuedUserAgent: "Sort Middle Session/1.0",
    expiresAt: new Date("2026-04-25T00:00:00.000Z"),
  });

  const result = await service.listSessions(currentSession.id, {
    sortBy: "expiresAt",
    sortDirection: "asc",
  });

  assert.deepEqual(
    result.items.map((session) => session.id),
    [currentSession.id, middleSession.id, latestSession.id],
  );
  assert.equal(result.items[0]?.isCurrent, true);
  assert.equal(result.items[1]?.isCurrent, false);
  assert.equal(result.items[2]?.isCurrent, false);
});

test("listSessions filters by sourceKey", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createAdminAuthService(dataSource);
  const matchingCurrent = await saveAdminSession(dataSource, {
    issuedFromIp: "203.0.113.120",
    issuedUserAgent: "Focused Source Browser",
  });
  const matchingSibling = await saveAdminSession(dataSource, {
    issuedFromIp: "203.0.113.120",
    issuedUserAgent: "Focused Source Browser",
  });
  await saveAdminSession(dataSource, {
    issuedFromIp: "198.51.100.120",
    issuedUserAgent: "Other Source Browser",
  });

  const result = await service.listSessions(matchingCurrent.id, {
    sourceKey: encodeSessionSourceGroupKey(
      "203.0.113.120",
      "Focused Source Browser",
    ),
    sortBy: "createdAt",
    sortDirection: "asc",
  });

  assert.equal(result.total, 2);
  assert.deepEqual(
    result.items.map((session) => session.id).sort(),
    [matchingCurrent.id, matchingSibling.id].sort(),
  );
  assert.ok(
    result.items.every(
      (session) =>
        session.issuedFromIp === "203.0.113.120" &&
        session.issuedUserAgent === "Focused Source Browser",
    ),
  );
});

test("revokeSessionById preserves usage audit and records manual revocation metadata", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createAdminAuthService(dataSource);
  const originalLastUsedAt = new Date("2026-04-20T06:30:00.000Z");
  const session = await saveAdminSession(dataSource, {
    issuedUserAgent: "Revoke Regression Session/1.0",
    lastUsedAt: originalLastUsedAt,
  });

  const response = await service.revokeSessionById(
    session.id,
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  );

  assert.deepEqual(response, { success: true });

  const persisted = await dataSource.getRepository(CloudAdminSessionEntity).findOneByOrFail({
    id: session.id,
  });
  assert.ok(persisted.revokedAt instanceof Date);
  assert.equal(
    persisted.revokedBySessionId,
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  );
  assert.equal(persisted.revocationReason, "manual-revocation");
  assert.equal(
    persisted.lastUsedAt?.toISOString(),
    originalLastUsedAt.toISOString(),
  );
});

test("revokeFilteredSessions revokes matching active sessions and reports the current session", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createAdminAuthService(dataSource);
  const currentSession = await saveAdminSession(dataSource, {
    issuedUserAgent: "Filtered Current Session/1.0",
  });
  const matchingSession = await saveAdminSession(dataSource, {
    issuedUserAgent: "Filtered Browser Session/1.0",
  });
  const revokedSession = await saveAdminSession(dataSource, {
    issuedUserAgent: "Filtered Revoked Session/1.0",
    revokedAt: new Date("2026-04-20T02:00:00.000Z"),
    revocationReason: "manual-revocation",
  });

  const response = await service.revokeFilteredSessions(currentSession.id, {
    query: "Filtered",
  });

  assert.deepEqual(response, {
    success: true,
    revokedCount: 2,
    skippedCount: 1,
    revokedCurrentSession: true,
  });

  const persistedMatchingSession = await dataSource
    .getRepository(CloudAdminSessionEntity)
    .findOneByOrFail({ id: matchingSession.id });
  assert.equal(
    persistedMatchingSession.revocationReason,
    "manual-revocation",
  );
  assert.equal(
    persistedMatchingSession.revokedBySessionId,
    currentSession.id,
  );

  const persistedRevokedSession = await dataSource
    .getRepository(CloudAdminSessionEntity)
    .findOneByOrFail({ id: revokedSession.id });
  assert.equal(
    persistedRevokedSession.revokedAt?.toISOString(),
    "2026-04-20T02:00:00.000Z",
  );
});

test("listSessionSourceGroups aggregates session counts by issued source", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createAdminAuthService(dataSource);
  const currentSession = await saveAdminSession(dataSource, {
    issuedFromIp: "203.0.113.90",
    issuedUserAgent: "Grouped Browser",
    expiresAt: new Date("2026-04-27T00:00:00.000Z"),
  });
  await saveAdminSession(dataSource, {
    issuedFromIp: "203.0.113.90",
    issuedUserAgent: "Grouped Browser",
    expiresAt: new Date("2026-04-19T00:00:00.000Z"),
  });
  await saveAdminSession(dataSource, {
    issuedFromIp: "203.0.113.90",
    issuedUserAgent: "Grouped Browser",
    revokedAt: new Date("2026-04-20T07:00:00.000Z"),
    revokedBySessionId: currentSession.id,
    revocationReason: "manual-revocation",
  });
  await saveAdminSession(dataSource, {
    issuedFromIp: "198.51.100.90",
    issuedUserAgent: "Separate Browser",
  });

  const groups = await service.listSessionSourceGroups(currentSession.id, {});

  assert.equal(groups.total, 2);
  assert.equal(groups.page, 1);
  assert.equal(groups.pageSize, 6);
  assert.equal(groups.totalPages, 1);
  assert.equal(groups.items.length, 2);
  const groupedBrowser = groups.items.find(
    (group) =>
      group.sourceKey ===
      encodeSessionSourceGroupKey("203.0.113.90", "Grouped Browser"),
  );
  assert.ok(groupedBrowser);
  assert.equal(groupedBrowser.totalSessions, 3);
  assert.equal(groupedBrowser.activeSessions, 1);
  assert.equal(groupedBrowser.expiredSessions, 1);
  assert.equal(groupedBrowser.revokedSessions, 1);
  assert.equal(groupedBrowser.refreshTokenReuseRevocations, 0);
  assert.equal(groupedBrowser.currentSessions, 1);
  assert.equal(groupedBrowser.riskLevel, "normal");
  assert.deepEqual(groupedBrowser.riskSignals, []);
  assert.equal(groupedBrowser.issuedFromIp, "203.0.113.90");
  assert.equal(groupedBrowser.issuedUserAgent, "Grouped Browser");
});

test("listSessionSourceGroups sorts and paginates grouped sources", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createAdminAuthService(dataSource);
  await saveAdminSession(dataSource, {
    issuedFromIp: "203.0.113.101",
    issuedUserAgent: "Source Sort A",
    lastUsedAt: new Date("2026-04-20T00:10:00.000Z"),
  });
  await saveAdminSession(dataSource, {
    issuedFromIp: "203.0.113.102",
    issuedUserAgent: "Source Sort B",
    lastUsedAt: new Date("2026-04-20T00:20:00.000Z"),
  });
  await saveAdminSession(dataSource, {
    issuedFromIp: "203.0.113.103",
    issuedUserAgent: "Source Sort C",
    lastUsedAt: new Date("2026-04-20T00:30:00.000Z"),
  });

  const groups = await service.listSessionSourceGroups(null, {
    query: "Source Sort",
    sortBy: "latestLastUsedAt",
    sortDirection: "asc",
    page: 2,
    pageSize: 1,
  });

  assert.equal(groups.total, 3);
  assert.equal(groups.page, 2);
  assert.equal(groups.pageSize, 1);
  assert.equal(groups.totalPages, 3);
  assert.equal(groups.items.length, 1);
  assert.equal(groups.items[0]?.issuedUserAgent, "Source Sort B");
  assert.equal(groups.items[0]?.riskLevel, "normal");
});

test("listSessionSourceGroups narrows to a focused sourceKey", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createAdminAuthService(dataSource);
  await saveAdminSession(dataSource, {
    issuedFromIp: "203.0.113.130",
    issuedUserAgent: "Focused Source Group Browser",
  });
  await saveAdminSession(dataSource, {
    issuedFromIp: "203.0.113.130",
    issuedUserAgent: "Focused Source Group Browser",
  });
  await saveAdminSession(dataSource, {
    issuedFromIp: "198.51.100.130",
    issuedUserAgent: "Other Source Group Browser",
  });

  const groups = await service.listSessionSourceGroups(null, {
    sourceKey: encodeSessionSourceGroupKey(
      "203.0.113.130",
      "Focused Source Group Browser",
    ),
  });

  assert.equal(groups.total, 1);
  assert.equal(groups.items.length, 1);
  assert.equal(groups.items[0]?.issuedFromIp, "203.0.113.130");
  assert.equal(groups.items[0]?.issuedUserAgent, "Focused Source Group Browser");
  assert.equal(groups.items[0]?.totalSessions, 2);
  assert.equal(groups.items[0]?.riskLevel, "watch");
  assert.deepEqual(groups.items[0]?.riskSignals, ["multiple-active-sessions"]);
});

test("listSessionSourceGroups marks refresh token reuse groups as critical", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createAdminAuthService(dataSource);
  await saveAdminSession(dataSource, {
    issuedFromIp: "203.0.113.131",
    issuedUserAgent: "Refresh Reuse Browser",
    revokedAt: new Date("2026-04-20T01:10:00.000Z"),
    revocationReason: "refresh-token-reuse",
  });

  const groups = await service.listSessionSourceGroups(null, {
    query: "Refresh Reuse Browser",
  });

  assert.equal(groups.total, 1);
  assert.equal(groups.items[0]?.refreshTokenReuseRevocations, 1);
  assert.equal(groups.items[0]?.riskLevel, "critical");
  assert.deepEqual(groups.items[0]?.riskSignals, ["refresh-token-reuse"]);
});

test("createSessionSourceGroupSnapshot returns filtered sessions and aggregate audit data", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createAdminAuthService(dataSource);
  const currentSession = await saveAdminSession(dataSource, {
    issuedFromIp: "203.0.113.140",
    issuedUserAgent: "Snapshot Source Browser",
    lastUsedAt: new Date("2026-04-20T00:30:00.000Z"),
  });
  await saveAdminSession(dataSource, {
    issuedFromIp: "203.0.113.140",
    issuedUserAgent: "Snapshot Source Browser",
    revokedAt: new Date("2026-04-20T00:40:00.000Z"),
    revokedBySessionId: currentSession.id,
    revocationReason: "manual-revocation",
    lastUsedAt: new Date("2026-04-20T00:35:00.000Z"),
  });
  await saveAdminSession(dataSource, {
    issuedFromIp: "198.51.100.140",
    issuedUserAgent: "Other Snapshot Browser",
  });

  const snapshot = await service.createSessionSourceGroupSnapshot(
    currentSession.id,
    {
      sourceKey: encodeSessionSourceGroupKey(
        "203.0.113.140",
        "Snapshot Source Browser",
      ),
    },
  );

  assert.equal(snapshot.group.sourceKey, encodeSessionSourceGroupKey(
    "203.0.113.140",
    "Snapshot Source Browser",
  ));
  assert.equal(snapshot.group.totalSessions, 2);
  assert.equal(snapshot.group.activeSessions, 1);
  assert.equal(snapshot.group.revokedSessions, 1);
  assert.equal(snapshot.group.refreshTokenReuseRevocations, 0);
  assert.equal(snapshot.group.currentSessions, 1);
  assert.equal(snapshot.group.riskLevel, "normal");
  assert.deepEqual(snapshot.group.riskSignals, []);
  assert.equal(snapshot.sessions.length, 2);
  assert.ok(
    snapshot.sessions.every(
      (session) =>
        session.issuedFromIp === "203.0.113.140" &&
        session.issuedUserAgent === "Snapshot Source Browser",
    ),
  );
});

test("createSessionSourceGroupRiskSnapshot returns matching risk groups and sessions", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createAdminAuthService(dataSource);
  const currentSession = await saveAdminSession(dataSource, {
    issuedFromIp: "203.0.113.141",
    issuedUserAgent: "Risk Snapshot Browser",
  });
  await saveAdminSession(dataSource, {
    issuedFromIp: "203.0.113.141",
    issuedUserAgent: "Risk Snapshot Browser",
  });
  await saveAdminSession(dataSource, {
    issuedFromIp: "198.51.100.141",
    issuedUserAgent: "Risk Critical Snapshot Browser",
    revokedAt: new Date("2026-04-20T00:45:00.000Z"),
    revocationReason: "refresh-token-reuse",
  });
  await saveAdminSession(dataSource, {
    issuedFromIp: "198.51.100.142",
    issuedUserAgent: "Risk Normal Snapshot Browser",
  });

  const snapshot = await service.createSessionSourceGroupRiskSnapshot(
    currentSession.id,
    {
      riskLevel: "watch",
    },
  );

  assert.equal(snapshot.totalGroups, 1);
  assert.equal(snapshot.totalSessions, 2);
  assert.equal(snapshot.filters.riskLevel, "watch");
  assert.equal(snapshot.groups.length, 1);
  assert.equal(snapshot.groups[0]?.issuedFromIp, "203.0.113.141");
  assert.equal(snapshot.groups[0]?.riskLevel, "watch");
  assert.deepEqual(snapshot.groups[0]?.riskSignals, [
    "multiple-active-sessions",
  ]);
  assert.equal(snapshot.sessions.length, 2);
  assert.ok(
    snapshot.sessions.every(
      (session) => session.issuedUserAgent === "Risk Snapshot Browser",
    ),
  );
});

test("revokeSessionSourceGroup revokes only active sessions within the matching source key", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createAdminAuthService(dataSource);
  const currentSession = await saveAdminSession(dataSource, {
    issuedFromIp: "203.0.113.91",
    issuedUserAgent: "Source Group Browser",
  });
  const activeSibling = await saveAdminSession(dataSource, {
    issuedFromIp: "203.0.113.91",
    issuedUserAgent: "Source Group Browser",
  });
  const revokedSibling = await saveAdminSession(dataSource, {
    issuedFromIp: "203.0.113.91",
    issuedUserAgent: "Source Group Browser",
    revokedAt: new Date("2026-04-20T07:10:00.000Z"),
    revokedBySessionId: currentSession.id,
    revocationReason: "manual-revocation",
  });
  const otherSourceSession = await saveAdminSession(dataSource, {
    issuedFromIp: "198.51.100.91",
    issuedUserAgent: "Other Source Browser",
  });

  const response = await service.revokeSessionSourceGroup(
    currentSession.id,
    {
      sourceKey: encodeSessionSourceGroupKey(
        "203.0.113.91",
        "Source Group Browser",
      ),
    },
  );

  assert.deepEqual(response, {
    success: true,
    revokedCount: 2,
    skippedCount: 1,
    revokedCurrentSession: true,
  });

  const sessionRepo = dataSource.getRepository(CloudAdminSessionEntity);
  const persistedCurrent = await sessionRepo.findOneByOrFail({ id: currentSession.id });
  const persistedSibling = await sessionRepo.findOneByOrFail({ id: activeSibling.id });
  const persistedRevoked = await sessionRepo.findOneByOrFail({ id: revokedSibling.id });
  const persistedOtherSource = await sessionRepo.findOneByOrFail({ id: otherSourceSession.id });

  assert.ok(persistedCurrent.revokedAt instanceof Date);
  assert.ok(persistedSibling.revokedAt instanceof Date);
  assert.ok(persistedRevoked.revokedAt instanceof Date);
  assert.equal(persistedOtherSource.revokedAt, null);
});

test("revokeSessionSourceGroup returns an empty result when currentOnly is requested without a current session id", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createAdminAuthService(dataSource);
  const matchingSession = await saveAdminSession(dataSource, {
    issuedFromIp: "203.0.113.92",
    issuedUserAgent: "Current Only Source Group",
  });

  const response = await service.revokeSessionSourceGroup(null, {
    sourceKey: encodeSessionSourceGroupKey(
      "203.0.113.92",
      "Current Only Source Group",
    ),
    currentOnly: true,
  });

  assert.deepEqual(response, {
    success: true,
    revokedCount: 0,
    skippedCount: 0,
    revokedCurrentSession: false,
  });

  const persisted = await dataSource
    .getRepository(CloudAdminSessionEntity)
    .findOneByOrFail({ id: matchingSession.id });
  assert.equal(persisted.revokedAt, null);
});

test("revokeSessionSourceGroupsByRisk revokes matching watch groups only", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createAdminAuthService(dataSource);
  const currentSession = await saveAdminSession(dataSource, {
    issuedFromIp: "203.0.113.93",
    issuedUserAgent: "Risk Watch Browser",
  });
  const activeWatchSibling = await saveAdminSession(dataSource, {
    issuedFromIp: "203.0.113.93",
    issuedUserAgent: "Risk Watch Browser",
  });
  const expiredWatchSibling = await saveAdminSession(dataSource, {
    issuedFromIp: "203.0.113.93",
    issuedUserAgent: "Risk Watch Browser",
    expiresAt: new Date("2026-04-19T00:00:00.000Z"),
  });
  const criticalReuseSession = await saveAdminSession(dataSource, {
    issuedFromIp: "198.51.100.93",
    issuedUserAgent: "Risk Critical Browser",
    revokedAt: new Date("2026-04-20T07:30:00.000Z"),
    revocationReason: "refresh-token-reuse",
  });
  const normalSession = await saveAdminSession(dataSource, {
    issuedFromIp: "198.51.100.94",
    issuedUserAgent: "Risk Normal Browser",
  });

  const response = await service.revokeSessionSourceGroupsByRisk(
    currentSession.id,
    {
      riskLevel: "watch",
    },
  );

  assert.deepEqual(response, {
    success: true,
    matchedGroupCount: 1,
    revokedGroupCount: 1,
    revokedSessionCount: 2,
    skippedSessionCount: 1,
    revokedCurrentSession: true,
  });

  const sessionRepo = dataSource.getRepository(CloudAdminSessionEntity);
  const persistedCurrent = await sessionRepo.findOneByOrFail({
    id: currentSession.id,
  });
  const persistedWatchSibling = await sessionRepo.findOneByOrFail({
    id: activeWatchSibling.id,
  });
  const persistedExpiredWatch = await sessionRepo.findOneByOrFail({
    id: expiredWatchSibling.id,
  });
  const persistedCriticalReuse = await sessionRepo.findOneByOrFail({
    id: criticalReuseSession.id,
  });
  const persistedNormal = await sessionRepo.findOneByOrFail({
    id: normalSession.id,
  });

  assert.equal(persistedCurrent.revocationReason, "manual-revocation");
  assert.equal(
    persistedCurrent.revokedBySessionId,
    currentSession.id,
  );
  assert.equal(persistedWatchSibling.revocationReason, "manual-revocation");
  assert.equal(
    persistedWatchSibling.revokedBySessionId,
    currentSession.id,
  );
  assert.equal(persistedExpiredWatch.revokedAt, null);
  assert.equal(
    persistedCriticalReuse.revocationReason,
    "refresh-token-reuse",
  );
  assert.equal(persistedNormal.revokedAt, null);
});

test("ListAdminSessionsQueryDto transforms valid admin session query strings", () => {
  const query = plainToInstance(ListAdminSessionsQueryDto, {
    status: "revoked",
    revocationReason: "manual-revocation",
    currentOnly: "true",
    query: " Browser Session ",
    sourceKey: " encoded-source-key ",
    sortBy: "expiresAt",
    sortDirection: "asc",
    page: "3",
    pageSize: "20",
  });
  const errors = validateSync(query);

  assert.deepEqual(errors, []);
  assert.equal(query.status, "revoked");
  assert.equal(query.revocationReason, "manual-revocation");
  assert.equal(query.currentOnly, true);
  assert.equal(query.query, "Browser Session");
  assert.equal(query.sourceKey, "encoded-source-key");
  assert.equal(query.sortBy, "expiresAt");
  assert.equal(query.sortDirection, "asc");
  assert.equal(query.page, 3);
  assert.equal(query.pageSize, 20);
});

test("ListWaitingSessionSyncTasksQueryDto transforms valid task filters", () => {
  const query = plainToInstance(ListWaitingSessionSyncTasksQueryDto, {
    status: "failed",
    taskType: "refresh_world",
    query: " retry world ",
    page: "2",
    pageSize: "10",
  });
  const errors = validateSync(query);

  assert.deepEqual(errors, []);
  assert.equal(query.status, "failed");
  assert.equal(query.taskType, "refresh_world");
  assert.equal(query.query, "retry world");
  assert.equal(query.page, 2);
  assert.equal(query.pageSize, 10);
});

test("ListJobsQueryDto transforms valid lifecycle job filters", () => {
  const query = plainToInstance(ListJobsQueryDto, {
    worldId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    status: "pending",
    jobType: "resume",
    provider: " manual-docker ",
    queueState: " delayed ",
    audit: " superseded ",
    supersededBy: " suspend ",
    query: " queued retry ",
  });
  const errors = validateSync(query);

  assert.deepEqual(errors, []);
  assert.equal(query.worldId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assert.equal(query.status, "pending");
  assert.equal(query.jobType, "resume");
  assert.equal(query.provider, "manual-docker");
  assert.equal(query.queueState, "delayed");
  assert.equal(query.audit, "superseded");
  assert.equal(query.supersededBy, "suspend");
  assert.equal(query.query, "queued retry");
});

test("MutateFailedWaitingSessionSyncTasksDto transforms valid task ids", () => {
  const body = plainToInstance(MutateFailedWaitingSessionSyncTasksDto, {
    taskIds: [
      " aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa ",
      " bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb ",
    ],
  });
  const errors = validateSync(body);

  assert.deepEqual(errors, []);
  assert.deepEqual(body.taskIds, [
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  ]);
});

test("MutateFilteredFailedWaitingSessionSyncTasksDto transforms valid task filters", () => {
  const body = plainToInstance(MutateFilteredFailedWaitingSessionSyncTasksDto, {
    taskType: "refresh_world",
    query: " filtered retry ",
  });
  const errors = validateSync(body);

  assert.deepEqual(errors, []);
  assert.equal(body.taskType, "refresh_world");
  assert.equal(body.query, "filtered retry");
});

test("ListAdminSessionsQueryDto rejects unknown admin session sort parameters", () => {
  const query = plainToInstance(ListAdminSessionsQueryDto, {
    sortBy: "priority",
    sortDirection: "sideways",
  });
  const errors = validateSync(query);

  assert.equal(errors.length, 2);
  assert.deepEqual(
    errors.map((error) => error.property).sort(),
    ["sortBy", "sortDirection"],
  );
});

test("ListAdminSessionSourceGroupsQueryDto transforms valid source-group filters", () => {
  const query = plainToInstance(ListAdminSessionSourceGroupsQueryDto, {
    status: "active",
    revocationReason: "manual-revocation",
    currentOnly: "true",
    query: " Grouped Browser ",
    sourceKey: " encoded-source-key ",
    riskLevel: "watch",
    sortBy: "latestLastUsedAt",
    sortDirection: "asc",
    page: "2",
    pageSize: "12",
  });
  const errors = validateSync(query);

  assert.deepEqual(errors, []);
  assert.equal(query.status, "active");
  assert.equal(query.revocationReason, "manual-revocation");
  assert.equal(query.currentOnly, true);
  assert.equal(query.query, "Grouped Browser");
  assert.equal(query.sourceKey, "encoded-source-key");
  assert.equal(query.riskLevel, "watch");
  assert.equal(query.sortBy, "latestLastUsedAt");
  assert.equal(query.sortDirection, "asc");
  assert.equal(query.page, 2);
  assert.equal(query.pageSize, 12);
});

test("RevokeFilteredAdminSessionsDto transforms valid admin session filter strings", () => {
  const body = plainToInstance(RevokeFilteredAdminSessionsDto, {
    status: "active",
    revocationReason: "manual-revocation",
    currentOnly: "true",
    query: " Browser Session ",
    sourceKey: " encoded-source-key ",
  });
  const errors = validateSync(body);

  assert.deepEqual(errors, []);
  assert.equal(body.status, "active");
  assert.equal(body.revocationReason, "manual-revocation");
  assert.equal(body.currentOnly, true);
  assert.equal(body.query, "Browser Session");
  assert.equal(body.sourceKey, "encoded-source-key");
});

test("RevokeAdminSessionSourceGroupDto transforms valid source-group revoke payloads", () => {
  const body = plainToInstance(RevokeAdminSessionSourceGroupDto, {
    sourceKey: " encoded-source-key ",
    status: "active",
    currentOnly: "true",
    query: " Source Group Browser ",
  });
  const errors = validateSync(body);

  assert.deepEqual(errors, []);
  assert.equal(body.sourceKey, "encoded-source-key");
  assert.equal(body.status, "active");
  assert.equal(body.currentOnly, true);
  assert.equal(body.query, "Source Group Browser");
});

test("CreateAdminSessionSourceGroupSnapshotDto transforms valid snapshot payloads", () => {
  const body = plainToInstance(CreateAdminSessionSourceGroupSnapshotDto, {
    sourceKey: " encoded-source-key ",
    status: "active",
    query: " Snapshot Source Browser ",
  });
  const errors = validateSync(body);

  assert.deepEqual(errors, []);
  assert.equal(body.sourceKey, "encoded-source-key");
  assert.equal(body.status, "active");
  assert.equal(body.query, "Snapshot Source Browser");
});

test("CreateAdminSessionSourceGroupRiskSnapshotDto transforms valid risk snapshot payloads", () => {
  const body = plainToInstance(CreateAdminSessionSourceGroupRiskSnapshotDto, {
    status: "active",
    currentOnly: "true",
    query: " Risk Snapshot Browser ",
    sourceKey: " encoded-source-key ",
    riskLevel: "watch",
  });
  const errors = validateSync(body);

  assert.deepEqual(errors, []);
  assert.equal(body.status, "active");
  assert.equal(body.currentOnly, true);
  assert.equal(body.query, "Risk Snapshot Browser");
  assert.equal(body.sourceKey, "encoded-source-key");
  assert.equal(body.riskLevel, "watch");
});

test("RevokeAdminSessionSourceGroupsByRiskDto transforms valid risk-based source-group revoke payloads", () => {
  const body = plainToInstance(RevokeAdminSessionSourceGroupsByRiskDto, {
    status: "active",
    currentOnly: "true",
    query: " Source Group Browser ",
    riskLevel: "critical",
  });
  const errors = validateSync(body);

  assert.deepEqual(errors, []);
  assert.equal(body.status, "active");
  assert.equal(body.currentOnly, true);
  assert.equal(body.query, "Source Group Browser");
  assert.equal(body.riskLevel, "critical");
});

test("AdminCloudController forwards admin session list filters and current session id", async () => {
  const calls: Array<{
    currentSessionId: string | null | undefined;
    query: Record<string, unknown>;
  }> = [];
  const expectedResponse = {
    items: [],
    total: 0,
    page: 2,
    pageSize: 20,
    totalPages: 1,
  };
  const controller = new AdminCloudController(
    {} as CloudService,
    {
      listSessions: async (
        currentSessionId: string | null | undefined,
        query: Record<string, unknown>,
      ) => {
        calls.push({ currentSessionId, query });
        return expectedResponse;
      },
    } as never,
  );

  const result = await controller.listAdminSessions(
    {
      cloudAdminSessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    } as never,
    {
      status: "active",
      revocationReason: "logout",
      currentOnly: true,
      query: "Browser Session",
      sourceKey: "encoded-source-key",
      sortBy: "lastUsedAt",
      sortDirection: "desc",
      page: 2,
      pageSize: 20,
    },
  );

  assert.deepEqual(result, expectedResponse);
  assert.deepEqual(calls, [
    {
      currentSessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      query: {
        status: "active",
        revocationReason: "logout",
        currentOnly: true,
        query: "Browser Session",
        sourceKey: "encoded-source-key",
        sortBy: "lastUsedAt",
        sortDirection: "desc",
        page: 2,
        pageSize: 20,
      },
    },
  ]);
});

test("AdminCloudController forwards waiting session sync task filters", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const expectedResponse = {
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  };
  const controller = new AdminCloudController(
    {
      listWaitingSessionSyncTasks: async (query: Record<string, unknown>) => {
        calls.push(query);
        return expectedResponse;
      },
    } as never,
    {} as never,
  );

  const result = await controller.listWaitingSessionSyncTasks({
    status: "failed",
    taskType: "refresh_world",
    query: "retry",
    page: 2,
    pageSize: 10,
  });

  assert.deepEqual(result, expectedResponse);
  assert.deepEqual(calls, [
    {
      status: "failed",
      taskType: "refresh_world",
      query: "retry",
      page: 2,
      pageSize: 10,
    },
  ]);
});

test("AdminCloudController forwards lifecycle job filters", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const expectedResponse = [];
  const controller = new AdminCloudController(
    {
      listJobs: async (query: Record<string, unknown>) => {
        calls.push(query);
        return expectedResponse;
      },
    } as never,
    {} as never,
  );

  const result = await controller.listJobs({
    worldId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    status: "pending",
    jobType: "resume",
    provider: "manual-docker",
    queueState: "delayed",
    audit: "superseded",
    supersededBy: "suspend",
    query: "retry",
  });

  assert.deepEqual(result, expectedResponse);
  assert.deepEqual(calls, [
    {
      worldId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status: "pending",
      jobType: "resume",
      provider: "manual-docker",
      queueState: "delayed",
      audit: "superseded",
      supersededBy: "suspend",
      query: "retry",
    },
  ]);
});

test("AdminCloudController forwards waiting session sync task replay ids", async () => {
  const calls: string[][] = [];
  const expectedResponse = {
    success: true,
    replayedTaskIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    skippedTaskIds: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
  };
  const controller = new AdminCloudController(
    {
      replayFailedWaitingSessionSyncTasks: async (taskIds: string[]) => {
        calls.push(taskIds);
        return expectedResponse;
      },
    } as never,
    {} as never,
  );

  const result = await controller.replayFailedWaitingSessionSyncTasks({
    taskIds: [
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    ],
  });

  assert.deepEqual(result, expectedResponse);
  assert.deepEqual(calls, [
    [
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    ],
  ]);
});

test("AdminCloudController forwards waiting session sync task clear ids", async () => {
  const calls: string[][] = [];
  const expectedResponse = {
    success: true,
    clearedTaskIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    skippedTaskIds: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
  };
  const controller = new AdminCloudController(
    {
      clearFailedWaitingSessionSyncTasks: async (taskIds: string[]) => {
        calls.push(taskIds);
        return expectedResponse;
      },
    } as never,
    {} as never,
  );

  const result = await controller.clearFailedWaitingSessionSyncTasks({
    taskIds: [
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    ],
  });

  assert.deepEqual(result, expectedResponse);
  assert.deepEqual(calls, [
    [
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    ],
  ]);
});

test("AdminCloudController forwards filtered waiting session sync task replay filters", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const expectedResponse = {
    success: true,
    matchedCount: 2,
    replayedCount: 1,
    skippedCount: 1,
  };
  const controller = new AdminCloudController(
    {
      replayFilteredFailedWaitingSessionSyncTasks: async (
        filter: Record<string, unknown>,
      ) => {
        calls.push(filter);
        return expectedResponse;
      },
    } as never,
    {} as never,
  );

  const result = await controller.replayFilteredFailedWaitingSessionSyncTasks({
    taskType: "refresh_world",
    query: "retry batch",
  });

  assert.deepEqual(result, expectedResponse);
  assert.deepEqual(calls, [
    {
      taskType: "refresh_world",
      query: "retry batch",
    },
  ]);
});

test("AdminCloudController forwards filtered waiting session sync task clear filters", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const expectedResponse = {
    success: true,
    matchedCount: 2,
    clearedCount: 1,
    skippedCount: 1,
  };
  const controller = new AdminCloudController(
    {
      clearFilteredFailedWaitingSessionSyncTasks: async (
        filter: Record<string, unknown>,
      ) => {
        calls.push(filter);
        return expectedResponse;
      },
    } as never,
    {} as never,
  );

  const result = await controller.clearFilteredFailedWaitingSessionSyncTasks({
    taskType: "refresh_world",
    query: "clear batch",
  });

  assert.deepEqual(result, expectedResponse);
  assert.deepEqual(calls, [
    {
      taskType: "refresh_world",
      query: "clear batch",
    },
  ]);
});

test("AdminCloudController forwards revoke requests with the acting session id", async () => {
  const calls: Array<{
    sessionId: string;
    revokedBySessionId: string | null | undefined;
  }> = [];
  const expectedResponse = { success: true };
  const controller = new AdminCloudController(
    {} as CloudService,
    {
      revokeSessionById: async (
        sessionId: string,
        revokedBySessionId: string | null | undefined,
      ) => {
        calls.push({ sessionId, revokedBySessionId });
        return expectedResponse;
      },
    } as never,
  );

  const result = await controller.revokeAdminSessionById(
    "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    {
      cloudAdminSessionId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    } as never,
  );

  assert.deepEqual(result, expectedResponse);
  assert.deepEqual(calls, [
    {
      sessionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      revokedBySessionId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    },
  ]);
});

test("AdminCloudController forwards filtered revoke requests with the acting session id", async () => {
  const calls: Array<{
    currentSessionId: string | null | undefined;
    filter: Record<string, unknown>;
  }> = [];
  const expectedResponse = {
    success: true,
    revokedCount: 1,
    skippedCount: 0,
    revokedCurrentSession: false,
  };
  const controller = new AdminCloudController(
    {} as CloudService,
    {
      revokeFilteredSessions: async (
        currentSessionId: string | null | undefined,
        filter: Record<string, unknown>,
      ) => {
        calls.push({ currentSessionId, filter });
        return expectedResponse;
      },
    } as never,
  );

  const result = await controller.revokeFilteredAdminSessions(
    {
      status: "active",
      revocationReason: "manual-revocation",
      currentOnly: true,
      query: "Browser Session",
      sourceKey: "encoded-source-key",
    },
    {
      cloudAdminSessionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    } as never,
  );

  assert.deepEqual(result, expectedResponse);
  assert.deepEqual(calls, [
    {
      currentSessionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      filter: {
        status: "active",
        revocationReason: "manual-revocation",
        currentOnly: true,
        query: "Browser Session",
        sourceKey: "encoded-source-key",
      },
    },
  ]);
});

test("AdminCloudController forwards source-group list filters and current session id", async () => {
  const calls: Array<{
    currentSessionId: string | null | undefined;
    query: Record<string, unknown>;
  }> = [];
  const expectedResponse = {
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  };
  const controller = new AdminCloudController(
    {} as CloudService,
    {
      listSessionSourceGroups: async (
        currentSessionId: string | null | undefined,
        query: Record<string, unknown>,
      ) => {
        calls.push({ currentSessionId, query });
        return expectedResponse;
      },
    } as never,
  );

  const result = await controller.listAdminSessionSourceGroups(
    {
      cloudAdminSessionId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    } as never,
    {
      status: "active",
      revocationReason: "manual-revocation",
      currentOnly: true,
      query: "Grouped Browser",
      sourceKey: "encoded-source-key",
      riskLevel: "watch",
      sortBy: "latestLastUsedAt",
      sortDirection: "asc",
      page: 2,
      pageSize: 12,
    },
  );

  assert.deepEqual(result, expectedResponse);
  assert.deepEqual(calls, [
    {
      currentSessionId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      query: {
        status: "active",
        revocationReason: "manual-revocation",
        currentOnly: true,
        query: "Grouped Browser",
        sourceKey: "encoded-source-key",
        riskLevel: "watch",
        sortBy: "latestLastUsedAt",
        sortDirection: "asc",
        page: 2,
        pageSize: 12,
      },
    },
  ]);
});

test("AdminCloudController forwards source-group revoke requests with the acting session id", async () => {
  const calls: Array<{
    currentSessionId: string | null | undefined;
    request: Record<string, unknown>;
  }> = [];
  const expectedResponse = {
    success: true,
    revokedCount: 2,
    skippedCount: 0,
    revokedCurrentSession: false,
  };
  const controller = new AdminCloudController(
    {} as CloudService,
    {
      revokeSessionSourceGroup: async (
        currentSessionId: string | null | undefined,
        request: Record<string, unknown>,
      ) => {
        calls.push({ currentSessionId, request });
        return expectedResponse;
      },
    } as never,
  );

  const result = await controller.revokeAdminSessionSourceGroup(
    {
      sourceKey: "encoded-source-key",
      status: "active",
      revocationReason: "manual-revocation",
      currentOnly: true,
      query: "Source Group Browser",
    },
    {
      cloudAdminSessionId: "abababab-abab-4aba-8aba-abababababab",
    } as never,
  );

  assert.deepEqual(result, expectedResponse);
  assert.deepEqual(calls, [
    {
      currentSessionId: "abababab-abab-4aba-8aba-abababababab",
      request: {
        sourceKey: "encoded-source-key",
        status: "active",
        revocationReason: "manual-revocation",
        currentOnly: true,
        query: "Source Group Browser",
      },
    },
  ]);
});

test("AdminCloudController forwards risk-based source-group revoke requests with the acting session id", async () => {
  const calls: Array<{
    currentSessionId: string | null | undefined;
    request: Record<string, unknown>;
  }> = [];
  const expectedResponse = {
    success: true,
    matchedGroupCount: 1,
    revokedGroupCount: 1,
    revokedSessionCount: 2,
    skippedSessionCount: 0,
    revokedCurrentSession: false,
  };
  const controller = new AdminCloudController(
    {} as CloudService,
    {
      revokeSessionSourceGroupsByRisk: async (
        currentSessionId: string | null | undefined,
        request: Record<string, unknown>,
      ) => {
        calls.push({ currentSessionId, request });
        return expectedResponse;
      },
    } as never,
  );

  const result = await controller.revokeAdminSessionSourceGroupsByRisk(
    {
      status: "active",
      currentOnly: true,
      query: "Risk Browser",
      sourceKey: "encoded-source-key",
      riskLevel: "critical",
    },
    {
      cloudAdminSessionId: "acacacac-acac-4aca-8aca-acacacacacac",
    } as never,
  );

  assert.deepEqual(result, expectedResponse);
  assert.deepEqual(calls, [
    {
      currentSessionId: "acacacac-acac-4aca-8aca-acacacacacac",
      request: {
        status: "active",
        revocationReason: undefined,
        currentOnly: true,
        query: "Risk Browser",
        sourceKey: "encoded-source-key",
        riskLevel: "critical",
      },
    },
  ]);
});

test("AdminCloudController forwards source-group snapshot requests with the acting session id", async () => {
  const calls: Array<{
    currentSessionId: string | null | undefined;
    request: Record<string, unknown>;
  }> = [];
  const expectedResponse = {
    generatedAt: "2026-04-20T02:00:00.000Z",
    filters: {
      sourceKey: "encoded-source-key",
    },
    group: {
      sourceKey: "encoded-source-key",
      issuedFromIp: "203.0.113.150",
      issuedUserAgent: "Snapshot Source Browser",
      totalSessions: 1,
      activeSessions: 1,
      expiredSessions: 0,
      revokedSessions: 0,
      refreshTokenReuseRevocations: 0,
      currentSessions: 0,
      riskLevel: "normal",
      riskSignals: [],
      latestCreatedAt: "2026-04-20T01:00:00.000Z",
      latestLastUsedAt: "2026-04-20T01:05:00.000Z",
      latestRevokedAt: null,
    },
    sessions: [],
  };
  const controller = new AdminCloudController(
    {} as CloudService,
    {
      createSessionSourceGroupSnapshot: async (
        currentSessionId: string | null | undefined,
        request: Record<string, unknown>,
      ) => {
        calls.push({ currentSessionId, request });
        return expectedResponse;
      },
    } as never,
  );

  const result = await controller.createAdminSessionSourceGroupSnapshot(
    {
      sourceKey: "encoded-source-key",
      status: "active",
      query: "Snapshot Source Browser",
    },
    {
      cloudAdminSessionId: "bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc",
    } as never,
  );

  assert.deepEqual(result, expectedResponse);
  assert.deepEqual(calls, [
    {
      currentSessionId: "bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc",
      request: {
        sourceKey: "encoded-source-key",
        status: "active",
        revocationReason: undefined,
        currentOnly: undefined,
        query: "Snapshot Source Browser",
      },
    },
  ]);
});

test("AdminCloudController forwards source-group risk snapshot requests with the acting session id", async () => {
  const calls: Array<{
    currentSessionId: string | null | undefined;
    request: Record<string, unknown>;
  }> = [];
  const expectedResponse = {
    generatedAt: "2026-04-20T02:05:00.000Z",
    filters: {
      status: "active",
      riskLevel: "critical",
    },
    totalGroups: 1,
    totalSessions: 2,
    groups: [],
    sessions: [],
  };
  const controller = new AdminCloudController(
    {} as CloudService,
    {
      createSessionSourceGroupRiskSnapshot: async (
        currentSessionId: string | null | undefined,
        request: Record<string, unknown>,
      ) => {
        calls.push({ currentSessionId, request });
        return expectedResponse;
      },
    } as never,
  );

  const result = await controller.createAdminSessionSourceGroupRiskSnapshot(
    {
      status: "active",
      currentOnly: true,
      query: "Risk Snapshot Browser",
      sourceKey: "encoded-source-key",
      riskLevel: "critical",
    },
    {
      cloudAdminSessionId: "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd",
    } as never,
  );

  assert.deepEqual(result, expectedResponse);
  assert.deepEqual(calls, [
    {
      currentSessionId: "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd",
      request: {
        status: "active",
        revocationReason: undefined,
        currentOnly: true,
        query: "Risk Snapshot Browser",
        sourceKey: "encoded-source-key",
        riskLevel: "critical",
      },
    },
  ]);
});

test("reconcileWorldNow keeps world state updates when waiting session refresh falls back to retry", async (t) => {
  const dataSource = await createTestDataSource();
  let refreshCalls = 0;
  const waitingSessionSyncService = createWaitingSessionSyncService(
    dataSource,
    {
      refreshWaitingSessionsForWorld: async () => {
        refreshCalls += 1;
        throw new Error("refresh failed");
      },
      refreshWaitingSessionsForPhone: async () => undefined,
      invalidateWaitingSessionsForPhone: async () => undefined,
    },
    {
      CLOUD_WAITING_SESSION_SYNC_RETRY_ATTEMPTS: "2",
      CLOUD_WAITING_SESSION_SYNC_RETRY_DELAY_MS: "0",
    },
  );
  t.after(async () => {
    waitingSessionSyncService.onModuleDestroy();
    await dataSource.destroy();
  });

  const worker = createWorkerService(
    dataSource,
    {
      CLOUD_WORLD_JOB_LEASE_SECONDS: "120",
    },
    {
      waitingSessionSyncService,
    },
  );
  const worldRepo = dataSource.getRepository(CloudWorldEntity);
  const jobRepo = dataSource.getRepository(WorldLifecycleJobEntity);

  const world = await worldRepo.save(
    worldRepo.create({
      phone: "+8613800138088",
      name: "Reconcile Retry World",
      status: "ready",
      slug: "world-8088-reconcile-retry",
      desiredState: "running",
      provisionStrategy: "manual-docker",
      providerKey: providerSummary.key,
      providerRegion: "manual",
      providerZone: "docker-host-a",
      runtimeVersion: "runtime-v1",
      apiBaseUrl: "https://reconcile-retry-world.example.com",
      adminUrl: "https://reconcile-retry-world-admin.example.com",
      callbackToken: "reconcile-retry-token",
      healthStatus: "healthy",
      healthMessage: "ready",
      lastAccessedAt: null,
      lastInteractiveAt: null,
      lastBootedAt: null,
      lastHeartbeatAt: null,
      lastSuspendedAt: null,
      failureCode: null,
      failureMessage: null,
      retryCount: 0,
      note: null,
    }),
  );

  const reconciled = await worker.reconcileWorldNow(world.id);

  assert.ok(reconciled);
  assert.equal(reconciled.status, "queued");
  assert.equal(reconciled.healthStatus, "queued");
  assert.match(reconciled.healthMessage ?? "", /Queued recovery\./);
  const queuedJob = await jobRepo.findOne({
    where: {
      worldId: world.id,
      jobType: "provision",
      status: "pending",
    },
  });
  assert.ok(queuedJob);

  await waitForCondition(() => refreshCalls >= 2);
});

test("claimNextPendingJob acquires a lease and marks the job running once", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const worker = createWorkerService(dataSource, {
    CLOUD_WORLD_JOB_LEASE_SECONDS: "120",
  });
  const jobRepo = dataSource.getRepository(WorldLifecycleJobEntity);

  const queuedJob = await jobRepo.save(
    jobRepo.create({
      worldId: "world-1",
      jobType: "resume",
      status: "pending",
      priority: 50,
      payload: { source: "test" },
      attempt: 0,
      maxAttempts: 5,
      leaseOwner: null,
      leaseExpiresAt: null,
      availableAt: new Date(Date.now() - 1_000),
      startedAt: null,
      finishedAt: null,
      failureCode: "old_code",
      failureMessage: "old_message",
      resultPayload: { stale: true },
    }),
  );

  const claimNextPendingJob = getPrivateMethod<
    [],
    Promise<WorldLifecycleJobEntity | null>
  >(worker, "claimNextPendingJob");
  const claimed = await claimNextPendingJob.call(worker);
  assert.ok(claimed);
  assert.equal(claimed.id, queuedJob.id);
  assert.equal(claimed.status, "running");
  assert.equal(claimed.attempt, 1);
  assert.ok(claimed.leaseOwner);
  assert.ok(claimed.leaseExpiresAt instanceof Date);

  const persisted = await jobRepo.findOneByOrFail({ id: queuedJob.id });
  assert.equal(persisted.status, "running");
  assert.equal(persisted.attempt, 1);
  assert.equal(persisted.availableAt, null);
  assert.equal(persisted.failureCode, null);
  assert.equal(persisted.failureMessage, null);
  assert.equal(persisted.resultPayload, null);

  const secondWorker = createWorkerService(dataSource, {
    CLOUD_WORLD_JOB_LEASE_SECONDS: "120",
  });
  const secondClaim = await claimNextPendingJob.call(secondWorker);
  assert.equal(secondClaim, null);
});

test("ensureLifecycleJob deduplicates concurrent enqueues for the same world and job type", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  await dataSource.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_world_lifecycle_jobs_active_world" ON "world_lifecycle_jobs" ("worldId") WHERE "status" IN ('pending', 'running') AND "jobType" IN ('provision', 'resume', 'suspend')`,
  );

  const service = createCloudService(dataSource);
  const jobRepo = dataSource.getRepository(WorldLifecycleJobEntity);
  const originalFindOne = jobRepo.findOne.bind(jobRepo);
  let forcedMisses = 0;

  jobRepo.findOne = (async (...args) => {
    if (forcedMisses < 2) {
      forcedMisses += 1;
      await new Promise((resolve) => setTimeout(resolve, 0));
      return null;
    }

    return originalFindOne(...args);
  }) as typeof jobRepo.findOne;

  const ensureLifecycleJob = getPrivateMethod<
    [string, WorldLifecycleJobType, Record<string, unknown>],
    Promise<WorldLifecycleJobEntity>
  >(service, "ensureLifecycleJob");

  const [firstJob, secondJob] = await Promise.all([
    ensureLifecycleJob.call(service, "world-dedup", "resume", {
      source: "test-a",
    }),
    ensureLifecycleJob.call(service, "world-dedup", "resume", {
      source: "test-b",
    }),
  ]);

  assert.equal(firstJob.id, secondJob.id);

  const persistedJobs = await jobRepo.find({
    where: {
      worldId: "world-dedup",
      jobType: "resume",
    },
  });
  assert.equal(persistedJobs.length, 1);
  assert.equal(persistedJobs[0]?.status, "pending");
  assert.equal(persistedJobs[0]?.attempt, 0);
});

test("ensureLifecycleJob replaces conflicting pending jobs for the same world", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  await dataSource.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_world_lifecycle_jobs_active_world" ON "world_lifecycle_jobs" ("worldId") WHERE "status" IN ('pending', 'running') AND "jobType" IN ('provision', 'resume', 'suspend')`,
  );

  const service = createCloudService(dataSource);
  const jobRepo = dataSource.getRepository(WorldLifecycleJobEntity);
  const stalePendingSuspend = await jobRepo.save(
    jobRepo.create({
      worldId: "world-replace-pending",
      jobType: "suspend",
      status: "pending",
      priority: 80,
      payload: { source: "stale-suspend" },
      attempt: 0,
      maxAttempts: 3,
      leaseOwner: null,
      leaseExpiresAt: null,
      availableAt: new Date(Date.now() - 1_000),
      startedAt: null,
      finishedAt: null,
      failureCode: null,
      failureMessage: null,
      resultPayload: null,
    }),
  );

  const ensureLifecycleJob = getPrivateMethod<
    [string, WorldLifecycleJobType, Record<string, unknown>],
    Promise<WorldLifecycleJobEntity>
  >(service, "ensureLifecycleJob");
  const replacementJob = await ensureLifecycleJob.call(
    service,
    "world-replace-pending",
    "resume",
    { source: "resume-request" },
  );

  assert.equal(replacementJob.jobType, "resume");

  const persistedJobs = await jobRepo.find({
    where: {
      worldId: "world-replace-pending",
    },
  });
  assert.equal(persistedJobs.length, 2);
  const persistedReplacementJob = persistedJobs.find(
    (job) => job.id === replacementJob.id,
  );
  assert.ok(persistedReplacementJob);
  assert.equal(persistedReplacementJob.jobType, "resume");
  assert.equal(persistedReplacementJob.status, "pending");

  const cancelledPendingSuspend = await jobRepo.findOne({
    where: { id: stalePendingSuspend.id },
  });
  assert.ok(cancelledPendingSuspend);
  assert.equal(cancelledPendingSuspend.status, "cancelled");
  assert.equal(
    cancelledPendingSuspend.failureCode,
    "superseded_by_new_job",
  );
  assert.match(
    cancelledPendingSuspend.failureMessage ?? "",
    /superseded by a newer resume request/i,
  );
  assert.ok(cancelledPendingSuspend.finishedAt instanceof Date);
  assert.deepEqual(cancelledPendingSuspend.resultPayload, {
    action: "superseded_by_new_job",
    supersededByJobType: "resume",
    supersededByPayload: {
      source: "resume-request",
    },
    previousJobType: "suspend",
  });
});

test("ensureLifecycleJob keeps a conflicting running job in place for the same world", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  await dataSource.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_world_lifecycle_jobs_active_world" ON "world_lifecycle_jobs" ("worldId") WHERE "status" IN ('pending', 'running') AND "jobType" IN ('provision', 'resume', 'suspend')`,
  );

  const service = createCloudService(dataSource);
  const jobRepo = dataSource.getRepository(WorldLifecycleJobEntity);
  const runningSuspend = await jobRepo.save(
    jobRepo.create({
      worldId: "world-running-conflict",
      jobType: "suspend",
      status: "running",
      priority: 80,
      payload: { source: "active-suspend" },
      attempt: 1,
      maxAttempts: 3,
      leaseOwner: "worker-running",
      leaseExpiresAt: new Date(Date.now() + 60_000),
      availableAt: null,
      startedAt: new Date(Date.now() - 5_000),
      finishedAt: null,
      failureCode: null,
      failureMessage: null,
      resultPayload: null,
    }),
  );

  const ensureLifecycleJob = getPrivateMethod<
    [string, WorldLifecycleJobType, Record<string, unknown>],
    Promise<WorldLifecycleJobEntity>
  >(service, "ensureLifecycleJob");
  const returnedJob = await ensureLifecycleJob.call(
    service,
    "world-running-conflict",
    "resume",
    { source: "resume-request" },
  );

  assert.equal(returnedJob.id, runningSuspend.id);
  assert.equal(returnedJob.jobType, "suspend");

  const persistedJobs = await jobRepo.find({
    where: {
      worldId: "world-running-conflict",
    },
  });
  assert.equal(persistedJobs.length, 1);
  assert.equal(persistedJobs[0]?.id, runningSuspend.id);
  assert.equal(persistedJobs[0]?.jobType, "suspend");
});

test("claimNextPendingJob skips pending jobs that already exhausted retries", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const worker = createWorkerService(dataSource, {
    CLOUD_WORLD_JOB_LEASE_SECONDS: "120",
  });
  const jobRepo = dataSource.getRepository(WorldLifecycleJobEntity);

  const exhaustedJob = await jobRepo.save(
    jobRepo.create({
      worldId: "world-exhausted",
      jobType: "resume",
      status: "pending",
      priority: 10,
      payload: { source: "stale-job" },
      attempt: 3,
      maxAttempts: 3,
      leaseOwner: null,
      leaseExpiresAt: null,
      availableAt: new Date(Date.now() - 1_000),
      startedAt: null,
      finishedAt: null,
      failureCode: "lease_expired",
      failureMessage: "Should not run again.",
      resultPayload: null,
    }),
  );

  const claimableJob = await jobRepo.save(
    jobRepo.create({
      worldId: "world-claimable",
      jobType: "resume",
      status: "pending",
      priority: 20,
      payload: { source: "fresh-job" },
      attempt: 2,
      maxAttempts: 3,
      leaseOwner: null,
      leaseExpiresAt: null,
      availableAt: new Date(Date.now() - 1_000),
      startedAt: null,
      finishedAt: null,
      failureCode: null,
      failureMessage: null,
      resultPayload: null,
    }),
  );

  const claimNextPendingJob = getPrivateMethod<
    [],
    Promise<WorldLifecycleJobEntity | null>
  >(worker, "claimNextPendingJob");
  const claimed = await claimNextPendingJob.call(worker);

  assert.ok(claimed);
  assert.equal(claimed.id, claimableJob.id);
  assert.equal(claimed.attempt, 3);

  const persistedExhaustedJob = await jobRepo.findOneByOrFail({ id: exhaustedJob.id });
  assert.equal(persistedExhaustedJob.status, "pending");
  assert.equal(persistedExhaustedJob.attempt, 3);
  assert.equal(persistedExhaustedJob.leaseOwner, null);

  const persistedClaimedJob = await jobRepo.findOneByOrFail({ id: claimableJob.id });
  assert.equal(persistedClaimedJob.status, "running");
  assert.equal(persistedClaimedJob.attempt, 3);
});

test("claimNextPendingJob skips pending jobs whose world already has a leased running job", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const worker = createWorkerService(dataSource, {
    CLOUD_WORLD_JOB_LEASE_SECONDS: "120",
  });
  const jobRepo = dataSource.getRepository(WorldLifecycleJobEntity);

  const runningSibling = await jobRepo.save(
    jobRepo.create({
      worldId: "world-blocked",
      jobType: "resume",
      status: "running",
      priority: 50,
      payload: { source: "active-worker" },
      attempt: 1,
      maxAttempts: 5,
      leaseOwner: "worker-active",
      leaseExpiresAt: new Date(Date.now() + 60_000),
      availableAt: null,
      startedAt: new Date(Date.now() - 5_000),
      finishedAt: null,
      failureCode: null,
      failureMessage: null,
      resultPayload: null,
    }),
  );

  const blockedPendingJob = await jobRepo.save(
    jobRepo.create({
      worldId: "world-blocked",
      jobType: "suspend",
      status: "pending",
      priority: 10,
      payload: { source: "should-wait" },
      attempt: 0,
      maxAttempts: 3,
      leaseOwner: null,
      leaseExpiresAt: null,
      availableAt: new Date(Date.now() - 1_000),
      startedAt: null,
      finishedAt: null,
      failureCode: null,
      failureMessage: null,
      resultPayload: null,
    }),
  );

  const claimableOtherWorldJob = await jobRepo.save(
    jobRepo.create({
      worldId: "world-claimable",
      jobType: "resume",
      status: "pending",
      priority: 20,
      payload: { source: "safe-world" },
      attempt: 0,
      maxAttempts: 5,
      leaseOwner: null,
      leaseExpiresAt: null,
      availableAt: new Date(Date.now() - 1_000),
      startedAt: null,
      finishedAt: null,
      failureCode: null,
      failureMessage: null,
      resultPayload: null,
    }),
  );

  const claimNextPendingJob = getPrivateMethod<
    [],
    Promise<WorldLifecycleJobEntity | null>
  >(worker, "claimNextPendingJob");
  const claimed = await claimNextPendingJob.call(worker);

  assert.ok(claimed);
  assert.equal(claimed.id, claimableOtherWorldJob.id);
  assert.equal(claimed.worldId, "world-claimable");

  const persistedBlockedJob = await jobRepo.findOneByOrFail({
    id: blockedPendingJob.id,
  });
  assert.equal(persistedBlockedJob.status, "pending");
  assert.equal(persistedBlockedJob.leaseOwner, null);
  assert.equal(persistedBlockedJob.attempt, 0);

  const persistedRunningSibling = await jobRepo.findOneByOrFail({
    id: runningSibling.id,
  });
  assert.equal(persistedRunningSibling.status, "running");
  assert.equal(persistedRunningSibling.leaseOwner, "worker-active");

  const secondWorker = createWorkerService(dataSource, {
    CLOUD_WORLD_JOB_LEASE_SECONDS: "120",
  });
  const secondClaim = await claimNextPendingJob.call(secondWorker);
  assert.equal(secondClaim, null);
});

test("recoverExpiredRunningJobs requeues stale running jobs", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const worker = createWorkerService(dataSource);
  const jobRepo = dataSource.getRepository(WorldLifecycleJobEntity);

  const runningJob = await jobRepo.save(
    jobRepo.create({
      worldId: "world-2",
      jobType: "provision",
      status: "running",
      priority: 100,
      payload: { source: "test" },
      attempt: 2,
      maxAttempts: 3,
      leaseOwner: "stale-worker",
      leaseExpiresAt: new Date(Date.now() - 60_000),
      availableAt: null,
      startedAt: new Date(Date.now() - 120_000),
      finishedAt: null,
      failureCode: null,
      failureMessage: null,
      resultPayload: null,
    }),
  );

  const recoverExpiredRunningJobs = getPrivateMethod<[], Promise<void>>(
    worker,
    "recoverExpiredRunningJobs",
  );
  await recoverExpiredRunningJobs.call(worker);

  const recovered = await jobRepo.findOneByOrFail({ id: runningJob.id });
  assert.equal(recovered.status, "pending");
  assert.equal(recovered.leaseOwner, null);
  assert.equal(recovered.leaseExpiresAt, null);
  assert.equal(recovered.startedAt, null);
  assert.equal(recovered.finishedAt, null);
  assert.ok(recovered.availableAt instanceof Date);
  assert.equal(recovered.failureCode, "lease_expired");
  assert.match(recovered.failureMessage ?? "", /re-queued/i);
});

test("recoverExpiredRunningJobs fails stale running jobs that already exhausted retries", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const worker = createWorkerService(dataSource);
  const worldRepo = dataSource.getRepository(CloudWorldEntity);
  const instanceRepo = dataSource.getRepository(CloudInstanceEntity);
  const jobRepo = dataSource.getRepository(WorldLifecycleJobEntity);
  const startedAt = new Date(Date.now() - 120_000);

  const world = await worldRepo.save(
    worldRepo.create({
      phone: "+8613800138010",
      name: "Lease Expired World",
      status: "starting",
      slug: "world-8010-leasebug",
      desiredState: "running",
      provisionStrategy: "manual-docker",
      providerKey: providerSummary.key,
      providerRegion: "manual",
      providerZone: "docker-host-a",
      runtimeVersion: "test-runtime",
      apiBaseUrl: "https://lease-expired.example.com",
      adminUrl: "https://lease-expired-admin.example.com",
      callbackToken: "token",
      healthStatus: "starting",
      healthMessage: "Waiting for resume.",
      lastAccessedAt: null,
      lastInteractiveAt: null,
      lastBootedAt: null,
      lastHeartbeatAt: null,
      lastSuspendedAt: null,
      failureCode: null,
      failureMessage: null,
      retryCount: 0,
      note: null,
    }),
  );

  await instanceRepo.save(
    instanceRepo.create({
      worldId: world.id,
      providerKey: providerSummary.key,
      providerInstanceId: "instance-lease-expired",
      providerVolumeId: null,
      providerSnapshotId: null,
      name: "lease-expired-instance",
      region: "manual",
      zone: "docker-host-a",
      privateIp: "10.0.0.10",
      publicIp: "198.51.100.10",
      powerState: "starting",
      imageId: null,
      flavor: null,
      diskSizeGb: 20,
      launchConfig: null,
      bootstrappedAt: null,
      lastHeartbeatAt: null,
      lastOperationAt: startedAt,
    }),
  );

  const runningJob = await jobRepo.save(
    jobRepo.create({
      worldId: world.id,
      jobType: "resume",
      status: "running",
      priority: 100,
      payload: { source: "test" },
      attempt: 3,
      maxAttempts: 3,
      leaseOwner: "stale-worker",
      leaseExpiresAt: new Date(Date.now() - 60_000),
      availableAt: null,
      startedAt,
      finishedAt: null,
      failureCode: null,
      failureMessage: null,
      resultPayload: null,
    }),
  );

  const recoverExpiredRunningJobs = getPrivateMethod<[], Promise<void>>(
    worker,
    "recoverExpiredRunningJobs",
  );
  await recoverExpiredRunningJobs.call(worker);

  const recoveredJob = await jobRepo.findOneByOrFail({ id: runningJob.id });
  assert.equal(recoveredJob.status, "failed");
  assert.equal(recoveredJob.leaseOwner, null);
  assert.equal(recoveredJob.leaseExpiresAt, null);
  assert.equal(recoveredJob.availableAt, null);
  assert.equal(recoveredJob.failureCode, "lease_expired");
  assert.match(recoveredJob.failureMessage ?? "", /retry limit/i);
  assert.equal(recoveredJob.startedAt?.toISOString(), startedAt.toISOString());
  assert.ok(recoveredJob.finishedAt instanceof Date);

  const failedWorld = await worldRepo.findOneByOrFail({ id: world.id });
  assert.equal(failedWorld.status, "failed");
  assert.equal(failedWorld.healthStatus, "failed");
  assert.equal(failedWorld.failureCode, "lease_expired");
  assert.match(failedWorld.failureMessage ?? "", /retry limit/i);
  assert.equal(failedWorld.retryCount, 1);

  const failedInstance = await instanceRepo.findOneByOrFail({ worldId: world.id });
  assert.equal(failedInstance.powerState, "error");

  const claimNextPendingJob = getPrivateMethod<
    [],
    Promise<WorldLifecycleJobEntity | null>
  >(worker, "claimNextPendingJob");
  const claimed = await claimNextPendingJob.call(worker);
  assert.equal(claimed, null);
});

test("listJobs exposes lease and scheduling metadata", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createCloudService(dataSource);
  const worldRepo = dataSource.getRepository(CloudWorldEntity);
  const jobRepo = dataSource.getRepository(WorldLifecycleJobEntity);
  const leaseExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
  const availableAt = new Date(Date.now() + 90 * 1000);
  const world = await worldRepo.save(
    worldRepo.create({
      phone: "+8613800138017",
      name: "Lease Metadata World",
      status: "ready",
      slug: "world-8017-lease",
      desiredState: "running",
      provisionStrategy: "manual-docker",
      providerKey: providerSummary.key,
      providerRegion: "manual",
      providerZone: "docker-host-a",
      runtimeVersion: "test-runtime",
      apiBaseUrl: "https://lease-world.example.com",
      adminUrl: "https://lease-world-admin.example.com",
      callbackToken: "token",
      healthStatus: "healthy",
      healthMessage: "World is ready.",
      lastAccessedAt: null,
      lastInteractiveAt: null,
      lastBootedAt: null,
      lastHeartbeatAt: null,
      lastSuspendedAt: null,
      failureCode: null,
      failureMessage: null,
      retryCount: 0,
      note: null,
    }),
  );

  await jobRepo.save(
    jobRepo.create({
      worldId: world.id,
      jobType: "resume",
      status: "running",
      priority: 50,
      payload: { source: "test" },
      attempt: 1,
      maxAttempts: 5,
      leaseOwner: "worker-a",
      leaseExpiresAt,
      availableAt,
      startedAt: new Date(Date.now() - 30_000),
      finishedAt: null,
      failureCode: null,
      failureMessage: null,
      resultPayload: null,
    }),
  );

  const jobs = await service.listJobs({
    worldId: world.id,
  });

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0]?.leaseOwner, "worker-a");
  assert.equal(jobs[0]?.leaseExpiresAt, leaseExpiresAt.toISOString());
  assert.equal(jobs[0]?.availableAt, availableAt.toISOString());
  assert.ok((jobs[0]?.leaseRemainingSeconds ?? 0) > 0);
  assert.ok((jobs[0]?.leaseRemainingSeconds ?? 9999) <= 5 * 60);
});

test("listJobs exposes superseded lifecycle audit metadata", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createCloudService(dataSource);
  const worldRepo = dataSource.getRepository(CloudWorldEntity);
  const jobRepo = dataSource.getRepository(WorldLifecycleJobEntity);
  const world = await worldRepo.save(
    worldRepo.create({
      phone: "+8613800138018",
      name: "Superseded Audit World",
      status: "ready",
      slug: "world-8018-superseded-audit",
      desiredState: "running",
      provisionStrategy: "manual-docker",
      providerKey: providerSummary.key,
      providerRegion: "manual",
      providerZone: "docker-host-a",
      runtimeVersion: "test-runtime",
      apiBaseUrl: "https://superseded-world.example.com",
      adminUrl: "https://superseded-world-admin.example.com",
      callbackToken: "token",
      healthStatus: "healthy",
      healthMessage: "World is ready.",
      lastAccessedAt: null,
      lastInteractiveAt: null,
      lastBootedAt: null,
      lastHeartbeatAt: null,
      lastSuspendedAt: null,
      failureCode: null,
      failureMessage: null,
      retryCount: 0,
      note: null,
    }),
  );

  await jobRepo.save(
    jobRepo.create({
      worldId: world.id,
      jobType: "suspend",
      status: "cancelled",
      priority: 100,
      payload: { source: "suspend-request" },
      attempt: 0,
      maxAttempts: 3,
      availableAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      startedAt: null,
      finishedAt: new Date(),
      failureCode: "superseded_by_new_job",
      failureMessage:
        "Pending suspend job was superseded by a newer resume request.",
      resultPayload: {
        action: "superseded_by_new_job",
        supersededByJobType: "resume",
        supersededByPayload: { source: "resume-request" },
        previousJobType: "suspend",
      },
    }),
  );

  const jobs = await service.listJobs({
    worldId: world.id,
  });

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0]?.failureCode, "superseded_by_new_job");
  assert.equal(jobs[0]?.supersededByJobType, "resume");
  assert.deepEqual(jobs[0]?.supersededByPayload, {
    source: "resume-request",
  });
  assert.deepEqual(jobs[0]?.resultPayload, {
    action: "superseded_by_new_job",
    supersededByJobType: "resume",
    supersededByPayload: { source: "resume-request" },
    previousJobType: "suspend",
  });
});

test("listJobs filters superseded lifecycle jobs by audit and superseding job type", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createCloudService(dataSource);
  const worldRepo = dataSource.getRepository(CloudWorldEntity);
  const jobRepo = dataSource.getRepository(WorldLifecycleJobEntity);
  const world = await worldRepo.save(
    worldRepo.create({
      phone: "+8613800138019",
      name: "Superseded Filter World",
      status: "ready",
      slug: "world-8019-superseded-filter",
      desiredState: "running",
      provisionStrategy: "manual-docker",
      providerKey: providerSummary.key,
      providerRegion: "manual",
      providerZone: "docker-host-a",
      runtimeVersion: "test-runtime",
      apiBaseUrl: "https://superseded-filter-world.example.com",
      adminUrl: "https://superseded-filter-world-admin.example.com",
      callbackToken: "token",
      healthStatus: "healthy",
      healthMessage: "World is ready.",
      lastAccessedAt: null,
      lastInteractiveAt: null,
      lastBootedAt: null,
      lastHeartbeatAt: null,
      lastSuspendedAt: null,
      failureCode: null,
      failureMessage: null,
      retryCount: 0,
      note: null,
    }),
  );

  const supersededResumeJob = await jobRepo.save(
    jobRepo.create({
      worldId: world.id,
      jobType: "suspend",
      status: "cancelled",
      priority: 100,
      payload: { source: "suspend-request" },
      attempt: 0,
      maxAttempts: 3,
      availableAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      startedAt: null,
      finishedAt: new Date(),
      failureCode: "superseded_by_new_job",
      failureMessage:
        "Pending suspend job was superseded by a newer resume request.",
      resultPayload: {
        action: "superseded_by_new_job",
        supersededByJobType: "resume",
        supersededByPayload: { source: "resume-request" },
      },
    }),
  );
  const supersededSuspendJob = await jobRepo.save(
    jobRepo.create({
      worldId: world.id,
      jobType: "resume",
      status: "cancelled",
      priority: 100,
      payload: { source: "resume-request" },
      attempt: 0,
      maxAttempts: 3,
      availableAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      startedAt: null,
      finishedAt: new Date(),
      failureCode: "superseded_by_new_job",
      failureMessage:
        "Pending resume job was superseded by a newer suspend request.",
      resultPayload: {
        action: "superseded_by_new_job",
        supersededByJobType: "suspend",
        supersededByPayload: { source: "suspend-request" },
      },
    }),
  );
  await jobRepo.save(
    jobRepo.create({
      worldId: world.id,
      jobType: "reconcile",
      status: "succeeded",
      priority: 100,
      payload: { source: "reconcile-request" },
      attempt: 1,
      maxAttempts: 3,
      availableAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      startedAt: new Date(),
      finishedAt: new Date(),
      failureCode: null,
      failureMessage: null,
      resultPayload: { action: "reconciled" },
    }),
  );

  const supersededJobs = await service.listJobs({
    audit: "superseded",
  });
  assert.deepEqual(
    new Set(supersededJobs.map((job) => job.id)),
    new Set([supersededResumeJob.id, supersededSuspendJob.id]),
  );

  const resumeSupersededJobs = await service.listJobs({
    audit: "superseded",
    supersededBy: "resume",
  });
  assert.equal(resumeSupersededJobs.length, 1);
  assert.equal(resumeSupersededJobs[0]?.id, supersededResumeJob.id);
  assert.equal(resumeSupersededJobs[0]?.supersededByJobType, "resume");
});

test("listJobs filters lifecycle jobs by provider queue state and search query", async (t) => {
  const dataSource = await createTestDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const service = createCloudService(dataSource);
  const worldRepo = dataSource.getRepository(CloudWorldEntity);
  const jobRepo = dataSource.getRepository(WorldLifecycleJobEntity);
  const filteredWorld = await worldRepo.save(
    worldRepo.create({
      phone: "+8613800138020",
      name: "Queue Filter World",
      status: "ready",
      slug: "world-8020-queue-filter",
      desiredState: "running",
      provisionStrategy: "manual-docker",
      providerKey: providerSummary.key,
      providerRegion: "manual",
      providerZone: "docker-host-a",
      runtimeVersion: "test-runtime",
      apiBaseUrl: "https://queue-filter-world.example.com",
      adminUrl: "https://queue-filter-world-admin.example.com",
      callbackToken: "token",
      healthStatus: "healthy",
      healthMessage: "World is ready.",
      lastAccessedAt: null,
      lastInteractiveAt: null,
      lastBootedAt: null,
      lastHeartbeatAt: null,
      lastSuspendedAt: null,
      failureCode: null,
      failureMessage: null,
      retryCount: 0,
      note: null,
    }),
  );
  const otherWorld = await worldRepo.save(
    worldRepo.create({
      phone: "+8613800138021",
      name: "Other Queue World",
      status: "ready",
      slug: "world-8021-queue-filter",
      desiredState: "running",
      provisionStrategy: "manual-docker",
      providerKey: "other-provider",
      providerRegion: "manual",
      providerZone: "docker-host-b",
      runtimeVersion: "test-runtime",
      apiBaseUrl: "https://other-queue-world.example.com",
      adminUrl: "https://other-queue-world-admin.example.com",
      callbackToken: "token",
      healthStatus: "healthy",
      healthMessage: "World is ready.",
      lastAccessedAt: null,
      lastInteractiveAt: null,
      lastBootedAt: null,
      lastHeartbeatAt: null,
      lastSuspendedAt: null,
      failureCode: null,
      failureMessage: null,
      retryCount: 0,
      note: null,
    }),
  );

  const delayedJob = await jobRepo.save(
    jobRepo.create({
      worldId: filteredWorld.id,
      jobType: "resume",
      status: "pending",
      priority: 50,
      payload: { source: "queue-filter" },
      attempt: 0,
      maxAttempts: 3,
      availableAt: new Date(Date.now() + 60_000),
      leaseOwner: null,
      leaseExpiresAt: null,
      startedAt: null,
      finishedAt: null,
      failureCode: null,
      failureMessage: null,
      resultPayload: null,
    }),
  );
  await jobRepo.save(
    jobRepo.create({
      worldId: otherWorld.id,
      jobType: "resume",
      status: "running",
      priority: 50,
      payload: { source: "queue-filter-other" },
      attempt: 1,
      maxAttempts: 3,
      availableAt: null,
      leaseOwner: "worker-b",
      leaseExpiresAt: new Date(Date.now() + 60_000),
      startedAt: new Date(),
      finishedAt: null,
      failureCode: null,
      failureMessage: null,
      resultPayload: null,
    }),
  );

  const providerFilteredJobs = await service.listJobs({
    provider: providerSummary.key,
  });
  assert.deepEqual(
    providerFilteredJobs.map((job) => job.id),
    [delayedJob.id],
  );

  const delayedJobs = await service.listJobs({
    queueState: "delayed",
  });
  assert.deepEqual(
    delayedJobs.map((job) => job.id),
    [delayedJob.id],
  );

  const queryFilteredJobs = await service.listJobs({
    query: filteredWorld.phone,
  });
  assert.deepEqual(
    queryFilteredJobs.map((job) => job.id),
    [delayedJob.id],
  );
});
