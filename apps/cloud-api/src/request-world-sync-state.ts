import type {
  CloudWorldLifecycleStatus,
  CloudWorldRequestStatus,
} from "@yinjie/contracts";
import {
  getRequestGateState,
  REQUEST_GATE_FAILURE_CODE_BY_STATUS,
} from "./request-gate-state";

export type RequestWorldProjection = {
  worldStatus: CloudWorldLifecycleStatus;
  desiredState: "running" | "sleeping";
};

export type RequestVisibleWorldProjection = RequestWorldProjection & {
  healthStatus: string;
  healthMessage: string;
  failureCode: string | null;
  failureMessage: string | null;
};

export type RequestRecordProjection = {
  displayStatus: string;
  failureReason: string | null;
  projectedWorldStatus: CloudWorldLifecycleStatus;
  projectedDesiredState: "running" | "sleeping";
};

export function getRequestVisibleWorldProjection(
  status: CloudWorldRequestStatus,
  note?: string | null,
): RequestVisibleWorldProjection {
  const normalizedNote = note?.trim();

  switch (status) {
    case "active":
      return {
        worldStatus: "ready",
        desiredState: "running",
        healthStatus: "healthy",
        healthMessage: "人工交付的世界已准备好。",
        failureCode: null,
        failureMessage: null,
      };
    case "disabled": {
      const failureMessage = normalizedNote || "该世界已被停用。";
      return {
        worldStatus: "disabled",
        desiredState: "sleeping",
        healthStatus: "disabled",
        healthMessage: failureMessage,
        failureCode: "manually_disabled",
        failureMessage,
      };
    }
    case "rejected": {
      const failureMessage = normalizedNote || "申请已被拒绝。";
      return {
        worldStatus: "failed",
        desiredState: "running",
        healthStatus: "failed",
        healthMessage: failureMessage,
        failureCode: REQUEST_GATE_FAILURE_CODE_BY_STATUS.rejected,
        failureMessage,
      };
    }
    case "provisioning":
      return {
        worldStatus: "creating",
        desiredState: "running",
        healthStatus: "creating",
        healthMessage: "世界正在创建中。",
        failureCode: null,
        failureMessage: null,
      };
    case "pending":
    default:
      return {
        worldStatus: "queued",
        desiredState: "running",
        healthStatus: "queued",
        healthMessage: "世界已进入创建队列。",
        failureCode: null,
        failureMessage: null,
      };
  }
}

export function getRequestRecordProjection(
  status: CloudWorldRequestStatus,
  note?: string | null,
): RequestRecordProjection {
  const visibleWorldProjection = getRequestVisibleWorldProjection(status, note);

  switch (status) {
    case "pending":
    case "disabled":
    case "rejected": {
      const gateState = getRequestGateState(status, note);
      return {
        displayStatus: gateState.displayStatus,
        failureReason: gateState.failureReason,
        projectedWorldStatus: visibleWorldProjection.worldStatus,
        projectedDesiredState: visibleWorldProjection.desiredState,
      };
    }
    case "active":
    case "provisioning":
    default:
      return {
        displayStatus: visibleWorldProjection.healthMessage,
        failureReason: visibleWorldProjection.failureMessage,
        projectedWorldStatus: visibleWorldProjection.worldStatus,
        projectedDesiredState: visibleWorldProjection.desiredState,
      };
  }
}

export type RequestWorldSyncDecision =
  | { action: "skip" }
  | { action: "sync_gate_placeholder" }
  | { action: "delete_gate_placeholder" }
  | ({
      action: "upsert_visible_world";
    } & RequestWorldProjection);

export function getRequestWorldProjection(
  status: CloudWorldRequestStatus,
): RequestWorldProjection {
  const projection = getRequestVisibleWorldProjection(status);
  return {
    worldStatus: projection.worldStatus,
    desiredState: projection.desiredState,
  };
}

export function getRequestWorldSyncDecision(input: {
  requestStatus: CloudWorldRequestStatus;
  hasWorld: boolean;
  hasGatePlaceholderWorld: boolean;
}): RequestWorldSyncDecision {
  const { requestStatus, hasWorld, hasGatePlaceholderWorld } = input;

  switch (requestStatus) {
    case "pending":
      return hasWorld && hasGatePlaceholderWorld
        ? { action: "sync_gate_placeholder" }
        : { action: "skip" };
    case "disabled":
      if (!hasWorld) {
        return { action: "skip" };
      }
      return hasGatePlaceholderWorld
        ? { action: "sync_gate_placeholder" }
        : {
            action: "upsert_visible_world",
            ...getRequestWorldProjection(requestStatus),
          };
    case "rejected":
      return hasWorld && hasGatePlaceholderWorld
        ? { action: "delete_gate_placeholder" }
        : { action: "skip" };
    case "active":
    case "provisioning":
    default:
      return {
        action: "upsert_visible_world",
        ...getRequestWorldProjection(requestStatus),
      };
  }
}
