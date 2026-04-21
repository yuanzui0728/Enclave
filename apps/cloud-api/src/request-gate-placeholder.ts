import { CloudWorldEntity } from "./entities/cloud-world.entity";
import { isRequestGateFailureCode } from "./request-gate-state";

export function isRequestGatePlaceholderWorld(
  world: Pick<
    CloudWorldEntity,
    | "status"
    | "failureCode"
    | "apiBaseUrl"
    | "adminUrl"
    | "lastAccessedAt"
    | "lastInteractiveAt"
    | "lastBootedAt"
    | "lastHeartbeatAt"
    | "lastSuspendedAt"
  >,
) {
  return (
    world.status === "disabled" &&
    isRequestGateFailureCode(world.failureCode) &&
    !world.apiBaseUrl &&
    !world.adminUrl &&
    !world.lastAccessedAt &&
    !world.lastInteractiveAt &&
    !world.lastBootedAt &&
    !world.lastHeartbeatAt &&
    !world.lastSuspendedAt
  );
}
