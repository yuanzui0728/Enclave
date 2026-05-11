import type { TypeOrmModuleOptions } from "@nestjs/typeorm";
import type { DataSourceOptions } from "typeorm";
import { ClientTelemetryDailyEntity } from "../entities/client-telemetry-daily.entity";
import { ClientTelemetryEventEntity } from "../entities/client-telemetry-event.entity";
import { CloudAdminSessionEntity } from "../entities/cloud-admin-session.entity";
import { CloudConfigEntity } from "../entities/cloud-config.entity";
import { CloudFeedbackEntity } from "../entities/cloud-feedback.entity";
import { CloudInstanceEntity } from "../entities/cloud-instance.entity";
import { CloudTokenPricingCatalogEntity } from "../entities/cloud-token-pricing-catalog.entity";
import { CloudTokenUsageBreakdownDailyEntity } from "../entities/cloud-token-usage-breakdown-daily.entity";
import { CloudTokenUsageBudgetEntity } from "../entities/cloud-token-usage-budget.entity";
import { CloudTokenUsageDailyEntity } from "../entities/cloud-token-usage-daily.entity";
import { CloudUserOAuthIdentityEntity } from "../entities/cloud-user-oauth-identity.entity";
import { CloudUserEntity } from "../entities/cloud-user.entity";
import { CloudWorldRequestEntity } from "../entities/cloud-world-request.entity";
import { CloudWorldEntity } from "../entities/cloud-world.entity";
import { EmailVerificationSessionEntity } from "../entities/email-verification-session.entity";
import { InviteCodeEntity } from "../entities/invite-code.entity";
import { InviteRedemptionEntity } from "../entities/invite-redemption.entity";
import { PhoneVerificationSessionEntity } from "../entities/phone-verification-session.entity";
import { RevenueAllocationLedgerEntity } from "../entities/revenue-allocation-ledger.entity";
import { RevenueContributionEventEntity } from "../entities/revenue-contribution-event.entity";
import { RevenuePayeeEntity } from "../entities/revenue-payee.entity";
import { RevenueSettlementBatchEntity } from "../entities/revenue-settlement-batch.entity";
import { RevenueSharingPolicyEntity } from "../entities/revenue-sharing-policy.entity";
import { RevenueUsageEventEntity } from "../entities/revenue-usage-event.entity";
import { SubscriptionPlanEntity } from "../entities/subscription-plan.entity";
import { UserSubscriptionEntity } from "../entities/user-subscription.entity";
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
import { CreateCloudUserAndSubscriptionTables1776651000000 } from "./migrations/1776651000000-create-cloud-user-and-subscription-tables";
import { CreateInviteAndConfigTables1776651600000 } from "./migrations/1776651600000-create-invite-and-config-tables";
import { SeedDefaultSubscriptionPlansAndConfigs1776652200000 } from "./migrations/1776652200000-seed-default-subscription-plans-and-configs";
import { CreateRevenueSharingTables1776652800000 } from "./migrations/1776652800000-create-revenue-sharing-tables";
import { AddEmailAuth1776653400000 } from "./migrations/1776653400000-add-email-auth";
import { CreateCloudFeedbackTable1776654000000 } from "./migrations/1776654000000-create-cloud-feedback-table";
import { MakeCloudUsersPhoneNullable1776654600000 } from "./migrations/1776654600000-make-cloud-users-phone-nullable";
import { UpdateAppPublicBaseUrl1776655200000 } from "./migrations/1776655200000-update-app-public-base-url";
import { CreateTelemetryTables1776655800000 } from "./migrations/1776655800000-create-telemetry-tables";
import { AddWorldIdToTelemetry1776656400000 } from "./migrations/1776656400000-add-world-id-to-telemetry";
import { CreateCloudTokenUsageTables1776657000000 } from "./migrations/1776657000000-create-cloud-token-usage-tables";
import { CreateCloudUserOAuthIdentities1776657600000 } from "./migrations/1776657600000-create-cloud-user-oauth-identities";
import { AddCloudUserLastLoginIp1776658200000 } from "./migrations/1776658200000-add-cloud-user-last-login-ip";
import { resolveCloudDatabasePath } from "../config/cloud-runtime-config";

type ConfigReader = {
  get<T = string>(propertyPath: string): T | undefined;
};

export const cloudEntities = [
  CloudAdminSessionEntity,
  PhoneVerificationSessionEntity,
  EmailVerificationSessionEntity,
  CloudWorldEntity,
  CloudWorldRequestEntity,
  CloudInstanceEntity,
  WorldAccessSessionEntity,
  WaitingSessionSyncTaskEntity,
  WorldLifecycleJobEntity,
  CloudUserEntity,
  CloudUserOAuthIdentityEntity,
  SubscriptionPlanEntity,
  UserSubscriptionEntity,
  InviteCodeEntity,
  InviteRedemptionEntity,
  CloudConfigEntity,
  RevenueSharingPolicyEntity,
  RevenuePayeeEntity,
  RevenueContributionEventEntity,
  RevenueUsageEventEntity,
  RevenueAllocationLedgerEntity,
  RevenueSettlementBatchEntity,
  CloudFeedbackEntity,
  ClientTelemetryEventEntity,
  ClientTelemetryDailyEntity,
  CloudTokenUsageDailyEntity,
  CloudTokenUsageBreakdownDailyEntity,
  CloudTokenUsageBudgetEntity,
  CloudTokenPricingCatalogEntity,
] as const;

export const cloudMigrations = [
  CreateCloudPlatformSchema1776645000000,
  CreateCloudAdminSessionTable1776645600000,
  AddCloudAdminSessionAuditColumns1776646200000,
  AddCloudAdminSessionRevocationMetadata1776647400000,
  CreateWaitingSessionSyncTaskTable1776648600000,
  AddWaitingSessionSyncTaskStatusColumns1776649800000,
  AddActiveWorldLifecycleJobUniqueIndex1776650400000,
  CreateCloudUserAndSubscriptionTables1776651000000,
  CreateInviteAndConfigTables1776651600000,
  SeedDefaultSubscriptionPlansAndConfigs1776652200000,
  CreateRevenueSharingTables1776652800000,
  AddEmailAuth1776653400000,
  CreateCloudFeedbackTable1776654000000,
  MakeCloudUsersPhoneNullable1776654600000,
  UpdateAppPublicBaseUrl1776655200000,
  CreateTelemetryTables1776655800000,
  AddWorldIdToTelemetry1776656400000,
  CreateCloudTokenUsageTables1776657000000,
  CreateCloudUserOAuthIdentities1776657600000,
  AddCloudUserLastLoginIp1776658200000,
];

export function buildCloudDataSourceOptions(config: ConfigReader): DataSourceOptions {
  return {
    type: "better-sqlite3",
    database: resolveCloudDatabasePath(config),
    entities: [...cloudEntities],
    migrations: [...cloudMigrations],
    migrationsRun: true,
    synchronize: false,
    enableWAL: true,
    statementCacheSize: 200,
    prepareDatabase: (db: { pragma: (statement: string) => unknown }) => {
      db.pragma("journal_mode = WAL");
      db.pragma("synchronous = NORMAL");
      db.pragma("busy_timeout = 5000");
      db.pragma("cache_size = -65536");
      db.pragma("temp_store = MEMORY");
      db.pragma("mmap_size = 268435456");
      db.pragma("wal_autocheckpoint = 1000");
    },
  };
}

export function buildCloudTypeOrmOptions(config: ConfigReader): TypeOrmModuleOptions {
  return buildCloudDataSourceOptions(config);
}
