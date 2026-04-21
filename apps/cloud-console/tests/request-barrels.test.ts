import { describe, expect, it } from "vitest";
import * as requestControls from "../src/components/request-controls";
import { RequestProjectionBadges } from "../src/components/request-projection-badges";
import { RequestProjectionFilterControls } from "../src/components/request-projection-filter-controls";
import { RequestStatusBadge } from "../src/components/request-status-badge";
import { RequestStatusFilterButtons } from "../src/components/request-status-filter-buttons";
import { RequestStatusSelect } from "../src/components/request-status-select";
import * as requestHelpers from "../src/lib/request-helpers";
import * as requestStatusMeta from "../src/lib/request-status-meta";
import * as requestStatusTone from "../src/lib/request-status-tone";

describe("request barrels", () => {
  it("keeps the request-controls barrel aligned with the shared request components", () => {
    expect(Object.keys(requestControls).sort()).toEqual([
      "RequestProjectionBadges",
      "RequestProjectionFilterControls",
      "RequestStatusBadge",
      "RequestStatusFilterButtons",
      "RequestStatusSelect",
    ]);

    expect(requestControls.RequestProjectionBadges).toBe(RequestProjectionBadges);
    expect(requestControls.RequestProjectionFilterControls).toBe(
      RequestProjectionFilterControls,
    );
    expect(requestControls.RequestStatusBadge).toBe(RequestStatusBadge);
    expect(requestControls.RequestStatusFilterButtons).toBe(
      RequestStatusFilterButtons,
    );
    expect(requestControls.RequestStatusSelect).toBe(RequestStatusSelect);
  });

  it("keeps the request-helpers barrel aligned with request status metadata and tones", () => {
    expect(Object.keys(requestHelpers).sort()).toEqual([
      "REQUEST_STATUSES",
      "REQUEST_WORKFLOW_CARD_STATUSES",
      "formatProjectedDesiredState",
      "formatProjectedWorldStatus",
      "formatRequestStatusLabel",
      "getProjectedDesiredStateTone",
      "getProjectedDesiredStateToneStyles",
      "getProjectedWorldStatusTone",
      "getProjectedWorldStatusToneStyles",
      "getRequestEndpointLockMessage",
      "getRequestGuidanceParagraphs",
      "getRequestStatusTone",
      "getRequestStatusToneStyles",
      "getRequestToneStyles",
      "getRequestWorkflowProjection",
      "isRequestWorkflowCardStatus",
      "isTerminalRequestStatus",
      "requiresRequestApiBaseUrl",
      "requiresRequestOpsNote",
    ]);

    expect(requestHelpers.formatRequestStatusLabel).toBe(
      requestStatusMeta.formatRequestStatusLabel,
    );
    expect(requestHelpers.formatProjectedWorldStatus).toBe(
      requestStatusMeta.formatProjectedWorldStatus,
    );
    expect(requestHelpers.formatProjectedDesiredState).toBe(
      requestStatusMeta.formatProjectedDesiredState,
    );
    expect(requestHelpers.getRequestEndpointLockMessage).toBe(
      requestStatusMeta.getRequestEndpointLockMessage,
    );
    expect(requestHelpers.getRequestGuidanceParagraphs).toBe(
      requestStatusMeta.getRequestGuidanceParagraphs,
    );
    expect(requestHelpers.getRequestWorkflowProjection).toBe(
      requestStatusMeta.getRequestWorkflowProjection,
    );
    expect(requestHelpers.isRequestWorkflowCardStatus).toBe(
      requestStatusMeta.isRequestWorkflowCardStatus,
    );
    expect(requestHelpers.isTerminalRequestStatus).toBe(
      requestStatusMeta.isTerminalRequestStatus,
    );
    expect(requestHelpers.requiresRequestApiBaseUrl).toBe(
      requestStatusMeta.requiresRequestApiBaseUrl,
    );
    expect(requestHelpers.requiresRequestOpsNote).toBe(
      requestStatusMeta.requiresRequestOpsNote,
    );
    expect(requestHelpers.REQUEST_STATUSES).toBe(requestStatusMeta.REQUEST_STATUSES);
    expect(requestHelpers.REQUEST_WORKFLOW_CARD_STATUSES).toBe(
      requestStatusMeta.REQUEST_WORKFLOW_CARD_STATUSES,
    );

    expect(requestHelpers.getRequestStatusTone).toBe(
      requestStatusTone.getRequestStatusTone,
    );
    expect(requestHelpers.getRequestStatusToneStyles).toBe(
      requestStatusTone.getRequestStatusToneStyles,
    );
    expect(requestHelpers.getRequestToneStyles).toBe(
      requestStatusTone.getRequestToneStyles,
    );
    expect(requestHelpers.getProjectedWorldStatusTone).toBe(
      requestStatusTone.getProjectedWorldStatusTone,
    );
    expect(requestHelpers.getProjectedWorldStatusToneStyles).toBe(
      requestStatusTone.getProjectedWorldStatusToneStyles,
    );
    expect(requestHelpers.getProjectedDesiredStateTone).toBe(
      requestStatusTone.getProjectedDesiredStateTone,
    );
    expect(requestHelpers.getProjectedDesiredStateToneStyles).toBe(
      requestStatusTone.getProjectedDesiredStateToneStyles,
    );
  });
});
