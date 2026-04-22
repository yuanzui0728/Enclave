import "reflect-metadata";

import assert from "node:assert/strict";
import test from "node:test";
import { DataSource } from "typeorm";
import {
  CLOUD_ADMIN_JWT_AUDIENCE_DEFAULT,
  CLOUD_ADMIN_REFRESH_JWT_AUDIENCE_DEFAULT,
  CLOUD_CLIENT_JWT_AUDIENCE_DEFAULT,
  CLOUD_JWT_ISSUER_DEFAULT,
} from "../src/auth/cloud-jwt.constants";
import {
  DEFAULT_DEV_CLOUD_ADMIN_SECRET,
  DEFAULT_DEV_CLOUD_JWT_SECRET,
  isStrictSecretValidationEnabled,
  parseJwtDurationToMs,
  resolveCloudAdminSecret,
  resolveCloudAdminJwtAudience,
  resolveCloudAdminRefreshJwtAudience,
  resolveCloudAdminRefreshTokenTtl,
  resolveCloudAdminTokenTtl,
  resolveCloudClientJwtAudience,
  resolveCloudJwtIssuer,
  resolveCloudJwtSecret,
} from "../src/config/cloud-runtime-config";
import { buildCloudDataSourceOptions } from "../src/database/cloud-database.config";

function createConfig(values: Record<string, string | undefined>) {
  return {
    get<T = string>(propertyPath: string): T | undefined {
      return values[propertyPath] as T | undefined;
    },
  };
}

test("development config falls back to dev secrets when explicit values are absent", () => {
  const config = createConfig({
    NODE_ENV: "development",
  });

  assert.equal(isStrictSecretValidationEnabled(config), false);
  assert.equal(resolveCloudJwtSecret(config), DEFAULT_DEV_CLOUD_JWT_SECRET);
  assert.equal(resolveCloudAdminSecret(config), DEFAULT_DEV_CLOUD_ADMIN_SECRET);
});

test("production config rejects missing or weak cloud secrets", () => {
  const missingSecrets = createConfig({
    NODE_ENV: "production",
  });
  assert.throws(() => resolveCloudJwtSecret(missingSecrets), /CLOUD_JWT_SECRET is required/);
  assert.throws(() => resolveCloudAdminSecret(missingSecrets), /CLOUD_ADMIN_SECRET is required/);

  const weakSecrets = createConfig({
    NODE_ENV: "production",
    CLOUD_JWT_SECRET: "too-short",
    CLOUD_ADMIN_SECRET: DEFAULT_DEV_CLOUD_ADMIN_SECRET,
  });
  assert.throws(() => resolveCloudJwtSecret(weakSecrets), /at least 24 characters/);
  assert.throws(() => resolveCloudAdminSecret(weakSecrets), /must not use the development default/);
});

test("admin token ttl resolves to a short-lived default", () => {
  const defaultConfig = createConfig({});
  assert.equal(resolveCloudAdminTokenTtl(defaultConfig), "15m");
  assert.equal(parseJwtDurationToMs(resolveCloudAdminTokenTtl(defaultConfig)), 15 * 60 * 1000);
  assert.equal(resolveCloudAdminRefreshTokenTtl(defaultConfig), "7d");
  assert.equal(
    parseJwtDurationToMs(resolveCloudAdminRefreshTokenTtl(defaultConfig)),
    7 * 24 * 60 * 60 * 1000,
  );

  const customConfig = createConfig({
    CLOUD_ADMIN_TOKEN_TTL: "45m",
    CLOUD_ADMIN_REFRESH_TOKEN_TTL: "14d",
  });
  assert.equal(resolveCloudAdminTokenTtl(customConfig), "45m");
  assert.equal(parseJwtDurationToMs(resolveCloudAdminTokenTtl(customConfig)), 45 * 60 * 1000);
  assert.equal(resolveCloudAdminRefreshTokenTtl(customConfig), "14d");
  assert.equal(
    parseJwtDurationToMs(resolveCloudAdminRefreshTokenTtl(customConfig)),
    14 * 24 * 60 * 60 * 1000,
  );
});

