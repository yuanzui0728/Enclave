import { describe, expect, it } from "vitest";
import {
  ATTENTION_FILTERS,
  buildWorldsRouteSearch,
  DEFAULT_WORLDS_ROUTE_SEARCH,
  HEALTH_FILTERS,
  POWER_STATE_FILTERS,
  UNASSIGNED_PROVIDER_FILTER,
  validateWorldsRouteSearch,
  WORLD_STATUS_FILTERS,
} from "../src/lib/world-route-search";
import {
  defineRouteSearchNormalizationTests,
  defineRouteSearchStaticContractTest,
} from "./route-search-test-helpers";

describe("world route search", () => {
  defineRouteSearchStaticContractTest({
    description:
      "keeps world filter option ordering aligned with the shared filter tables and defaults",
    expectations: [
      {
        description: "world status filters stay in their expected display order",
        actual: WORLD_STATUS_FILTERS,
        expected: [
          "all",
          "queued",
          "creating",
          "bootstrapping",
          "starting",
          "ready",
          "sleeping",
          "failed",
          "disabled",
        ],
      },
      {
        description: "power-state filters stay in their expected display order",
        actual: POWER_STATE_FILTERS,
        expected: [
          "all",
          "absent",
          "provisioning",
          "running",
          "starting",
          "stopped",
          "stopping",
          "error",
        ],
      },
      {
        description: "attention filters stay in their expected display order",
        actual: ATTENTION_FILTERS,
        expected: ["all", "healthy", "critical", "warning", "info"],
      },
      {
        description: "health filters stay in their expected display order",
        actual: HEALTH_FILTERS,
        expected: ["all", "healthy", "unhealthy", "unknown"],
      },
      {
        description: "unassigned provider filter key stays stable",
        actual: UNASSIGNED_PROVIDER_FILTER,
        expected: "__unassigned__",
      },
      {
        description: "default worlds route search stays stable",
        actual: DEFAULT_WORLDS_ROUTE_SEARCH,
        expected: {
          status: "all",
          provider: "all",
          powerState: "all",
          attention: "all",
          health: "all",
          query: "",
        },
      },
    ],
  });

  defineRouteSearchNormalizationTests({
    build: buildWorldsRouteSearch,
    validate: validateWorldsRouteSearch,
    validBuildCases: [
      {
        description: "trim valid world filters and provider keys",
        input: {
          status: " ready ",
          provider: ` ${UNASSIGNED_PROVIDER_FILTER} `,
          powerState: " running ",
          attention: " warning ",
          health: " unhealthy ",
          query: " +8613800138000 ",
        },
        expected: {
          status: "ready",
          provider: UNASSIGNED_PROVIDER_FILTER,
          powerState: "running",
          attention: "warning",
          health: "unhealthy",
          query: "+8613800138000",
        },
      },
    ],
    invalidBuildCases: [
      {
        description: "fall back for invalid world filters",
        input: {
          status: "deleting",
          provider: "   ",
          powerState: "paused",
          attention: "urgent",
          health: "stale",
        },
        expected: DEFAULT_WORLDS_ROUTE_SEARCH,
      },
      {
        description: "fall back for non-string world filters",
        input: {
          status: null,
          provider: undefined,
          powerState: 123,
          attention: false,
          health: {},
        },
        expected: DEFAULT_WORLDS_ROUTE_SEARCH,
      },
      {
        description: "fall back when no route search is provided",
        input: undefined,
        expected: DEFAULT_WORLDS_ROUTE_SEARCH,
      },
    ],
    validateCases: [
      {
        description: "keep valid validated world filters",
        input: {
          status: "failed",
          provider: "azure",
          powerState: "error",
          attention: "critical",
          health: "unknown",
          ignored: "value",
        },
        expected: {
          status: "failed",
          provider: "azure",
          powerState: "error",
          attention: "critical",
          health: "unknown",
          query: "",
        },
      },
      {
        description: "trim valid world filters and default empty validated values",
        input: {
          status: " sleeping ",
          provider: "",
          powerState: "",
          attention: undefined,
          health: null,
          query: " world-1 ",
        },
        expected: {
          status: "sleeping",
          provider: "all",
          powerState: "all",
          attention: "all",
          health: "all",
          query: "world-1",
        },
      },
    ],
  });
});
