import type { WorldAccessPhase, WorldAccessSessionStatus } from "@yinjie/contracts";
import type { CloudWorldEntity } from "../entities/cloud-world.entity";

export type WorldAccessSnapshot = {
  status: WorldAccessSessionStatus;
  phase: WorldAccessPhase;
  displayStatus: string;
  resolvedApiBaseUrl: string | null;
  retryAfterSeconds: number;
  estimatedWaitSeconds: number | null;
  failureReason: string | null;
};

export function buildWorldAccessSnapshot(
  world: Pick<CloudWorldEntity, "status" | "apiBaseUrl" | "failureMessage" | "healthMessage">,
): WorldAccessSnapshot {
  switch (world.status) {
    case "active":
    case "ready":
      if (!world.apiBaseUrl) {
        return {
          status: "failed",
          phase: "failed",
          displayStatus: "World is missing an API endpoint.",
          resolvedApiBaseUrl: null,
          retryAfterSeconds: 0,
          estimatedWaitSeconds: null,
          failureReason: "The world finished starting but no apiBaseUrl is available yet.",
        };
      }

      return {
        status: "ready",
        phase: "ready",
        displayStatus: "World is ready.",
        resolvedApiBaseUrl: world.apiBaseUrl,
        retryAfterSeconds: 0,
        estimatedWaitSeconds: 0,
        failureReason: null,
      };

    case "starting":
    case "sleeping":
    case "stopping":
      return {
        status: "waiting",
        phase: "starting",
        displayStatus: "Waking the existing world.",
        resolvedApiBaseUrl: null,
        retryAfterSeconds: 2,
        estimatedWaitSeconds: 12,
        failureReason: null,
      };

    case "rejected":
    case "failed":
      return {
        status: "failed",
        phase: "failed",
        displayStatus: "World startup failed.",
        resolvedApiBaseUrl: null,
        retryAfterSeconds: 0,
        estimatedWaitSeconds: null,
        failureReason: world.failureMessage ?? world.healthMessage ?? "The world could not be started.",
      };

    case "disabled":
      return {
        status: "disabled",
        phase: "disabled",
        displayStatus: "World is disabled.",
        resolvedApiBaseUrl: null,
        retryAfterSeconds: 0,
        estimatedWaitSeconds: null,
        failureReason: world.failureMessage ?? "This world is currently disabled by ops.",
      };

    case "deleting":
      return {
        status: "failed",
        phase: "failed",
        displayStatus: "World is being deleted.",
        resolvedApiBaseUrl: null,
        retryAfterSeconds: 0,
        estimatedWaitSeconds: null,
        failureReason: "The world is being deleted and cannot be resumed.",
      };

    case "provisioning":
    case "bootstrapping":
      return {
        status: "waiting",
        phase: "creating",
        displayStatus: "Creating a brand new world.",
        resolvedApiBaseUrl: null,
        retryAfterSeconds: 2,
        estimatedWaitSeconds: 10,
        failureReason: null,
      };

    case "pending":
    case "queued":
    case "creating":
    default:
      return {
        status: "waiting",
        phase: "creating",
        displayStatus: "Creating a brand new world.",
        resolvedApiBaseUrl: null,
        retryAfterSeconds: 2,
        estimatedWaitSeconds: 20,
        failureReason: null,
      };
  }
}