test("cloud jwt issuer and audiences have stable defaults and support overrides", () => {
  const defaultConfig = createConfig({});
  assert.equal(resolveCloudJwtIssuer(defaultConfig), CLOUD_JWT_ISSUER_DEFAULT);
  assert.equal(
    resolveCloudClientJwtAudience(defaultConfig),
    CLOUD_CLIENT_JWT_AUDIENCE_DEFAULT,
  );
  assert.equal(
    resolveCloudAdminJwtAudience(defaultConfig),
    CLOUD_ADMIN_JWT_AUDIENCE_DEFAULT,
  );
  assert.equal(
    resolveCloudAdminRefreshJwtAudience(defaultConfig),
    CLOUD_ADMIN_REFRESH_JWT_AUDIENCE_DEFAULT,
  );

  const customConfig = createConfig({
    CLOUD_JWT_ISSUER: "cloud-api-prod",
    CLOUD_CLIENT_JWT_AUDIENCE: "cloud-client-prod",
    CLOUD_ADMIN_JWT_AUDIENCE: "cloud-admin-prod",
    CLOUD_ADMIN_REFRESH_JWT_AUDIENCE: "cloud-admin-refresh-prod",
  });
  assert.equal(resolveCloudJwtIssuer(customConfig), "cloud-api-prod");
  assert.equal(resolveCloudClientJwtAudience(customConfig), "cloud-client-prod");
  assert.equal(resolveCloudAdminJwtAudience(customConfig), "cloud-admin-prod");
  assert.equal(
    resolveCloudAdminRefreshJwtAudience(customConfig),
    "cloud-admin-refresh-prod",
  );
});

test("cloud database options run migrations instead of synchronize", async (t) => {
  const dataSource = new DataSource(
    buildCloudDataSourceOptions(
      createConfig({
        CLOUD_DATABASE_PATH: ":memory:",
      }),
    ),
  );

  await dataSource.initialize();
  t.after(async () => {
    await dataSource.destroy();
  });

  const tables = await dataSource.query(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      "cloud_admin_sessions",
      "phone_verification_sessions",
      "cloud_worlds",
      "cloud_world_requests",
      "cloud_instances",
      "world_access_sessions",
      "waiting_session_sync_tasks",
      "world_lifecycle_jobs",
      "migrations",
    ],
  );

  assert.deepEqual(
    tables
      .map((row: { name: string }) => row.name)
      .sort(),
    [
      "cloud_admin_sessions",
      "cloud_instances",
      "cloud_world_requests",
      "cloud_worlds",
      "migrations",
      "phone_verification_sessions",
      "waiting_session_sync_tasks",
      "world_access_sessions",
      "world_lifecycle_jobs",
    ],
  );

  const adminSessionColumns = await dataSource.query(
    "PRAGMA table_info('cloud_admin_sessions')",
  );
  assert.deepEqual(
    adminSessionColumns
      .map((row: { name: string }) => row.name)
      .filter((name: string) =>
        [
          "issuedFromIp",
          "issuedUserAgent",
          "lastUsedIp",
          "lastUsedUserAgent",
          "revokedBySessionId",
          "revocationReason",
        ].includes(name),
      )
      .sort(),
    [
      "issuedFromIp",
      "issuedUserAgent",
      "lastUsedIp",
      "lastUsedUserAgent",
      "revocationReason",
      "revokedBySessionId",
    ],
  );

  const waitingSyncTaskColumns = await dataSource.query(
    "PRAGMA table_info('waiting_session_sync_tasks')",
  );
  assert.deepEqual(
    waitingSyncTaskColumns
      .map((row: { name: string }) => row.name)
      .filter((name: string) =>
        [
          "status",
          "finishedAt",
          "taskKey",
          "taskType",
          "targetValue",
        ].includes(name),
      )
      .sort(),
    ["finishedAt", "status", "targetValue", "taskKey", "taskType"],
  );

  const activeLifecycleJobIndex = await dataSource.query(
    "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name = ?",
    ["IDX_world_lifecycle_jobs_active_world"],
  );
  assert.equal(activeLifecycleJobIndex.length, 1);
  assert.match(
    activeLifecycleJobIndex[0]?.sql ?? "",
    /ON "world_lifecycle_jobs" \("worldId"\) WHERE "status" IN \('pending', 'running'\) AND "jobType" IN \('provision', 'resume', 'suspend'\)/,
  );
});
