import type { MigrationInterface, QueryRunner } from "typeorm";

const UP_QUERIES = [
  `CREATE TABLE IF NOT EXISTS "phone_verification_sessions" (
    "id" varchar PRIMARY KEY NOT NULL,
    "phone" varchar NOT NULL,
    "code" varchar NOT NULL,
    "purpose" varchar NOT NULL DEFAULT ('world_access'),
    "expiresAt" datetime NOT NULL,
    "verifiedAt" datetime,
    "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
    "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS "cloud_worlds" (
    "id" varchar PRIMARY KEY NOT NULL,
    "phone" varchar NOT NULL,
    "name" varchar NOT NULL,
    "status" varchar NOT NULL,
    "slug" text,
    "desiredState" varchar NOT NULL DEFAULT ('running'),
    "provisionStrategy" varchar NOT NULL DEFAULT ('mock'),
    "providerKey" text,
    "providerRegion" text,
    "providerZone" text,
    "runtimeVersion" text,
    "apiBaseUrl" text,
    "adminUrl" text,
    "callbackToken" text,
    "healthStatus" text,
    "healthMessage" text,
    "lastAccessedAt" datetime,
    "lastInteractiveAt" datetime,
    "lastBootedAt" datetime,
    "lastHeartbeatAt" datetime,
    "lastSuspendedAt" datetime,
    "failureCode" text,
    "failureMessage" text,
    "retryCount" integer NOT NULL DEFAULT (0),
    "note" text,
    "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
    "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cloud_worlds_phone" ON "cloud_worlds" ("phone")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cloud_worlds_slug" ON "cloud_worlds" ("slug")`,
  `CREATE TABLE IF NOT EXISTS "cloud_world_requests" (
    "id" varchar PRIMARY KEY NOT NULL,
    "phone" varchar NOT NULL,
    "worldName" varchar NOT NULL,
    "status" varchar NOT NULL,
    "note" text,
    "source" varchar NOT NULL DEFAULT ('app'),
    "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
    "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS "IDX_cloud_world_requests_phone" ON "cloud_world_requests" ("phone")`,
  `CREATE TABLE IF NOT EXISTS "cloud_instances" (
    "id" varchar PRIMARY KEY NOT NULL,
    "worldId" varchar NOT NULL,
    "providerKey" varchar NOT NULL DEFAULT ('mock'),
    "providerInstanceId" text,
    "providerVolumeId" text,
    "providerSnapshotId" text,
    "name" varchar NOT NULL,
    "region" text,
    "zone" text,
    "privateIp" text,
    "publicIp" text,
    "powerState" varchar NOT NULL DEFAULT ('absent'),
    "imageId" text,
    "flavor" text,
    "diskSizeGb" integer NOT NULL DEFAULT (20),
    "launchConfig" text,
    "bootstrappedAt" datetime,
    "lastHeartbeatAt" datetime,
    "lastOperationAt" datetime,
    "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
    "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cloud_instances_worldId" ON "cloud_instances" ("worldId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cloud_instances_providerInstanceId" ON "cloud_instances" ("providerInstanceId")`,
  `CREATE TABLE IF NOT EXISTS "world_access_sessions" (
    "id" varchar PRIMARY KEY NOT NULL,
    "worldId" varchar NOT NULL,
    "phone" varchar NOT NULL,
    "status" varchar NOT NULL,
    "phase" varchar NOT NULL,
    "displayStatus" text NOT NULL,
    "resolvedApiBaseUrl" text,
    "retryAfterSeconds" integer NOT NULL DEFAULT (2),
    "estimatedWaitSeconds" integer,
    "failureReason" text,
    "clientPlatform" text,
    "clientVersion" text,
    "expiresAt" datetime,
    "resolvedAt" datetime,
    "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
    "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS "IDX_world_access_sessions_worldId" ON "world_access_sessions" ("worldId")`,
  `CREATE INDEX IF NOT EXISTS "IDX_world_access_sessions_phone" ON "world_access_sessions" ("phone")`,
  `CREATE INDEX IF NOT EXISTS "IDX_world_access_sessions_status" ON "world_access_sessions" ("status")`,
  `CREATE TABLE IF NOT EXISTS "world_lifecycle_jobs" (
    "id" varchar PRIMARY KEY NOT NULL,
    "worldId" varchar NOT NULL,
    "jobType" varchar NOT NULL,
    "status" varchar NOT NULL,
    "priority" integer NOT NULL DEFAULT (100),
    "payload" text,
    "attempt" integer NOT NULL DEFAULT (0),
    "maxAttempts" integer NOT NULL DEFAULT (3),
    "leaseOwner" text,
    "leaseExpiresAt" datetime,
    "availableAt" datetime,
    "startedAt" datetime,
    "finishedAt" datetime,
    "failureCode" text,
    "failureMessage" text,
    "resultPayload" text,
    "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
    "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS "IDX_world_lifecycle_jobs_worldId" ON "world_lifecycle_jobs" ("worldId")`,
  `CREATE INDEX IF NOT EXISTS "IDX_world_lifecycle_jobs_status" ON "world_lifecycle_jobs" ("status")`,
];

const DOWN_QUERIES = [
  `DROP INDEX IF EXISTS "IDX_world_lifecycle_jobs_status"`,
  `DROP INDEX IF EXISTS "IDX_world_lifecycle_jobs_worldId"`,
  `DROP TABLE IF EXISTS "world_lifecycle_jobs"`,
  `DROP INDEX IF EXISTS "IDX_world_access_sessions_status"`,
  `DROP INDEX IF EXISTS "IDX_world_access_sessions_phone"`,
  `DROP INDEX IF EXISTS "IDX_world_access_sessions_worldId"`,
  `DROP TABLE IF EXISTS "world_access_sessions"`,
  `DROP INDEX IF EXISTS "IDX_cloud_instances_providerInstanceId"`,
  `DROP INDEX IF EXISTS "IDX_cloud_instances_worldId"`,
  `DROP TABLE IF EXISTS "cloud_instances"`,
  `DROP INDEX IF EXISTS "IDX_cloud_world_requests_phone"`,
  `DROP TABLE IF EXISTS "cloud_world_requests"`,
  `DROP INDEX IF EXISTS "IDX_cloud_worlds_slug"`,
  `DROP INDEX IF EXISTS "IDX_cloud_worlds_phone"`,
  `DROP TABLE IF EXISTS "cloud_worlds"`,
  `DROP TABLE IF EXISTS "phone_verification_sessions"`,
];

export class CreateCloudPlatformSchema1776645000000 implements MigrationInterface {
  name = "CreateCloudPlatformSchema1776645000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const query of UP_QUERIES) {
      await queryRunner.query(query);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const query of DOWN_QUERIES) {
      await queryRunner.query(query);
    }
  }
}
