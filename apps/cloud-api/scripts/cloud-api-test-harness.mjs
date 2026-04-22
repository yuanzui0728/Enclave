import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { access, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const packageDir = resolve(dirname(__filename), "..");
const repoRoot = resolve(packageDir, "..", "..");
const serverEntry = resolve(
  packageDir,
  "dist",
  "apps",
  "cloud-api",
  "src",
  "main.js",
);
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const PRESERVE_TMP_ENV = "YINJIE_TEST_PRESERVE_TMP";

export async function startEphemeralCloudApi(options = {}) {
  await ensureBuiltServerEntry();

  const tempDir = await mkdtemp(
    join(tmpdir(), options.tempPrefix ?? "yinjie-cloud-api-test-"),
  );
  const databasePath = join(
    tempDir,
    options.databaseFileName ?? "cloud-api-test.sqlite",
  );
  const port = options.port ?? (await getAvailablePort());
  const baseUrl = `http://127.0.0.1:${port}`;
  const adminSecret = options.adminSecret ?? "cloud-e2e-admin-secret";
  const jwtSecret = options.jwtSecret ?? "cloud-e2e-jwt-secret";
  const authTokenTtl = options.authTokenTtl ?? "1h";

  const stdout = [];
  const stderr = [];
  const preserveTempDir =
    options.preserveTempDir === true || process.env[PRESERVE_TMP_ENV] === "1";
  const child = spawn(process.execPath, [serverEntry], {
    cwd: packageDir,
    env: {
      ...process.env,
      PORT: String(port),
      CLOUD_DATABASE_PATH: databasePath,
      CLOUD_ADMIN_SECRET: adminSecret,
      CLOUD_JWT_SECRET: jwtSecret,
      CLOUD_AUTH_TOKEN_TTL: authTokenTtl,
      ...(options.env ?? {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout.on("data", (chunk) => {
    stdout.push(chunk.toString());
  });
  child.stderr.on("data", (chunk) => {
    stderr.push(chunk.toString());
  });

  const server = {
    child,
    stdout,
    stderr,
    tempDir,
    databasePath,
    port,
    baseUrl,
    adminSecret,
    jwtSecret,
    authTokenTtl,
    preserveTempDir,
    async cleanup() {
      await stopCloudApi(server);
      if (preserveTempDir) {
        await persistCloudApiHarnessArtifacts(server);
        return;
      }

      await rm(tempDir, { recursive: true, force: true });
    },
  };

  await waitForCloudApiReady(server);
  return server;
}

async function persistCloudApiHarnessArtifacts(serverState) {
  await Promise.all([
    writeFile(
      join(serverState.tempDir, "cloud-api.stdout.log"),
      serverState.stdout.join(""),
      "utf8",
    ),
    writeFile(
      join(serverState.tempDir, "cloud-api.stderr.log"),
      serverState.stderr.join(""),
      "utf8",
    ),
    writeFile(
      join(serverState.tempDir, "cloud-api.harness.json"),
      JSON.stringify(
        {
          baseUrl: serverState.baseUrl,
          port: serverState.port,
          databasePath: serverState.databasePath,
          adminSecret: serverState.adminSecret,
          authTokenTtl: serverState.authTokenTtl,
        },
        null,
        2,
      ),
      "utf8",
    ),
  ]);
}

export async function stopCloudApi(serverState) {
  if (serverState.child.exitCode !== null) {
    return;
  }

  serverState.child.kill("SIGTERM");

  const deadline = Date.now() + 5_000;
  while (serverState.child.exitCode === null && Date.now() < deadline) {
    await sleep(100);
  }

  if (serverState.child.exitCode === null) {
    serverState.child.kill("SIGKILL");
  }
}

export async function waitForCloudApiReady(serverState, options = {}) {
  const deadline = Date.now() + (options.timeoutMs ?? 15_000);
  let lastError = null;

  while (Date.now() < deadline) {
    if (serverState.child.exitCode !== null) {
      throw new Error(
        `cloud-api exited early with code ${serverState.child.exitCode}\nstdout:\n${serverState.stdout.join("")}\nstderr:\n${serverState.stderr.join("")}`,
      );
    }

    try {
      const response = await apiFetch(
        serverState.baseUrl,
        "/admin/cloud/providers",
        {
          headers: {
            "X-Admin-Secret": serverState.adminSecret,
          },
        },
      );
      if (response.status === 200) {
        return;
      }

      lastError = new Error(`unexpected readiness status ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(200);
  }

  throw new Error(
    `cloud-api did not become ready in time: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }\nstdout:\n${serverState.stdout.join("")}\nstderr:\n${serverState.stderr.join("")}`,
  );
}

export async function apiFetch(baseUrl, path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  let body = options.body;

  if (body !== undefined && body !== null && typeof body !== "string") {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body,
  });

  const rawBody = await response.text();
  return {
    status: response.status,
    requestId: response.headers.get("X-Request-Id") ?? null,
    body: parseJsonBody(rawBody),
  };
}

export function assertSuccessfulPost(response, message) {
  assert.ok(
    response.status === 200 || response.status === 201,
    `${message}: received ${response.status}`,
  );
}

export async function issueAdminAccessToken(baseUrl, adminSecret, headers = {}) {
  return apiFetch(baseUrl, "/admin/cloud/auth/token", {
    method: "POST",
    headers: {
      "X-Admin-Secret": adminSecret,
      ...headers,
    },
  });
}

export async function createAdminAuthHeaders(baseUrl, adminSecret, headers = {}) {
  const response = await issueAdminAccessToken(baseUrl, adminSecret, headers);
  assertSuccessfulPost(response, "admin token issuance should succeed");
  assert.ok(
    response.body?.accessToken,
    "admin token issuance should return an access token",
  );

  return {
    Authorization: `Bearer ${response.body.accessToken}`,
  };
}

export async function refreshAdminAccessToken(baseUrl, refreshToken, headers = {}) {
  return apiFetch(baseUrl, "/admin/cloud/auth/refresh", {
    method: "POST",
    headers,
    body: {
      refreshToken,
    },
  });
}

export async function revokeAdminSession(baseUrl, refreshToken, headers = {}) {
  return apiFetch(baseUrl, "/admin/cloud/auth/logout", {
    method: "POST",
    headers,
    body: {
      refreshToken,
    },
  });
}

function buildQueryString(params = {}) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export async function listAdminSessions(baseUrl, headers, query) {
  return apiFetch(
    baseUrl,
    `/admin/cloud/admin-sessions${buildQueryString(query)}`,
    {
      headers,
    },
  );
}

export async function listAdminSessionSourceGroups(baseUrl, headers, query) {
  return apiFetch(
    baseUrl,
    `/admin/cloud/admin-session-source-groups${buildQueryString(query)}`,
    {
      headers,
    },
  );
}

export async function listWaitingSessionSyncTasks(baseUrl, headers, query) {
  return apiFetch(
    baseUrl,
    `/admin/cloud/waiting-session-sync-tasks${buildQueryString(query)}`,
    {
      headers,
    },
  );
}

export async function listJobs(baseUrl, headers, query) {
  return apiFetch(baseUrl, `/admin/cloud/jobs${buildQueryString(query)}`, {
    headers,
  });
}

export async function replayFailedWaitingSessionSyncTasks(
  baseUrl,
  taskIds,
  headers,
) {
  return apiFetch(
    baseUrl,
    "/admin/cloud/waiting-session-sync-tasks/replay-failed",
    {
      method: "POST",
      headers,
      body: {
        taskIds,
      },
    },
  );
}

export async function clearFailedWaitingSessionSyncTasks(
  baseUrl,
  taskIds,
  headers,
) {
  return apiFetch(
    baseUrl,
    "/admin/cloud/waiting-session-sync-tasks/clear-failed",
    {
      method: "POST",
      headers,
      body: {
        taskIds,
      },
    },
  );
}

export async function replayFilteredFailedWaitingSessionSyncTasks(
  baseUrl,
  payload,
  headers,
) {
  return apiFetch(
    baseUrl,
    "/admin/cloud/waiting-session-sync-tasks/replay-filtered-failed",
    {
      method: "POST",
      headers,
      body: payload ?? {},
    },
  );
}

export async function clearFilteredFailedWaitingSessionSyncTasks(
  baseUrl,
  payload,
  headers,
) {
  return apiFetch(
    baseUrl,
    "/admin/cloud/waiting-session-sync-tasks/clear-filtered-failed",
    {
      method: "POST",
      headers,
      body: payload ?? {},
    },
  );
}

export async function revokeAdminSessionById(baseUrl, sessionId, headers) {
  return apiFetch(baseUrl, `/admin/cloud/admin-sessions/${sessionId}/revoke`, {
    method: "POST",
    headers,
  });
}

export async function revokeAdminSessionsById(baseUrl, sessionIds, headers) {
  return apiFetch(baseUrl, "/admin/cloud/admin-sessions/revoke", {
    method: "POST",
    headers,
    body: {
      sessionIds,
    },
  });
}

export async function revokeFilteredAdminSessions(baseUrl, filter, headers) {
  return apiFetch(baseUrl, "/admin/cloud/admin-sessions/revoke-filtered", {
    method: "POST",
    headers,
    body: filter ?? {},
  });
}

export async function revokeAdminSessionSourceGroup(
  baseUrl,
  payload,
  headers,
) {
  return apiFetch(baseUrl, "/admin/cloud/admin-session-source-groups/revoke", {
    method: "POST",
    headers,
    body: payload,
  });
}

export async function createAdminSessionSourceGroupSnapshot(
  baseUrl,
  payload,
  headers,
) {
  return apiFetch(
    baseUrl,
    "/admin/cloud/admin-session-source-groups/snapshot",
    {
      method: "POST",
      headers,
      body: payload,
    },
  );
}

export async function createAdminSessionSourceGroupRiskSnapshot(
  baseUrl,
  payload,
  headers,
) {
  return apiFetch(
    baseUrl,
    "/admin/cloud/admin-session-source-groups/risk-snapshot",
    {
      method: "POST",
      headers,
      body: payload,
    },
  );
}

export async function revokeAdminSessionSourceGroupsByRisk(
  baseUrl,
  payload,
  headers,
) {
  return apiFetch(
    baseUrl,
    "/admin/cloud/admin-session-source-groups/revoke-risk",
    {
      method: "POST",
      headers,
      body: payload,
    },
  );
}

export function seedWaitingSessionSyncTask(databasePath, overrides = {}) {
  const now = new Date().toISOString();
  const record = {
    id: randomUUID(),
    taskKey: `refresh-world:${randomUUID()}`,
    taskType: "refresh_world",
    targetValue: `world-${randomUUID()}`,
    context: "cloud-api-e2e.seed",
    attempt: 3,
    maxAttempts: 3,
    status: "failed",
    availableAt: now,
    leaseOwner: null,
    leaseExpiresAt: null,
    lastError: "seeded waiting session sync failure",
    finishedAt: now,
    ...overrides,
  };
  const database = new Database(databasePath);

  try {
    database
      .prepare(
        `INSERT INTO waiting_session_sync_tasks (
          id,
          taskKey,
          taskType,
          targetValue,
          context,
          attempt,
          maxAttempts,
          status,
          availableAt,
          leaseOwner,
          leaseExpiresAt,
          lastError,
          finishedAt
        ) VALUES (
          @id,
          @taskKey,
          @taskType,
          @targetValue,
          @context,
          @attempt,
          @maxAttempts,
          @status,
          @availableAt,
          @leaseOwner,
          @leaseExpiresAt,
          @lastError,
          @finishedAt
        )`,
      )
      .run({
        ...record,
        availableAt: normalizeSqliteDateTime(record.availableAt),
        leaseExpiresAt: normalizeSqliteDateTime(record.leaseExpiresAt),
        finishedAt: normalizeSqliteDateTime(record.finishedAt),
      });
  } finally {
    database.close();
  }

  return record;
}

export function seedLifecycleJob(databasePath, overrides = {}) {
  const now = new Date().toISOString();
  const record = {
    id: randomUUID(),
    worldId: randomUUID(),
    jobType: "resume",
    status: "cancelled",
    priority: 100,
    payload: { source: "cloud-api-e2e.seed" },
    attempt: 0,
    maxAttempts: 3,
    leaseOwner: null,
    leaseExpiresAt: null,
    availableAt: null,
    startedAt: null,
    finishedAt: now,
    failureCode: "superseded_by_new_job",
    failureMessage: "Seeded lifecycle job was superseded by a newer request.",
    resultPayload: {
      action: "superseded_by_new_job",
      supersededByJobType: "resume",
      supersededByPayload: { source: "cloud-api-e2e.seed" },
    },
    ...overrides,
  };
  const database = new Database(databasePath);

  try {
    database
      .prepare(
        `INSERT INTO world_lifecycle_jobs (
          id,
          worldId,
          jobType,
          status,
          priority,
          payload,
          attempt,
          maxAttempts,
          leaseOwner,
          leaseExpiresAt,
          availableAt,
          startedAt,
          finishedAt,
          failureCode,
          failureMessage,
          resultPayload
        ) VALUES (
          @id,
          @worldId,
          @jobType,
          @status,
          @priority,
          @payload,
          @attempt,
          @maxAttempts,
          @leaseOwner,
          @leaseExpiresAt,
          @availableAt,
          @startedAt,
          @finishedAt,
          @failureCode,
          @failureMessage,
          @resultPayload
        )`,
      )
      .run({
        ...record,
        payload:
          record.payload === null || record.payload === undefined
            ? null
            : JSON.stringify(record.payload),
        leaseExpiresAt: normalizeSqliteDateTime(record.leaseExpiresAt),
        availableAt: normalizeSqliteDateTime(record.availableAt),
        startedAt: normalizeSqliteDateTime(record.startedAt),
        finishedAt: normalizeSqliteDateTime(record.finishedAt),
        resultPayload:
          record.resultPayload === null || record.resultPayload === undefined
            ? null
            : JSON.stringify(record.resultPayload),
      });
  } finally {
    database.close();
  }

  return record;
}

function parseJsonBody(rawBody) {
  if (!rawBody) {
    return null;
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    return rawBody;
  }
}

function normalizeSqliteDateTime(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

async function ensureBuiltServerEntry() {
  let serverEntryStats = null;
  try {
    await access(serverEntry, fsConstants.F_OK);
    serverEntryStats = await stat(serverEntry);
  } catch {
    await buildCloudApi();
    return;
  }

  const newestSourceMtime = await getNewestPathMtime([
    resolve(packageDir, "src"),
    resolve(packageDir, "package.json"),
    resolve(packageDir, "tsconfig.json"),
    resolve(repoRoot, "packages", "contracts", "src"),
  ]);

  if (newestSourceMtime > serverEntryStats.mtimeMs) {
    await buildCloudApi();
  }
}

async function buildCloudApi() {
  const stdout = [];
  const stderr = [];

  await new Promise((resolveBuild, rejectBuild) => {
    const child = spawn(
      pnpmCommand,
      ["--filter", "@yinjie/cloud-api", "build"],
      {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );

    child.stdout.on("data", (chunk) => {
      stdout.push(chunk.toString());
    });
    child.stderr.on("data", (chunk) => {
      stderr.push(chunk.toString());
    });
    child.once("error", rejectBuild);
    child.once("exit", (code) => {
      if (code === 0) {
        resolveBuild();
        return;
      }

      rejectBuild(
        new Error(
          `cloud-api build failed with code ${code}\nstdout:\n${stdout.join("")}\nstderr:\n${stderr.join("")}`,
        ),
      );
    });
  });
}

async function getNewestPathMtime(paths) {
  let newestMtime = 0;

  for (const targetPath of paths) {
    try {
      const targetStat = await stat(targetPath);
      if (targetStat.isDirectory()) {
        newestMtime = Math.max(
          newestMtime,
          await getNewestDirectoryMtime(targetPath),
        );
      } else {
        newestMtime = Math.max(newestMtime, targetStat.mtimeMs);
      }
    } catch {
      continue;
    }
  }

  return newestMtime;
}

async function getNewestDirectoryMtime(directoryPath) {
  let newestMtime = 0;
  const entries = await readdir(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = resolve(directoryPath, entry.name);
    if (entry.isDirectory()) {
      newestMtime = Math.max(newestMtime, await getNewestDirectoryMtime(entryPath));
      continue;
    }

    const entryStat = await stat(entryPath);
    newestMtime = Math.max(newestMtime, entryStat.mtimeMs);
  }

  return newestMtime;
}

async function getAvailablePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => {
          reject(new Error("failed to resolve an ephemeral port"));
        });
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolvePort(address.port);
      });
    });
  });
}
