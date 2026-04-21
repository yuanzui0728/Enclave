import { describe, expect, it } from "vitest";
import { REQUEST_STATUSES } from "../src/lib/request-status-meta";
import {
  buildRequestsRouteSearch,
  DEFAULT_REQUESTS_ROUTE_SEARCH,
  REQUEST_PROJECTED_DESIRED_STATE_FILTERS,
  REQUEST_PROJECTED_WORLD_STATUS_FILTERS,
  REQUEST_STATUS_FILTERS,
  validateRequestsRouteSearch,
} from "../src/lib/request-route-search";
import {
  defineRouteSearchNormalizationTests,
  defineRouteSearchStaticContractTest,
} from "./route-search-test-helpers";

describe("request route search", () => {
  defineRouteSearchStaticContractTest({
    description:
      "keeps the request filter option ordering aligned with the shared request status table",
    expectations: [
      {
        description: "status filters include all plus shared request statuses",
        actual: REQUEST_STATUS_FILTERS,
        expected: ["all", ...REQUEST_STATUSES],
      },
      {
        description: "projected world filters stay in their expected display order",
        actual: REQUEST_PROJECTED_WORLD_STATUS_FILTERS,
        expected: ["all", "queued", "creating", "ready", "failed", "disabled"],
      },
      {
        description: "projected desired state filters stay in their expected display order",
        actual: REQUEST_PROJECTED_DESIRED_STATE_FILTERS,
        expected: ["all", "running", "sleeping"],
      },
      {
        description: "default request route search stays stable",
        actual: DEFAULT_REQUESTS_ROUTE_SEARCH,
        expected: {
          status: "all",
          projectedWorldStatus: "all",
          desiredState: "all",
        },
      },
    ],
  });

  defineRouteSearchNormalizationTests({
    build: buildRequestsRouteSearch,
    validate: validateRequestsRouteSearch,
    validBuildCases: [
      {
        description: "trim surrounding whitespace from valid request filters",
        input: {
          status: " pending ",
          projectedWorldStatus: " ready ",
          desiredState: " sleeping ",
        },
        expected: {
          status: "pending",
          projectedWorldStatus: "ready",
          desiredState: "sleeping",
        },
      },
    ],
    invalidBuildCases: [
      {
        description: "fall back for unknown string filters",
        input: {
          status: "unknown",
          projectedWorldStatus: "bootstrapping",
          desiredState: "queued",
        },
        expected: DEFAULT_REQUESTS_ROUTE_SEARCH,
      },
      {
        description: "fall back for non-string filters",
        input: {
          status: null,
          projectedWorldStatus: 123,
          desiredState: false,
        },
        expected: DEFAULT_REQUESTS_ROUTE_SEARCH,
      },
      {
        description: "fall back when no route search is provided",
        input: undefined,
        expected: DEFAULT_REQUESTS_ROUTE_SEARCH,
      },
    ],
    validateCases: [
      {
        description: "keep valid validated request filters",
        input: {
          status: "disabled",
          projectedWorldStatus: "disabled",
          desiredState: "sleeping",
          ignored: "value",
        },
        expected: {
          status: "disabled",
          projectedWorldStatus: "disabled",
          desiredState: "sleeping",
        },
      },
      {
        description: "trim valid request filters and default empty validated values",
        input: {
          status: " active ",
          projectedWorldStatus: "",
          desiredState: undefined,
        },
        expected: {
          status: "active",
          projectedWorldStatus: "all",
          desiredState: "all",
        },
      },
    ],
  });
});
