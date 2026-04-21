import { describe, expect, it } from "vitest";
import {
  formatRequestStatusLabel,
  formatProjectedDesiredState,
  formatProjectedWorldStatus,
  getRequestEndpointLockMessage,
  getRequestGuidanceParagraphs,
  getRequestWorkflowDescription,
  isTerminalRequestStatus,
  REQUEST_STATUSES,
  REQUEST_WORKFLOW_CARD_STATUSES,
  requiresRequestApiBaseUrl,
  requiresRequestOpsNote,
} from "../src/lib/request-status-meta";

describe("request status metadata", () => {
  it("keeps request status ordering and workflow-card statuses aligned", () => {
    expect(REQUEST_STATUSES).toEqual([
      "pending",
      "provisioning",
      "active",
      "rejected",
      "disabled",
    ]);
    expect(REQUEST_WORKFLOW_CARD_STATUSES).toEqual([
      "pending",
      "provisioning",
      "rejected",
      "disabled",
    ]);
  });

  it("keeps validation and terminal-state predicates aligned with request semantics", () => {
    expect(requiresRequestApiBaseUrl("pending")).toBe(false);
    expect(requiresRequestApiBaseUrl("provisioning")).toBe(false);
    expect(requiresRequestApiBaseUrl("active")).toBe(true);
    expect(requiresRequestApiBaseUrl("rejected")).toBe(false);
    expect(requiresRequestApiBaseUrl("disabled")).toBe(false);

    expect(requiresRequestOpsNote("pending")).toBe(false);
    expect(requiresRequestOpsNote("provisioning")).toBe(false);
    expect(requiresRequestOpsNote("active")).toBe(false);
    expect(requiresRequestOpsNote("rejected")).toBe(true);
    expect(requiresRequestOpsNote("disabled")).toBe(true);

    expect(isTerminalRequestStatus("pending")).toBe(false);
    expect(isTerminalRequestStatus("provisioning")).toBe(false);
    expect(isTerminalRequestStatus("active")).toBe(false);
    expect(isTerminalRequestStatus("rejected")).toBe(true);
    expect(isTerminalRequestStatus("disabled")).toBe(true);

    expect(getRequestEndpointLockMessage("pending")).toBeNull();
    expect(getRequestEndpointLockMessage("active")).toBeNull();
    expect(getRequestEndpointLockMessage("rejected")).toBe(
      "Endpoint edits are locked while this request is rejected or disabled.",
    );
    expect(getRequestEndpointLockMessage("disabled")).toBe(
      "Endpoint edits are locked while this request is rejected or disabled.",
    );
  });

  it("keeps workflow descriptions and guidance paragraphs aligned with the shared status table", () => {
    expect(getRequestWorkflowDescription("pending")).toBe(
      "Projected queued · desired running",
    );
    expect(getRequestWorkflowDescription("provisioning")).toBe(
      "Projected creating · desired running",
    );
    expect(getRequestWorkflowDescription("active")).toBe(
      "Projected ready · desired running",
    );
    expect(getRequestWorkflowDescription("rejected")).toBe(
      "Projected failed · desired running",
    );
    expect(getRequestWorkflowDescription("disabled")).toBe(
      "Projected disabled · desired sleeping",
    );

    expect(getRequestGuidanceParagraphs()).toEqual([
      "`pending` means the request is still awaiting staff action.",
      "`provisioning` means staff accepted it and the world is being prepared outside of the old orchestration path.",
      "`active` should only be used when the world already has a reachable `apiBaseUrl`.",
      "`rejected` and `disabled` should always be paired with a clear ops note.",
    ]);
  });

  it("formats projected statuses and desired states consistently", () => {
    expect(formatRequestStatusLabel("all")).toBe("All");
    expect(formatRequestStatusLabel("pending")).toBe("Pending");
    expect(formatRequestStatusLabel("provisioning")).toBe("Provisioning");
    expect(formatRequestStatusLabel("active")).toBe("Active");
    expect(formatRequestStatusLabel("rejected")).toBe("Rejected");
    expect(formatRequestStatusLabel("disabled")).toBe("Disabled");
    expect(formatRequestStatusLabel(null)).toBe("Unknown");

    expect(formatProjectedWorldStatus("all")).toBe("All");
    expect(formatProjectedWorldStatus("ready")).toBe("Ready");
    expect(formatProjectedWorldStatus("disabled")).toBe("Disabled");
    expect(formatProjectedWorldStatus(null)).toBe("Unknown");

    expect(formatProjectedDesiredState("all")).toBe("All");
    expect(formatProjectedDesiredState("running")).toBe("Running");
    expect(formatProjectedDesiredState("sleeping")).toBe("Sleeping");
    expect(formatProjectedDesiredState(null)).toBe("Unknown");
  });
});
