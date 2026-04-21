import type { CloudWorldRequestEntity } from "./entities/cloud-world-request.entity";
import { isRequestGatePlaceholderWorld } from "./request-gate-placeholder";

export type RequestPhoneAvailabilityWorld = Parameters<
  typeof isRequestGatePlaceholderWorld
>[0];

export type RequestPhoneAvailabilityRequest = Pick<
  CloudWorldRequestEntity,
  "status"
>;

export type RequestPhoneAvailabilityDecision =
  | "available"
  | "cleanup_rejected_placeholder"
  | "conflict_world"
  | "conflict_request";

export function getRequestPhoneAvailability(params: {
  world?: RequestPhoneAvailabilityWorld | null;
  latestRequest?: RequestPhoneAvailabilityRequest | null;
}): RequestPhoneAvailabilityDecision {
  const { world, latestRequest } = params;

  if (
    world &&
    isRequestGatePlaceholderWorld(world) &&
    (!latestRequest || latestRequest.status === "rejected")
  ) {
    return "cleanup_rejected_placeholder";
  }

  if (world) {
    return "conflict_world";
  }

  if (latestRequest && latestRequest.status !== "rejected") {
    return "conflict_request";
  }

  return "available";
}
