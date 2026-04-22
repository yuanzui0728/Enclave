import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import {
  apiFetch,
  assertSuccessfulPost,
  clearFilteredFailedWaitingSessionSyncTasks,
  clearFailedWaitingSessionSyncTasks,
  createAdminSessionSourceGroupRiskSnapshot,
  createAdminSessionSourceGroupSnapshot,
  issueAdminAccessToken,
  listJobs,
  listAdminSessionSourceGroups,
  listAdminSessions,
  listWaitingSessionSyncTasks,
  replayFilteredFailedWaitingSessionSyncTasks,
  replayFailedWaitingSessionSyncTasks,
  refreshAdminAccessToken,
  revokeAdminSession,
  revokeAdminSessionSourceGroupsByRisk,
  revokeAdminSessionSourceGroup,
  revokeFilteredAdminSessions,
  revokeAdminSessionById,
  revokeAdminSessionsById,
  seedLifecycleJob,
  seedWaitingSessionSyncTask,
  startEphemeralCloudApi,
} from "./cloud-api-test-harness.mjs";

const phone = "+8613800000000";

const server = await startEphemeralCloudApi({
  tempPrefix: "yinjie-cloud-api-e2e-",
  databaseFileName: "cloud-api-e2e.sqlite",
  adminSecret: "cloud-e2e-admin-secret",
  jwtSecret: "cloud-e2e-jwt-secret",
  authTokenTtl: "1h",
});
const { adminSecret, baseUrl, databasePath } = server;
const ADMIN_ISSUE_IP = "198.51.100.10";
const ADMIN_ISSUE_REQUEST_ID = "cloud-api-e2e-admin-issue-request-id";
const ADMIN_REFRESH_IP = "198.51.100.11";
const ADMIN_ACCESS_IP = "198.51.100.12";
const ADMIN_REUSE_IP = "198.51.100.13";
const ADMIN_SECONDARY_ISSUE_IP = "198.51.100.14";
const ADMIN_FILTERED_ISSUE_IP = "198.51.100.15";
const ADMIN_GROUP_ISSUE_IP = "198.51.100.16";
const ADMIN_RISK_ISSUE_IP = "198.51.100.17";
const ADMIN_ISSUE_USER_AGENT = "cloud-api-e2e/issue";
const ADMIN_REFRESH_USER_AGENT = "cloud-api-e2e/refresh";
const ADMIN_ACCESS_USER_AGENT = "cloud-api-e2e/access";
const ADMIN_REUSE_USER_AGENT = "cloud-api-e2e/reuse";
const ADMIN_SECONDARY_ISSUE_USER_AGENT = "cloud-api-e2e/secondary-issue";
const ADMIN_FILTERED_ISSUE_USER_AGENT = "cloud-api-e2e/filtered-issue";
const ADMIN_GROUP_ISSUE_USER_AGENT = "cloud-api-e2e/grouped-source";
const ADMIN_RISK_ISSUE_USER_AGENT = "cloud-api-e2e/risk-group";

try {
  await runScenario();
  console.log(`cloud-api e2e passed on ${baseUrl}`);
} finally {
  await server.cleanup();
}

