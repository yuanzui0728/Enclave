import type { TypeOrmModuleOptions } from "@nestjs/typeorm";
import type { DataSourceOptions } from "typeorm";
import { CloudAdminSessionEntity } from "../entities/cloud-admin-session.entity";
import { CloudInstanceEntity } from "../entities/cloud-instance.entity";
import { CloudWorldRequestEntity } from "../entities/cloud-world-request.entity";
import { CloudWorldEntity } from "../entities/cloud-world.entity";
import { PhoneVerificationSessionEntity } from "../entities/phone-verification-session.entity";
import { WaitingSessionSyncTaskEntity } from "../entities/waiting-session-sync-task.entity";
import { WorldAccessSessionEntity } from "../entities/world-access-session.entity";
import { WorldLifecycleJobEntity } from "../entities/world-lifecycle-job.entity";
import { CreateCloudPlatformSchema1776645000000 } from "./migrations/1776645000000-create-cloud-platform-schema";
import { CreateCloudAdminSessionTable1776645600000 } from "./migrations/1776645600000-create-cloud-admin-session-table";
import { AddCloudAdminSessionAuditColumns1776646200000 } from "./migrations/1776646200000-add-cloud-admin-session-audit-columns";
import { AddCloudAdminSessionRevocationMetadata1776647400000 } from "./migrations/1776647400000-add-cloud-admin-session-revocation-metadata";
import { CreateWaitingSessionSyncTaskTable1776648600000 } from "./migrations/1776648600000-create-waiting-session-sync-task-table";
import { AddWaitingSessionSyncTaskStatusColumns1776649800000 } from "./migrations/1776649800000-add-waiting-session-sync-task-status-columns";
import { AddActiveWorldLifecycleJobUniqueIndex1776650400000 } from "./migrations/1776650400000-add-active-world-lifecycle-job-unique-index";
import { resolveCloudDatabasePath } from "../config/cloud-runtime-config";

type ConfigReader = {
  get<T = string>(propertyPath: string): T | undefined;
};

export const cloudEntities = [
  CloudAdminSessionEntity,
  PhoneVerificationSessionEntity,
  CloudWorldEntity,
  CloudWorldRequestEntity,
  CloudInstanceEntity,
  WorldAccessSessionEntity,
  WaitingSessionSyncTaskEntity,
  WorldLifecycleJobEntity,
] as const;

export const cloudMigrations = [
  CreateCloudPlatformSchema1776645000000,
  CreateCloudAdminSessionTable1776645600000,
  AddCloudAdminSessionAuditColumns1776646200000,
  AddCloudAdminSessionRevocationMetadata1776647400000,
  CreateWaitingSessionSyncTaskTable1776648600000,
  AddWaitingSessionSyncTaskStatusColumns1776649800000,
  AddActiveWorldLifecycleJobUniqueIndex1776650400000,
];

export function buildCloudDataSourceOptions(config: ConfigReader): DataSourceOptions {
  return {
    type: "better-sqlite3",
    database: resolveCloudDatabasePath(config),
    entities: [...cloudEntities],
    migrations: [...cloudMigrations],
    migrationsRun: true,
    synchronize: false,
  };
}

export function buildCloudTypeOrmOptions(config: ConfigReader): TypeOrmModuleOptions {
  return buildCloudDataSourceOptions(config);
}