async function runScenario() {
  const sendCodeResponse = await apiFetch(baseUrl, "/cloud/auth/send-code", {
    method: "POST",
    body: {
      phone,
    },
  });
  assertSuccessfulPost(sendCodeResponse, "send-code should succeed");
  assert.ok(
    sendCodeResponse.requestId,
    "send-code should return an x-request-id response header",
  );
  assert.match(
    sendCodeResponse.body.debugCode ?? "",
    /^\d{6}$/,
    "send-code should return a 6-digit debug code",
  );

  const sendCodeValidationResponse = await apiFetch(
    baseUrl,
    "/cloud/auth/send-code",
    {
      method: "POST",
      body: {
        phone,
        unexpected: true,
      },
    },
  );
  assert.equal(
    sendCodeValidationResponse.status,
    400,
    "validation pipe should reject non-whitelisted fields",
  );

  const sendCodeRateLimitResponse = await apiFetch(
    baseUrl,
    "/cloud/auth/send-code",
    {
      method: "POST",
      body: {
        phone,
      },
    },
  );
  assert.equal(
    sendCodeRateLimitResponse.status,
    429,
    "send-code should enforce resend cooldown",
  );

  const verifyCodeResponse = await apiFetch(
    baseUrl,
    "/cloud/auth/verify-code",
    {
      method: "POST",
      body: {
        phone,
        code: sendCodeResponse.body.debugCode,
      },
    },
  );
  assertSuccessfulPost(verifyCodeResponse, "verify-code should succeed");
  assert.ok(
    verifyCodeResponse.body.accessToken,
    "verify-code should return an access token",
  );

  const expiresAt = Date.parse(String(verifyCodeResponse.body.expiresAt ?? ""));
  assert.ok(
    Number.isFinite(expiresAt),
    "verify-code should return a valid expiresAt",
  );
  const expiresInMs = expiresAt - Date.now();
  assert.ok(
    expiresInMs > 55 * 60 * 1000 && expiresInMs < 65 * 60 * 1000,
    `verify-code expiresAt should honor CLOUD_AUTH_TOKEN_TTL=1h, got ${expiresInMs}ms`,
  );

  const accessToken = verifyCodeResponse.body.accessToken;
  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
  };

  const clientTokenRejectedByAdminResponse = await apiFetch(
    baseUrl,
    "/admin/cloud/providers",
    {
      headers: authHeaders,
    },
  );
  assert.equal(
    clientTokenRejectedByAdminResponse.status,
    401,
    "client access token should not authorize admin routes",
  );

  const waitingSessionSyncTasksResponse = await listWaitingSessionSyncTasks(
    baseUrl,
    {
      "X-Admin-Secret": adminSecret,
    },
    {
      status: "failed",
    },
  );
  assert.equal(
    waitingSessionSyncTasksResponse.status,
    200,
    "waiting session sync task list should succeed",
  );
  assert.ok(
    Array.isArray(waitingSessionSyncTasksResponse.body?.items),
    "waiting session sync task list should return items",
  );

  const invalidWaitingSessionSyncTaskFilterResponse = await apiFetch(
    baseUrl,
    "/admin/cloud/waiting-session-sync-tasks?status=broken",
    {
      headers: {
        "X-Admin-Secret": adminSecret,
      },
    },
  );
  assert.equal(
    invalidWaitingSessionSyncTaskFilterResponse.status,
    400,
    "waiting session sync task list should validate filters",
  );

  const invalidReplayWaitingSessionSyncTaskResponse = await apiFetch(
    baseUrl,
    "/admin/cloud/waiting-session-sync-tasks/replay-failed",
    {
      method: "POST",
      headers: {
        "X-Admin-Secret": adminSecret,
      },
      body: {
        taskIds: ["broken-task-id"],
      },
    },
  );
  assert.equal(
    invalidReplayWaitingSessionSyncTaskResponse.status,
    400,
    "waiting session sync replay should validate taskIds",
  );

  const invalidFilteredReplayWaitingSessionSyncTaskResponse = await apiFetch(
    baseUrl,
    "/admin/cloud/waiting-session-sync-tasks/replay-filtered-failed",
    {
      method: "POST",
      headers: {
        "X-Admin-Secret": adminSecret,
      },
      body: {
        taskType: "broken-task-type",
      },
    },
  );
  assert.equal(
    invalidFilteredReplayWaitingSessionSyncTaskResponse.status,
    400,
    "filtered waiting session sync replay should validate taskType",
  );

  const replayTask = seedWaitingSessionSyncTask(databasePath, {
    taskKey: "refresh-world:cloud-api-e2e-replay-task",
    targetValue: "cloud-api-e2e-replay-world",
    context: "cloud-api-e2e.replay",
  });
  const replayWaitingSessionSyncTaskResponse =
    await replayFailedWaitingSessionSyncTasks(
      baseUrl,
      [replayTask.id],
      {
        "X-Admin-Secret": adminSecret,
      },
    );
  assertSuccessfulPost(
    replayWaitingSessionSyncTaskResponse,
    "waiting session sync replay should succeed",
  );
  assert.equal(
    replayWaitingSessionSyncTaskResponse.body.success,
    true,
    "waiting session sync replay should report success",
  );
  assert.deepEqual(
    replayWaitingSessionSyncTaskResponse.body.replayedTaskIds,
    [replayTask.id],
    "waiting session sync replay should return replayed ids",
  );
  assert.deepEqual(
    replayWaitingSessionSyncTaskResponse.body.skippedTaskIds,
    [],
    "waiting session sync replay should not skip the seeded task",
  );
  await waitForWaitingSessionSyncTaskCount(
    baseUrl,
    {
      "X-Admin-Secret": adminSecret,
    },
    {
      query: replayTask.taskKey,
    },
    0,
  );

  seedWaitingSessionSyncTask(databasePath, {
    taskKey: "refresh-world:cloud-api-e2e-filtered-replay-task",
    targetValue: "cloud-api-e2e-filtered-replay-world",
    context: "cloud-api-e2e.filtered-replay",
    taskType: "refresh_world",
  });
  const filteredReplayUnmatchedTask = seedWaitingSessionSyncTask(databasePath, {
    taskKey: "refresh-phone:+8613800138999",
    targetValue: "+8613800138999",
    context: "cloud-api-e2e.filtered-replay",
    taskType: "refresh_phone",
  });
  const replayFilteredWaitingSessionSyncTaskResponse =
    await replayFilteredFailedWaitingSessionSyncTasks(
      baseUrl,
      {
        taskType: "refresh_world",
        query: "filtered-replay",
      },
      {
        "X-Admin-Secret": adminSecret,
      },
    );
  assertSuccessfulPost(
    replayFilteredWaitingSessionSyncTaskResponse,
    "filtered waiting session sync replay should succeed",
  );
  assert.deepEqual(
    replayFilteredWaitingSessionSyncTaskResponse.body,
    {
      success: true,
      matchedCount: 1,
      replayedCount: 1,
      skippedCount: 0,
    },
    "filtered waiting session sync replay should only replay matching failed tasks",
  );
  await waitForWaitingSessionSyncTaskCount(
    baseUrl,
    {
      "X-Admin-Secret": adminSecret,
    },
    {
      query: "filtered-replay",
    },
    1,
  );
  await waitForWaitingSessionSyncTaskCount(
    baseUrl,
    {
      "X-Admin-Secret": adminSecret,
    },
    {
      query: filteredReplayUnmatchedTask.taskKey,
    },
    1,
  );

  const clearTask = seedWaitingSessionSyncTask(databasePath, {
    taskKey: "refresh-world:cloud-api-e2e-clear-task",
    targetValue: "cloud-api-e2e-clear-world",
    context: "cloud-api-e2e.clear",
  });
  const clearWaitingSessionSyncTaskResponse =
    await clearFailedWaitingSessionSyncTasks(
      baseUrl,
      [clearTask.id],
      {
        "X-Admin-Secret": adminSecret,
      },
    );
  assertSuccessfulPost(
    clearWaitingSessionSyncTaskResponse,
    "waiting session sync clear should succeed",
  );
  assert.equal(
    clearWaitingSessionSyncTaskResponse.body.success,
    true,
    "waiting session sync clear should report success",
  );
  assert.deepEqual(
    clearWaitingSessionSyncTaskResponse.body.clearedTaskIds,
    [clearTask.id],
    "waiting session sync clear should return cleared ids",
  );
  assert.deepEqual(
    clearWaitingSessionSyncTaskResponse.body.skippedTaskIds,
    [],
    "waiting session sync clear should not skip the seeded task",
  );
  await waitForWaitingSessionSyncTaskCount(
    baseUrl,
    {
      "X-Admin-Secret": adminSecret,
    },
    {
      query: clearTask.taskKey,
    },
    0,
  );

  seedWaitingSessionSyncTask(databasePath, {
    taskKey: "refresh-world:cloud-api-e2e-filtered-clear-task",
    targetValue: "cloud-api-e2e-filtered-clear-world",
    context: "cloud-api-e2e.filtered-clear",
    taskType: "refresh_world",
  });
  const filteredClearUnmatchedTask = seedWaitingSessionSyncTask(databasePath, {
    taskKey: "invalidate-phone:+8613800138110",
    targetValue: "+8613800138110",
    context: "cloud-api-e2e.filtered-clear",
    taskType: "invalidate_phone",
  });
  const clearFilteredWaitingSessionSyncTaskResponse =
    await clearFilteredFailedWaitingSessionSyncTasks(
      baseUrl,
      {
        taskType: "refresh_world",
        query: "filtered-clear",
      },
      {
        "X-Admin-Secret": adminSecret,
      },
    );
  assertSuccessfulPost(
    clearFilteredWaitingSessionSyncTaskResponse,
    "filtered waiting session sync clear should succeed",
  );
  assert.deepEqual(
    clearFilteredWaitingSessionSyncTaskResponse.body,
    {
      success: true,
      matchedCount: 1,
      clearedCount: 1,
      skippedCount: 0,
    },
    "filtered waiting session sync clear should only clear matching failed tasks",
  );
  await waitForWaitingSessionSyncTaskCount(
    baseUrl,
    {
      "X-Admin-Secret": adminSecret,
    },
    {
      query: "filtered-clear",
    },
    1,
  );
  await waitForWaitingSessionSyncTaskCount(
    baseUrl,
    {
      "X-Admin-Secret": adminSecret,
    },
    {
      query: filteredClearUnmatchedTask.taskKey,
    },
    1,
  );

  const firstRequestResponse = await apiFetch(
    baseUrl,
    "/cloud/me/world-requests",
    {
      method: "POST",
      headers: authHeaders,
      body: {
        worldName: "测试世界A",
      },
    },
  );
  assertSuccessfulPost(
    firstRequestResponse,
    "first world request should be created",
  );

  const rejectRequestResponse = await apiFetch(
    baseUrl,
    `/admin/cloud/world-requests/${firstRequestResponse.body.id}`,
    {
      method: "PATCH",
      headers: {
        "X-Admin-Secret": adminSecret,
      },
      body: {
        status: "rejected",
        note: "资料不完整",
      },
    },
  );
  assert.equal(
    rejectRequestResponse.status,
    200,
    "request rejection should succeed",
  );

  const worldsAfterRejectResponse = await apiFetch(
    baseUrl,
    "/admin/cloud/worlds",
    {
      headers: {
        "X-Admin-Secret": adminSecret,
      },
    },
  );
  assert.equal(
    worldsAfterRejectResponse.status,
    200,
    "list worlds should succeed after rejection",
  );
  assert.deepEqual(
    worldsAfterRejectResponse.body,
    [],
    "rejected requests should not leave a blocking world record",
  );

  const secondRequestResponse = await apiFetch(
    baseUrl,
    "/cloud/me/world-requests",
    {
      method: "POST",
      headers: authHeaders,
      body: {
        worldName: "测试世界B",
      },
    },
  );
  assertSuccessfulPost(
    secondRequestResponse,
    "second world request should be allowed after rejection",
  );

  const adminTokenResponse = await issueAdminAccessToken(baseUrl, adminSecret, {
    "X-Request-Id": ADMIN_ISSUE_REQUEST_ID,
    "X-Forwarded-For": ADMIN_ISSUE_IP,
    "User-Agent": ADMIN_ISSUE_USER_AGENT,
  });
  assertSuccessfulPost(
    adminTokenResponse,
    "admin token issuance should succeed",
  );
  assert.equal(
    adminTokenResponse.requestId,
    ADMIN_ISSUE_REQUEST_ID,
    "admin token issuance should echo the provided x-request-id header",
  );
  assert.equal(
    adminTokenResponse.body.tokenType,
    "Bearer",
    "admin token issuance should return a bearer token type",
  );
  assert.ok(
    adminTokenResponse.body.refreshToken,
    "admin token issuance should return a refresh token",
  );
  const adminTokenExpiresAt = Date.parse(
    String(adminTokenResponse.body.expiresAt ?? ""),
  );
  assert.ok(
    Number.isFinite(adminTokenExpiresAt),
    "admin token issuance should return a valid expiresAt",
  );
  const adminTokenExpiresInMs = adminTokenExpiresAt - Date.now();
  assert.ok(
    adminTokenExpiresInMs > 14 * 60 * 1000 &&
      adminTokenExpiresInMs < 16 * 60 * 1000,
    `admin token expiresAt should default to about 15 minutes, got ${adminTokenExpiresInMs}ms`,
  );
  const adminRefreshExpiresAt = Date.parse(
    String(adminTokenResponse.body.refreshExpiresAt ?? ""),
  );
  assert.ok(
    Number.isFinite(adminRefreshExpiresAt),
    "admin token issuance should return a valid refreshExpiresAt",
  );
  assert.ok(
    adminRefreshExpiresAt - Date.now() > 6 * 24 * 60 * 60 * 1000,
    "admin refresh session should default to a multi-day ttl",
  );

  const rotatedAdminTokenResponse = await refreshAdminAccessToken(
    baseUrl,
    adminTokenResponse.body.refreshToken,
    {
      "X-Forwarded-For": ADMIN_REFRESH_IP,
      "User-Agent": ADMIN_REFRESH_USER_AGENT,
    },
  );
  assertSuccessfulPost(
    rotatedAdminTokenResponse,
    "admin token refresh should succeed",
  );
  assert.notEqual(
    rotatedAdminTokenResponse.body.refreshToken,
    adminTokenResponse.body.refreshToken,
    "admin token refresh should rotate the refresh token",
  );

  const reusedRefreshTokenResponse = await refreshAdminAccessToken(
    baseUrl,
    adminTokenResponse.body.refreshToken,
    {
      "X-Forwarded-For": ADMIN_REUSE_IP,
      "User-Agent": ADMIN_REUSE_USER_AGENT,
    },
  );
  assert.equal(
    reusedRefreshTokenResponse.status,
    401,
    "reused refresh tokens should be rejected",
  );

  const adminSessionResponse = await issueAdminAccessToken(baseUrl, adminSecret);
  assertSuccessfulPost(
    adminSessionResponse,
    "a fresh admin session should still be issuable after reuse detection",
  );

  const adminHeaders = {
    Authorization: `Bearer ${adminSessionResponse.body.accessToken}`,
  };

  const adminTokenRejectedByClientResponse = await apiFetch(
    baseUrl,
    "/cloud/me/world-requests",
    {
      method: "POST",
      headers: adminHeaders,
      body: {
        worldName: "错误用法",
      },
    },
  );
  assert.equal(
    adminTokenRejectedByClientResponse.status,
    401,
    "admin access token should not authorize cloud client routes",
  );

  const activateRequestResponse = await apiFetch(
    baseUrl,
    `/admin/cloud/world-requests/${secondRequestResponse.body.id}`,
    {
      method: "PATCH",
      headers: adminHeaders,
      body: {
        status: "active",
        note: "已开通",
        apiBaseUrl: "https://world.example.com/api/",
        adminUrl: "https://world.example.com/admin/",
      },
    },
  );
  assert.equal(
    activateRequestResponse.status,
    200,
    "request activation should succeed",
  );
  assert.equal(
    activateRequestResponse.body.apiBaseUrl,
    "https://world.example.com/api",
    "activation should normalize apiBaseUrl",
  );
  assert.equal(
    activateRequestResponse.body.adminUrl,
    "https://world.example.com/admin",
    "activation should normalize adminUrl",
  );

  const worldsResponse = await apiFetch(baseUrl, "/admin/cloud/worlds", {
    headers: adminHeaders,
  });
  assert.equal(
    worldsResponse.status,
    200,
    "list worlds should succeed after activation",
  );
  assert.equal(
    worldsResponse.body.length,
    1,
    "activation should create one world",
  );

  const world = worldsResponse.body[0];
  assert.equal(world.status, "ready", "activated world should be ready");
  assert.equal(
    world.apiBaseUrl,
    "https://world.example.com/api",
    "world apiBaseUrl should stay normalized",
  );
  assert.equal(
    world.adminUrl,
    "https://world.example.com/admin",
    "world adminUrl should stay normalized",
  );

  const supersededResumeJob = seedLifecycleJob(databasePath, {
    worldId: world.id,
    jobType: "suspend",
    payload: { source: "suspend-request" },
    finishedAt: "2026-04-20T00:05:00.000Z",
    failureMessage:
      "Pending suspend job was superseded by a newer resume request.",
    resultPayload: {
      action: "superseded_by_new_job",
      supersededByJobType: "resume",
      supersededByPayload: { source: "resume-request" },
    },
  });
  const supersededSuspendJob = seedLifecycleJob(databasePath, {
    worldId: world.id,
    jobType: "resume",
    payload: { source: "resume-request" },
    finishedAt: "2026-04-20T00:15:00.000Z",
    failureMessage:
      "Pending resume job was superseded by a newer suspend request.",
    resultPayload: {
      action: "superseded_by_new_job",
      supersededByJobType: "suspend",
      supersededByPayload: { source: "suspend-request" },
    },
  });

  const supersededJobsResponse = await listJobs(
    baseUrl,
    adminHeaders,
    {
      audit: "superseded",
    },
  );
  assert.equal(
    supersededJobsResponse.status,
    200,
    "superseded job list should succeed",
  );
  assert.ok(
    supersededJobsResponse.body.items.some(
      (job) =>
        job.failureCode === "superseded_by_new_job" &&
        job.supersededByJobType === "resume",
    ),
    "superseded job list should include resume-superseded jobs",
  );
  assert.ok(
    supersededJobsResponse.body.items.some(
      (job) =>
        job.failureCode === "superseded_by_new_job" &&
        job.supersededByJobType === "suspend",
    ),
    "superseded job list should include suspend-superseded jobs",
  );

  const resumeSupersededJobsResponse = await listJobs(
    baseUrl,
    adminHeaders,
    {
      audit: "superseded",
      supersededBy: "resume",
    },
  );
  assert.equal(
    resumeSupersededJobsResponse.status,
    200,
    "superseded-by job list should succeed",
  );
  assert.deepEqual(
    resumeSupersededJobsResponse.body.items.map((job) => job.id),
    [supersededResumeJob.id],
    "superseded-by filter should return only matching jobs",
  );

  const pagedSupersededJobsResponse = await listJobs(
    baseUrl,
    adminHeaders,
    {
      audit: "superseded",
      page: 2,
      pageSize: 1,
    },
  );
  assert.equal(
    pagedSupersededJobsResponse.status,
    200,
    "paginated superseded job list should succeed",
  );
  assert.equal(
    pagedSupersededJobsResponse.body.page,
    2,
    "paginated job list should echo the requested page",
  );
  assert.equal(
    pagedSupersededJobsResponse.body.pageSize,
    1,
    "paginated job list should echo the requested page size",
  );
  assert.equal(
    pagedSupersededJobsResponse.body.total,
    2,
    "paginated job list should report the full superseded match count",
  );
  assert.equal(
    pagedSupersededJobsResponse.body.items.length,
    1,
    "paginated job list should return one item for pageSize=1",
  );

  const sortedSupersededJobsResponse = await listJobs(
    baseUrl,
    adminHeaders,
    {
      audit: "superseded",
      sortBy: "finishedAt",
      sortDirection: "asc",
    },
  );
  assert.equal(
    sortedSupersededJobsResponse.status,
    200,
    "sorted superseded job list should succeed",
  );
  assert.deepEqual(
    sortedSupersededJobsResponse.body.items.map((job) => job.id),
    [supersededResumeJob.id, supersededSuspendJob.id],
    "sortBy=finishedAt&sortDirection=asc should sort superseded jobs by finishedAt",
  );

  const delayedJob = seedLifecycleJob(databasePath, {
    worldId: world.id,
    jobType: "resume",
    status: "pending",
    availableAt: new Date(Date.now() + 60_000).toISOString(),
    finishedAt: null,
    failureCode: null,
    failureMessage: null,
    resultPayload: null,
  });
  const delayedJobsResponse = await listJobs(
    baseUrl,
    adminHeaders,
    {
      queueState: "delayed",
    },
  );
  assert.equal(
    delayedJobsResponse.status,
    200,
    "queue-state filtered job list should succeed",
  );
  assert.deepEqual(
    delayedJobsResponse.body.items.map((job) => job.id),
    [delayedJob.id],
    "queueState=delayed should return only delayed jobs",
  );

  const unassignedProviderJobsResponse = await listJobs(
    baseUrl,
    adminHeaders,
    {
      provider: "__unassigned__",
    },
  );
  assert.equal(
    unassignedProviderJobsResponse.status,
    200,
    "provider-filtered job list should succeed",
  );
  assert.deepEqual(
    unassignedProviderJobsResponse.body.items,
    [],
    "provider=__unassigned__ should exclude jobs for assigned worlds",
  );

  const queryFilteredJobsResponse = await listJobs(
    baseUrl,
    adminHeaders,
    {
      query: phone,
    },
  );
  assert.equal(
    queryFilteredJobsResponse.status,
    200,
    "query-filtered job list should succeed",
  );
  assert.ok(
    queryFilteredJobsResponse.body.items.every((job) => job.worldId === world.id),
    "query filter should match jobs by the world phone",
  );

  const invalidSupersededJobFilterResponse = await apiFetch(
    baseUrl,
    "/admin/cloud/jobs?supersededBy=destroy",
    {
      headers: adminHeaders,
    },
  );
  assert.equal(
    invalidSupersededJobFilterResponse.status,
    400,
    "job list should validate supersededBy filters",
  );

  const invalidQueueStateJobFilterResponse = await apiFetch(
    baseUrl,
    "/admin/cloud/jobs?queueState=paused",
    {
      headers: adminHeaders,
    },
  );
  assert.equal(
    invalidQueueStateJobFilterResponse.status,
    400,
    "job list should validate queueState filters",
  );

  const invalidSortByJobFilterResponse = await apiFetch(
    baseUrl,
    "/admin/cloud/jobs?sortBy=priority",
    {
      headers: adminHeaders,
    },
  );
  assert.equal(
    invalidSortByJobFilterResponse.status,
    400,
    "job list should validate sortBy filters",
  );

  const invalidProviderResponse = await apiFetch(
    baseUrl,
    `/admin/cloud/worlds/${world.id}`,
    {
      method: "PATCH",
      headers: adminHeaders,
      body: {
        providerKey: "bogus-provider",
      },
    },
  );
  assert.equal(
    invalidProviderResponse.status,
    400,
    "invalid provider changes should be rejected",
  );
  assert.match(
    String(invalidProviderResponse.body.message ?? ""),
    /Unsupported compute provider/,
    "invalid provider error should be explicit",
  );

  const bootstrapConfigResponse = await apiFetch(
    baseUrl,
    `/admin/cloud/worlds/${world.id}/bootstrap-config`,
    {
      headers: adminHeaders,
    },
  );
  assert.equal(
    bootstrapConfigResponse.status,
    200,
    "bootstrap config should be available",
  );

  const setStartingResponse = await apiFetch(
    baseUrl,
    `/admin/cloud/worlds/${world.id}`,
    {
      method: "PATCH",
      headers: adminHeaders,
      body: {
        status: "starting",
      },
    },
  );
  assert.equal(
    setStartingResponse.status,
    200,
    "world should be patchable back to starting",
  );

  const heartbeatResponse = await apiFetch(
    baseUrl,
    `/internal/worlds/${world.id}/heartbeat`,
    {
      method: "POST",
      headers: {
        "X-World-Callback-Token": bootstrapConfigResponse.body.callbackToken,
      },
      body: {
        apiBaseUrl: "https://runtime.example.com/api/",
        adminUrl: "https://runtime.example.com/admin/",
        healthStatus: "healthy",
        healthMessage: "Runtime heartbeat ok.",
      },
    },
  );
  assertSuccessfulPost(heartbeatResponse, "runtime heartbeat should succeed");

  const worldAfterHeartbeatResponse = await apiFetch(
    baseUrl,
    `/admin/cloud/worlds/${world.id}`,
    {
      headers: adminHeaders,
    },
  );
  assert.equal(
    worldAfterHeartbeatResponse.status,
    200,
    "world lookup after heartbeat should succeed",
  );
  assert.equal(
    worldAfterHeartbeatResponse.body.status,
    "ready",
    "heartbeat should promote the world back to ready",
  );
  assert.equal(
    worldAfterHeartbeatResponse.body.apiBaseUrl,
    "https://runtime.example.com/api",
    "runtime callback should normalize apiBaseUrl",
  );
  assert.equal(
    worldAfterHeartbeatResponse.body.adminUrl,
    "https://runtime.example.com/admin",
    "runtime callback should normalize adminUrl",
  );
  assert.equal(
    worldAfterHeartbeatResponse.body.healthMessage,
    "Runtime heartbeat ok.",
    "runtime callback should update world health message",
  );

  const missingWorldId = "11111111-1111-4111-8111-111111111111";
  const reconcileNotFoundResponse = await apiFetch(
    baseUrl,
    `/admin/cloud/worlds/${missingWorldId}/reconcile`,
    {
      method: "POST",
      headers: adminHeaders,
    },
  );
  assert.equal(
    reconcileNotFoundResponse.status,
    404,
    "reconcile should report missing worlds",
  );
  assert.equal(
    reconcileNotFoundResponse.body.message,
    "找不到该云世界。",
    "missing world message should be readable",
  );

  const logoutResponse = await revokeAdminSession(
    baseUrl,
    adminSessionResponse.body.refreshToken,
  );
  assertSuccessfulPost(logoutResponse, "admin session logout should succeed");
  assert.equal(
    logoutResponse.body.success,
    true,
    "admin session logout should confirm revocation",
  );

  const revokedRefreshTokenResponse = await refreshAdminAccessToken(
    baseUrl,
    adminSessionResponse.body.refreshToken,
  );
  assert.equal(
    revokedRefreshTokenResponse.status,
    401,
    "revoked refresh tokens should not mint new access tokens",
  );

  const revokedAccessTokenResponse = await apiFetch(
    baseUrl,
    "/admin/cloud/providers",
    {
      headers: adminHeaders,
    },
  );
  assert.equal(
    revokedAccessTokenResponse.status,
    401,
    "logout should invalidate the matching access token immediately",
  );

  const finalAdminSessionResponse = await issueAdminAccessToken(
    baseUrl,
    adminSecret,
    {
      "X-Forwarded-For": ADMIN_ISSUE_IP,
      "User-Agent": ADMIN_ISSUE_USER_AGENT,
    },
  );
  assertSuccessfulPost(
    finalAdminSessionResponse,
    "a new admin session should be issuable after logout",
  );

  const finalAdminHeaders = {
    Authorization: `Bearer ${finalAdminSessionResponse.body.accessToken}`,
  };
  const secondaryActiveSessionResponse = await issueAdminAccessToken(
    baseUrl,
    adminSecret,
    {
      "X-Forwarded-For": ADMIN_SECONDARY_ISSUE_IP,
      "User-Agent": ADMIN_SECONDARY_ISSUE_USER_AGENT,
    },
  );
  assertSuccessfulPost(
    secondaryActiveSessionResponse,
    "a secondary admin session should be issuable for bulk revoke coverage",
  );
  const filteredActiveSessionResponse = await issueAdminAccessToken(
    baseUrl,
    adminSecret,
    {
      "X-Forwarded-For": ADMIN_FILTERED_ISSUE_IP,
      "User-Agent": ADMIN_FILTERED_ISSUE_USER_AGENT,
    },
  );
  assertSuccessfulPost(
    filteredActiveSessionResponse,
    "a filtered-revoke admin session should be issuable",
  );
  const groupedSourceSessionOneResponse = await issueAdminAccessToken(
    baseUrl,
    adminSecret,
    {
      "X-Forwarded-For": ADMIN_GROUP_ISSUE_IP,
      "User-Agent": ADMIN_GROUP_ISSUE_USER_AGENT,
    },
  );
  assertSuccessfulPost(
    groupedSourceSessionOneResponse,
    "a grouped-source admin session should be issuable",
  );
  const groupedSourceSessionTwoResponse = await issueAdminAccessToken(
    baseUrl,
    adminSecret,
    {
      "X-Forwarded-For": ADMIN_GROUP_ISSUE_IP,
      "User-Agent": ADMIN_GROUP_ISSUE_USER_AGENT,
    },
  );
  assertSuccessfulPost(
    groupedSourceSessionTwoResponse,
    "a second grouped-source admin session should be issuable",
  );
  const riskGroupSessionOneResponse = await issueAdminAccessToken(
    baseUrl,
    adminSecret,
    {
      "X-Forwarded-For": ADMIN_RISK_ISSUE_IP,
      "User-Agent": ADMIN_RISK_ISSUE_USER_AGENT,
    },
  );
  assertSuccessfulPost(
    riskGroupSessionOneResponse,
    "a watch-risk admin session should be issuable",
  );
  const riskGroupSessionTwoResponse = await issueAdminAccessToken(
    baseUrl,
    adminSecret,
    {
      "X-Forwarded-For": ADMIN_RISK_ISSUE_IP,
      "User-Agent": ADMIN_RISK_ISSUE_USER_AGENT,
    },
  );
  assertSuccessfulPost(
    riskGroupSessionTwoResponse,
    "a second watch-risk admin session should be issuable",
  );
  const adminSessionsResponse = await listAdminSessions(
    baseUrl,
    {
      ...finalAdminHeaders,
      "X-Forwarded-For": ADMIN_ACCESS_IP,
      "User-Agent": ADMIN_ACCESS_USER_AGENT,
    },
  );
  assert.equal(
    adminSessionsResponse.status,
    200,
    "list admin sessions should succeed",
  );
  assert.ok(
    Array.isArray(adminSessionsResponse.body.items),
    "list admin sessions should return paginated items",
  );
  assert.ok(
    adminSessionsResponse.body.total >= adminSessionsResponse.body.items.length,
    "list admin sessions should include total metadata",
  );
  const currentSession = adminSessionsResponse.body.items.find(
    (session) => session.isCurrent,
  );
  assert.ok(currentSession, "admin session list should flag the current session");
  assert.equal(
    currentSession.status,
    "active",
    "the current admin session should be active before explicit revocation",
  );
  assert.equal(
    currentSession.issuedFromIp,
    ADMIN_ISSUE_IP,
    "admin sessions should record the original issue ip",
  );
  assert.equal(
    currentSession.issuedUserAgent,
    ADMIN_ISSUE_USER_AGENT,
    "admin sessions should record the original issue user agent",
  );
  assert.equal(
    currentSession.lastUsedIp,
    ADMIN_ACCESS_IP,
    "admin session access checks should update the last used ip",
  );
  assert.equal(
    currentSession.lastUsedUserAgent,
    ADMIN_ACCESS_USER_AGENT,
    "admin session access checks should update the last used user agent",
  );
  const logoutRevokedSession = adminSessionsResponse.body.items.find(
    (session) => session.revocationReason === "logout",
  );
  assert.ok(
    logoutRevokedSession,
    "admin session list should include the previously logged out session",
  );
  assert.equal(
    logoutRevokedSession.revokedBySessionId,
    logoutRevokedSession.id,
    "self logout should record the session as its own revoker",
  );
  const refreshReuseRevokedSession = adminSessionsResponse.body.items.find(
    (session) => session.revocationReason === "refresh-token-reuse",
  );
  assert.ok(
    refreshReuseRevokedSession,
    "admin session list should include refresh token reuse revocations",
  );
  assert.equal(
    refreshReuseRevokedSession.revokedBySessionId,
    null,
    "refresh token reuse revocations should not attribute another session as the revoker",
  );
  const secondaryActiveSession = adminSessionsResponse.body.items.find(
    (session) => session.issuedUserAgent === ADMIN_SECONDARY_ISSUE_USER_AGENT,
  );
  assert.ok(
    secondaryActiveSession,
    "admin session list should include the secondary active session",
  );
  const filteredActiveSession = adminSessionsResponse.body.items.find(
    (session) => session.issuedUserAgent === ADMIN_FILTERED_ISSUE_USER_AGENT,
  );
  assert.ok(
    filteredActiveSession,
    "admin session list should include the filtered-revoke active session",
  );
  const groupedSourceActiveSessions = adminSessionsResponse.body.items.filter(
    (session) => session.issuedUserAgent === ADMIN_GROUP_ISSUE_USER_AGENT,
  );
  assert.equal(
    groupedSourceActiveSessions.length,
    2,
    "admin session list should include both grouped-source active sessions",
  );
  const riskGroupActiveSessions = adminSessionsResponse.body.items.filter(
    (session) => session.issuedUserAgent === ADMIN_RISK_ISSUE_USER_AGENT,
  );
  assert.equal(
    riskGroupActiveSessions.length,
    2,
    "admin session list should include both risk-group active sessions",
  );
  const filteredRevokedSessionsResponse = await listAdminSessions(
    baseUrl,
    finalAdminHeaders,
    {
      status: "revoked",
      revocationReason: "logout",
      page: 1,
      pageSize: 5,
    },
  );
  assert.equal(
    filteredRevokedSessionsResponse.status,
    200,
    "filtered session list should succeed",
  );
  assert.equal(
    filteredRevokedSessionsResponse.body.total,
    1,
    "logout-filtered session list should only return one row",
  );
  assert.equal(
    filteredRevokedSessionsResponse.body.items[0].revocationReason,
    "logout",
    "logout filter should narrow by revocation reason",
  );
  const searchedSessionsResponse = await listAdminSessions(
    baseUrl,
    finalAdminHeaders,
    {
      query: ADMIN_REUSE_USER_AGENT,
      page: 1,
      pageSize: 5,
    },
  );
  assert.equal(
    searchedSessionsResponse.status,
    200,
    "session search should succeed",
  );
  assert.equal(
    searchedSessionsResponse.body.total,
    1,
    "session search should match on revocation audit metadata",
  );
  assert.equal(
    searchedSessionsResponse.body.items[0].id,
    refreshReuseRevokedSession.id,
    "session search should return the matching refresh-reuse session",
  );
  const currentOnlySessionsResponse = await listAdminSessions(
    baseUrl,
    finalAdminHeaders,
    {
      currentOnly: true,
      page: 1,
      pageSize: 5,
    },
  );
  assert.equal(
    currentOnlySessionsResponse.body.total,
    1,
    "currentOnly session filter should only return the current session",
  );
  assert.equal(
    currentOnlySessionsResponse.body.items[0].id,
    currentSession.id,
    "currentOnly session filter should point at the authenticated session",
  );
  const oldestSessionsResponse = await listAdminSessions(
    baseUrl,
    finalAdminHeaders,
    {
      sortBy: "createdAt",
      sortDirection: "asc",
      page: 1,
      pageSize: 5,
    },
  );
  assert.equal(
    oldestSessionsResponse.status,
    200,
    "createdAt-sorted session list should succeed",
  );
  for (let index = 1; index < oldestSessionsResponse.body.items.length; index += 1) {
    const previousCreatedAt = Date.parse(
      oldestSessionsResponse.body.items[index - 1].createdAt,
    );
    const currentCreatedAt = Date.parse(
      oldestSessionsResponse.body.items[index].createdAt,
    );
    assert.ok(
      previousCreatedAt <= currentCreatedAt,
      "createdAt asc should order admin sessions from oldest to newest",
    );
  }
  const latestRevokedSessionsResponse = await listAdminSessions(
    baseUrl,
    finalAdminHeaders,
    {
      status: "revoked",
      sortBy: "revokedAt",
      sortDirection: "desc",
      page: 1,
      pageSize: 5,
    },
  );
  assert.equal(
    latestRevokedSessionsResponse.status,
    200,
    "revokedAt-sorted session list should succeed",
  );
  assert.equal(
    latestRevokedSessionsResponse.body.items[0].id,
    logoutRevokedSession.id,
    "revokedAt desc should start with the most recently revoked session",
  );
  const invalidSortBySessionsResponse = await apiFetch(
    baseUrl,
    "/admin/cloud/admin-sessions?sortBy=bogus",
    {
      headers: finalAdminHeaders,
    },
  );
  assert.equal(
    invalidSortBySessionsResponse.status,
    400,
    "invalid session sort fields should be rejected",
  );
  const filteredRevokeSessionsResponse = await revokeFilteredAdminSessions(
    baseUrl,
    {
      query: ADMIN_FILTERED_ISSUE_USER_AGENT,
    },
    finalAdminHeaders,
  );
  assertSuccessfulPost(
    filteredRevokeSessionsResponse,
    "filtered session revoke should succeed",
  );
  assert.deepEqual(
    filteredRevokeSessionsResponse.body,
    {
      success: true,
      revokedCount: 1,
      skippedCount: 0,
      revokedCurrentSession: false,
    },
    "filtered session revoke should revoke the matching active session only",
  );
  const filteredRevokedSessionLookupResponse = await listAdminSessions(
    baseUrl,
    finalAdminHeaders,
    {
      status: "revoked",
      query: ADMIN_FILTERED_ISSUE_USER_AGENT,
      page: 1,
      pageSize: 5,
    },
  );
  assert.equal(
    filteredRevokedSessionLookupResponse.status,
    200,
    "filtered-revoked session lookup should succeed",
  );
  assert.equal(
    filteredRevokedSessionLookupResponse.body.items[0].id,
    filteredActiveSession.id,
    "filtered session revoke should revoke the expected session",
  );
  const sourceGroupListResponse = await listAdminSessionSourceGroups(
    baseUrl,
    finalAdminHeaders,
    {
      query: ADMIN_GROUP_ISSUE_USER_AGENT,
      sortBy: "activeSessions",
      sortDirection: "desc",
      page: 1,
      pageSize: 5,
    },
  );
  assert.equal(
    sourceGroupListResponse.status,
    200,
    "source-group list should succeed",
  );
  assert.equal(
    sourceGroupListResponse.body.total,
    1,
    "source-group list should paginate grouped-source matches",
  );
  const groupedSource = sourceGroupListResponse.body.items.find(
    (group) =>
      group.issuedFromIp === ADMIN_GROUP_ISSUE_IP &&
      group.issuedUserAgent === ADMIN_GROUP_ISSUE_USER_AGENT,
  );
  assert.ok(
    groupedSource,
    "source-group list should include the grouped-source sessions",
  );
  assert.equal(
    groupedSource.activeSessions,
    2,
    "source-group list should aggregate active grouped-source sessions",
  );
  assert.equal(
    groupedSource.totalSessions,
    2,
    "source-group list should aggregate the grouped-source session count",
  );
  assert.equal(
    groupedSource.riskLevel,
    "watch",
    "two active sessions from one source should be marked watch risk",
  );
  assert.deepEqual(
    groupedSource.riskSignals,
    ["multiple-active-sessions"],
    "grouped-source watch risk should explain why it was flagged",
  );
  const focusedSourceGroupResponse = await listAdminSessionSourceGroups(
    baseUrl,
    finalAdminHeaders,
    {
      sourceKey: groupedSource.sourceKey,
      page: 1,
      pageSize: 5,
    },
  );
  assert.equal(
    focusedSourceGroupResponse.status,
    200,
    "focused source-group list should succeed",
  );
  assert.equal(
    focusedSourceGroupResponse.body.total,
    1,
    "focused source-group list should narrow to the selected group",
  );
  assert.equal(
    focusedSourceGroupResponse.body.items[0]?.sourceKey,
    groupedSource.sourceKey,
    "focused source-group list should return the selected source group",
  );
  const focusedSessionListResponse = await listAdminSessions(
    baseUrl,
    finalAdminHeaders,
    {
      sourceKey: groupedSource.sourceKey,
      page: 1,
      pageSize: 5,
    },
  );
  assert.equal(
    focusedSessionListResponse.status,
    200,
    "focused admin session list should succeed",
  );
  assert.equal(
    focusedSessionListResponse.body.total,
    2,
    "focused admin session list should narrow to the selected source group",
  );
  assert.ok(
    focusedSessionListResponse.body.items.every(
      (session) =>
        session.issuedFromIp === ADMIN_GROUP_ISSUE_IP &&
        session.issuedUserAgent === ADMIN_GROUP_ISSUE_USER_AGENT,
    ),
    "focused admin session list should only return sessions from the selected source group",
  );
  const sourceGroupSnapshotResponse = await createAdminSessionSourceGroupSnapshot(
    baseUrl,
    {
      sourceKey: groupedSource.sourceKey,
      query: ADMIN_GROUP_ISSUE_USER_AGENT,
    },
    finalAdminHeaders,
  );
  assertSuccessfulPost(
    sourceGroupSnapshotResponse,
    "source-group snapshot should succeed",
  );
  assert.equal(
    sourceGroupSnapshotResponse.body.group.sourceKey,
    groupedSource.sourceKey,
    "source-group snapshot should preserve the selected source key",
  );
  assert.equal(
    sourceGroupSnapshotResponse.body.group.totalSessions,
    2,
    "source-group snapshot should aggregate the filtered group size",
  );
  assert.equal(
    sourceGroupSnapshotResponse.body.group.riskLevel,
    "watch",
    "source-group snapshot should include the computed watch risk",
  );
  assert.equal(
    sourceGroupSnapshotResponse.body.sessions.length,
    2,
    "source-group snapshot should return the filtered session details",
  );
  const refreshReuseSourceGroupResponse = await listAdminSessionSourceGroups(
    baseUrl,
    finalAdminHeaders,
    {
      query: ADMIN_REUSE_USER_AGENT,
      page: 1,
      pageSize: 5,
    },
  );
  assert.equal(
    refreshReuseSourceGroupResponse.status,
    200,
    "refresh-reuse source-group lookup should succeed",
  );
  assert.equal(
    refreshReuseSourceGroupResponse.body.total,
    1,
    "refresh-reuse lookup should narrow to one source group",
  );
  assert.equal(
    refreshReuseSourceGroupResponse.body.items[0]?.riskLevel,
    "critical",
    "refresh token reuse groups should be marked critical",
  );
  assert.deepEqual(
    refreshReuseSourceGroupResponse.body.items[0]?.riskSignals,
    ["refresh-token-reuse"],
    "refresh token reuse groups should explain the critical signal",
  );
  const watchRiskSourceGroupResponse = await listAdminSessionSourceGroups(
    baseUrl,
    finalAdminHeaders,
    {
      query: ADMIN_RISK_ISSUE_USER_AGENT,
      riskLevel: "watch",
      page: 1,
      pageSize: 5,
    },
  );
  assert.equal(
    watchRiskSourceGroupResponse.status,
    200,
    "watch-risk source-group lookup should succeed",
  );
  assert.equal(
    watchRiskSourceGroupResponse.body.total,
    1,
    "watch-risk lookup should narrow to one source group",
  );
  assert.equal(
    watchRiskSourceGroupResponse.body.items[0]?.riskLevel,
    "watch",
    "risk-level filtering should keep watch groups only",
  );
  assert.deepEqual(
    watchRiskSourceGroupResponse.body.items[0]?.riskSignals,
    ["multiple-active-sessions"],
    "watch-risk groups should explain the multiple-session signal",
  );
  const watchRiskSnapshotResponse = await createAdminSessionSourceGroupRiskSnapshot(
    baseUrl,
    {
      query: ADMIN_RISK_ISSUE_USER_AGENT,
      riskLevel: "watch",
    },
    finalAdminHeaders,
  );
  assertSuccessfulPost(
    watchRiskSnapshotResponse,
    "risk-based source-group snapshot should succeed",
  );
  assert.equal(
    watchRiskSnapshotResponse.body.totalGroups,
    1,
    "risk-based source-group snapshot should include the matching watch group",
  );
  assert.equal(
    watchRiskSnapshotResponse.body.totalSessions,
    2,
    "risk-based source-group snapshot should include the grouped watch sessions",
  );
  assert.equal(
    watchRiskSnapshotResponse.body.groups[0]?.riskLevel,
    "watch",
    "risk-based source-group snapshot should preserve the watch risk level",
  );
  const revokeRiskSourceGroupsResponse = await revokeAdminSessionSourceGroupsByRisk(
    baseUrl,
    {
      query: ADMIN_RISK_ISSUE_USER_AGENT,
      riskLevel: "watch",
    },
    finalAdminHeaders,
  );
  assertSuccessfulPost(
    revokeRiskSourceGroupsResponse,
    "risk-based source-group revoke should succeed",
  );
  assert.deepEqual(
    revokeRiskSourceGroupsResponse.body,
    {
      success: true,
      matchedGroupCount: 1,
      revokedGroupCount: 1,
      revokedSessionCount: 2,
      skippedSessionCount: 0,
      revokedCurrentSession: false,
    },
    "risk-based source-group revoke should revoke the matching watch group",
  );
  const riskRevokedSessionsLookupResponse = await listAdminSessions(
    baseUrl,
    finalAdminHeaders,
    {
      status: "revoked",
      query: ADMIN_RISK_ISSUE_USER_AGENT,
      page: 1,
      pageSize: 10,
    },
  );
  assert.equal(
    riskRevokedSessionsLookupResponse.status,
    200,
    "risk-revoked session lookup should succeed",
  );
  assert.equal(
    riskRevokedSessionsLookupResponse.body.total,
    2,
    "risk-based source-group revoke should revoke both watch-group sessions",
  );
  assert.ok(
    riskRevokedSessionsLookupResponse.body.items.every(
      (session) => session.revocationReason === "manual-revocation",
    ),
    "risk-based source-group revoke should record manual-revocation",
  );
  const revokeSourceGroupResponse = await revokeAdminSessionSourceGroup(
    baseUrl,
    {
      sourceKey: groupedSource.sourceKey,
      query: ADMIN_GROUP_ISSUE_USER_AGENT,
    },
    finalAdminHeaders,
  );
  assertSuccessfulPost(
    revokeSourceGroupResponse,
    "source-group revoke should succeed",
  );
  assert.deepEqual(
    revokeSourceGroupResponse.body,
    {
      success: true,
      revokedCount: 2,
      skippedCount: 0,
      revokedCurrentSession: false,
    },
    "source-group revoke should revoke the grouped active sessions only",
  );
  const revokedSourceGroupLookupResponse = await listAdminSessions(
    baseUrl,
    finalAdminHeaders,
    {
      status: "revoked",
      query: ADMIN_GROUP_ISSUE_USER_AGENT,
      page: 1,
      pageSize: 10,
    },
  );
  assert.equal(
    revokedSourceGroupLookupResponse.status,
    200,
    "revoked source-group session lookup should succeed",
  );
  assert.equal(
    revokedSourceGroupLookupResponse.body.total,
    2,
    "source-group revoke should revoke both grouped sessions",
  );
  assert.ok(
    revokedSourceGroupLookupResponse.body.items.every(
      (session) => session.revocationReason === "manual-revocation",
    ),
    "source-group revoke should record manual-revocation for grouped sessions",
  );
  const bulkRevokeSessionsResponse = await revokeAdminSessionsById(
    baseUrl,
    [secondaryActiveSession.id, refreshReuseRevokedSession.id],
    finalAdminHeaders,
  );
  assertSuccessfulPost(
    bulkRevokeSessionsResponse,
    "bulk session revoke should succeed",
  );
  assert.deepEqual(
    bulkRevokeSessionsResponse.body.revokedSessionIds,
    [secondaryActiveSession.id],
    "bulk session revoke should revoke only active sessions",
  );
  assert.deepEqual(
    bulkRevokeSessionsResponse.body.skippedSessionIds,
    [refreshReuseRevokedSession.id],
    "bulk session revoke should report already revoked sessions as skipped",
  );
  const bulkRevokedSessionsLookupResponse = await listAdminSessions(
    baseUrl,
    {
      ...finalAdminHeaders,
      "X-Forwarded-For": ADMIN_ACCESS_IP,
      "User-Agent": ADMIN_ACCESS_USER_AGENT,
    },
    {
      status: "revoked",
      query: ADMIN_SECONDARY_ISSUE_USER_AGENT,
      page: 1,
      pageSize: 5,
    },
  );
  assert.equal(
    bulkRevokedSessionsLookupResponse.status,
    200,
    "bulk-revoked session lookup should succeed",
  );
  assert.equal(
    bulkRevokedSessionsLookupResponse.body.items[0].revocationReason,
    "manual-revocation",
    "bulk session revoke should record manual-revocation",
  );
  assert.equal(
    bulkRevokedSessionsLookupResponse.body.items[0].revokedBySessionId,
    currentSession.id,
    "bulk session revoke should record the acting admin session",
  );

  const revokeByIdResponse = await revokeAdminSessionById(
    baseUrl,
    currentSession.id,
    finalAdminHeaders,
  );
  assertSuccessfulPost(
    revokeByIdResponse,
    "revoking an admin session by id should succeed",
  );
  assert.equal(
    revokeByIdResponse.body.success,
    true,
    "revoking an admin session by id should confirm success",
  );

  const revokedByIdAccessTokenResponse = await apiFetch(
    baseUrl,
    "/admin/cloud/providers",
    {
      headers: finalAdminHeaders,
    },
  );
  assert.equal(
    revokedByIdAccessTokenResponse.status,
    401,
    "revoking a session by id should invalidate the current access token immediately",
  );

  const adminSessionsAfterManualRevokeResponse = await apiFetch(
    baseUrl,
    "/admin/cloud/admin-sessions",
    {
      headers: {
        "X-Admin-Secret": adminSecret,
      },
    },
  );
  assert.equal(
    adminSessionsAfterManualRevokeResponse.status,
    200,
    "legacy admin secret should still be able to inspect session revocation metadata",
  );
  const manuallyRevokedCurrentSession = adminSessionsAfterManualRevokeResponse.body.items.find(
    (session) => session.id === currentSession.id,
  );
  assert.equal(
    manuallyRevokedCurrentSession.revocationReason,
    "manual-revocation",
    "manual revoke-by-id should record the revocation reason",
  );
  assert.equal(
    manuallyRevokedCurrentSession.revokedBySessionId,
    currentSession.id,
    "manual revoke-by-id should record which session performed the revocation",
  );
}

async function waitForWaitingSessionSyncTaskCount(
  baseUrl,
  headers,
  query,
  expectedTotal,
  timeoutMs = 1_500,
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await listWaitingSessionSyncTasks(baseUrl, headers, query);
    assert.equal(
      response.status,
      200,
      "waiting session sync task polling should succeed",
    );
    if (response.body?.total === expectedTotal) {
      return;
    }

    await sleep(50);
  }

  throw new Error(
    `Timed out waiting for waiting session sync task total=${expectedTotal}`,
  );
}
